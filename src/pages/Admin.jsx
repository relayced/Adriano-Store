import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const ADMIN_EMAILS = ["ralphdenverdimapilis@gmail.com"]; // optional fallback
const ORDER_STATUSES = ["Pending", "Paid", "Shipped", "Completed", "Cancelled"];

const CATEGORY_OPTIONS = ["Notebooks", "Writing", "Accessories", "Paintings", "Other…"];

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function makeFileName(file) {
  const ext = (file?.name || "png").split(".").pop();
  const id = (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
  ).replace(/\./g, "");
  return `${id}.${ext}`;
}

export default function Admin() {
  const navigate = useNavigate();

  // auth/admin
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // tabs
  const [tab, setTab] = useState("products"); // "products" | "orders"

  // products
  const [products, setProducts] = useState([]);
  const [pLoading, setPLoading] = useState(true);
  const [pMsg, setPMsg] = useState("");
  const [pSearch, setPSearch] = useState("");

  // ✅ category is dropdown now
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    category: "", // must choose
    customCategory: "",
    stock: "0",
  });

  // image files
  const [imageFile, setImageFile] = useState(null);

  // edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editImageFile, setEditImageFile] = useState(null);

  // orders
  const [orders, setOrders] = useState([]);
  const [oLoading, setOLoading] = useState(true);
  const [oMsg, setOMsg] = useState("");
  const [oSearch, setOSearch] = useState("");

  // ---------- ADMIN CHECK ----------
  useEffect(() => {
    let alive = true;

    async function checkAdmin() {
      setCheckingAdmin(true);

      const { data, error } = await supabase.auth.getUser();
      const user = data?.user;

      if (!alive) return;
      if (error) console.error("auth.getUser error:", error);

      if (!user) {
        setIsAdmin(false);
        setCheckingAdmin(false);
        return;
      }

      const emailNorm = (user.email || "").trim().toLowerCase();
      const allowlist = ADMIN_EMAILS.map((e) => (e || "").trim().toLowerCase());

      let admin = allowlist.includes(emailNorm);

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (pErr) console.error("profiles select error:", pErr);

      const roleNorm = String(profile?.role || "").trim().toLowerCase();
      if (roleNorm === "admin") admin = true;

      setIsAdmin(admin);
      setCheckingAdmin(false);
    }

    checkAdmin();
    return () => {
      alive = false;
    };
  }, []);

  // ---------- STORAGE UPLOAD ----------
  async function uploadProductImage(file) {
    if (!file) return null;

    const fileName = makeFileName(file);
    const filePath = `products/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(filePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("product-images").getPublicUrl(filePath);
    return data?.publicUrl || null;
  }

  // ---------- LOADERS ----------
  async function refreshProducts() {
    setPLoading(true);
    setPMsg("");

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("id", { ascending: false });

    if (error) setPMsg(error.message);
    setProducts(data || []);
    setPLoading(false);
  }

  async function refreshOrders() {
    setOLoading(true);
    setOMsg("");

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) setOMsg(error.message);
    setOrders(data || []);
    setOLoading(false);
  }

  useEffect(() => {
    if (!isAdmin) return;
    refreshProducts();
    refreshOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // ---------- PRODUCTS ----------
  function resolveCategory(category, customCategory) {
    if (category === "Other…") return String(customCategory || "").trim();
    return String(category || "").trim();
  }

  async function addProduct(e) {
    e.preventDefault();
    setPMsg("");

    const finalCategory = resolveCategory(form.category, form.customCategory);
    if (!finalCategory) {
      setPMsg("Please select a category (or type your custom category).");
      return;
    }

    try {
      // Upload image if picked
      let imageUrl = null;
      if (imageFile) {
        imageUrl = await uploadProductImage(imageFile);
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: finalCategory,
        price: num(form.price),
        stock: num(form.stock),
        image_url: imageUrl, // ✅ no URL field now
      };

      const { error } = await supabase.from("products").insert(payload);
      if (error) {
        setPMsg(error.message);
        return;
      }

      // reset
      setForm({
        name: "",
        description: "",
        price: "",
        category: "",
        customCategory: "",
        stock: "0",
      });
      setImageFile(null);

      // ✅ newest product will be New Arrival in Home (Home pulls latest id)
      refreshProducts();
    } catch (err) {
      console.error(err);
      setPMsg(err?.message || "Image upload failed.");
    }
  }

  async function removeProduct(id) {
    if (!confirm("Delete this product?")) return;
    setPMsg("");

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      setPMsg(error.message);
      return;
    }
    refreshProducts();
  }

  async function quickStock(id, delta) {
    setPMsg("");
    const p = products.find((x) => x.id === id);
    if (!p) return;

    const newStock = Math.max(0, num(p.stock) + delta);

    const { error } = await supabase.from("products").update({ stock: newStock }).eq("id", id);
    if (error) {
      setPMsg(error.message);
      return;
    }
    refreshProducts();
  }

  function openEdit(p) {
    setEditForm({
      ...p,
      category: String(p.category || ""),
      customCategory: "",
    });
    setEditImageFile(null);
    setEditOpen(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editForm) return;

    setPMsg("");

    const finalCategory = resolveCategory(editForm.category, editForm.customCategory);
    if (!finalCategory) {
      setPMsg("Please select a category (or type your custom category).");
      return;
    }

    try {
      let imageUrl = editForm.image_url || null;
      if (editImageFile) {
        imageUrl = await uploadProductImage(editImageFile);
      }

      const payload = {
        name: String(editForm.name || "").trim(),
        description: String(editForm.description || "").trim(),
        category: finalCategory,
        price: num(editForm.price),
        stock: num(editForm.stock),
        image_url: imageUrl,
      };

      const { error } = await supabase.from("products").update(payload).eq("id", editForm.id);
      if (error) {
        setPMsg(error.message);
        return;
      }

      setEditOpen(false);
      setEditForm(null);
      setEditImageFile(null);
      refreshProducts();
    } catch (err) {
      console.error(err);
      setPMsg(err?.message || "Image upload failed.");
    }
  }

  // ---------- ORDERS ----------
  const filteredOrders = useMemo(() => {
    const q = oSearch.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => JSON.stringify(o).toLowerCase().includes(q));
  }, [orders, oSearch]);

  async function updateOrderStatus(orderId, newStatus) {
  setOMsg("");

  const { error } = await supabase
    .from("orders")
    .update({ status: newStatus })
    .eq("id", orderId);

  if (error) {
    setOMsg(error.message);
    return;
  }

  refreshOrders();
}

  const filteredProducts = useMemo(() => {
    const q = pSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const hay = [p.name, p.description, p.category].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [products, pSearch]);

  // ---------- UI ----------
  if (checkingAdmin) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-gray-600">Checking admin access…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="text-2xl font-bold">Admin</h2>
        <p className="mt-2 text-gray-600">You don’t have access to this page.</p>
        <div className="mt-4 flex gap-2">
          <Link className="px-4 py-2 rounded-lg border hover:bg-gray-50" to="/">
            Go home
          </Link>
          <button
            className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90"
            onClick={() => navigate("/profile")}
          >
            Profile
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Admin Dashboard</h2>
          <p className="mt-1 text-gray-600">Manage products and orders.</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setTab("products")}
            className={`px-3 py-2 text-sm rounded-lg border ${
              tab === "products" ? "bg-black text-white border-black" : "hover:bg-gray-50"
            }`}
          >
            Products
          </button>
          <button
            onClick={() => setTab("orders")}
            className={`px-3 py-2 text-sm rounded-lg border ${
              tab === "orders" ? "bg-black text-white border-black" : "hover:bg-gray-50"
            }`}
          >
            Orders
          </button>
        </div>
      </div>

      {/* PRODUCTS TAB */}
      {tab === "products" && (
        <>
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative">
              <input
                value={pSearch}
                onChange={(e) => setPSearch(e.target.value)}
                placeholder="Search products…"
                className="w-full sm:w-80 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring"
              />
              {pSearch && (
                <button
                  type="button"
                  onClick={() => setPSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={refreshProducts}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>

          {/* ✅ ADD PRODUCT FORM */}
          <form onSubmit={addProduct} className="mt-4 border rounded-xl p-6 space-y-3 bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Product name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />

              {/* ✅ CATEGORY DROPDOWN */}
              <select
                className="border rounded-lg px-3 py-2 bg-white"
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value, customCategory: "" })
                }
                required
              >
                <option value="" disabled>
                  Select category…
                </option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* ✅ only shows when "Other…" */}
            {form.category === "Other…" && (
              <input
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Type your category…"
                value={form.customCategory}
                onChange={(e) => setForm({ ...form, customCategory: e.target.value })}
                required
              />
            )}

            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Price"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                required
              />
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Stock"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                required
              />

              {/* ✅ IMAGE UPLOAD (NO URL FIELD) */}
              <input
                type="file"
                accept="image/*"
                className="border rounded-lg px-3 py-2"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
            </div>

            {imageFile && (
              <p className="text-xs text-gray-600">
                Selected image: <span className="font-semibold">{imageFile.name}</span>
              </p>
            )}

            <button className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90">
              Add product
            </button>

            {pMsg && <p className="text-sm text-red-600">{pMsg}</p>}
          </form>

          {/* PRODUCTS GRID */}
          {pLoading ? (
            <p className="mt-6 text-gray-600">Loading products…</p>
          ) : (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((p) => (
                <div key={p.id} className="border rounded-xl overflow-hidden bg-white">
                  <div className="h-36 bg-gray-100 flex items-center justify-center overflow-hidden">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm text-gray-400">No image</span>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="text-xs text-gray-500">{p.category}</div>
                    <div className="mt-1 font-semibold">{p.name}</div>
                    <div className="mt-1 text-sm text-gray-600 line-clamp-2">
                      {p.description || "—"}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="font-semibold">₱{num(p.price).toFixed(2)}</div>
                      <div className="text-xs text-gray-500">Stock: {num(p.stock)}</div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => quickStock(p.id, -1)}
                        className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                      >
                        -1 stock
                      </button>
                      <button
                        type="button"
                        onClick={() => quickStock(p.id, +1)}
                        className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                      >
                        +1 stock
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeProduct(p.id)}
                        className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {filteredProducts.length === 0 && <p className="text-gray-600">No products found.</p>}
            </div>
          )}

          {/* EDIT MODAL */}
          {editOpen && editForm && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
              <div className="w-full max-w-lg bg-white rounded-2xl border shadow-sm p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Edit product</h3>
                  <button
                    onClick={() => {
                      setEditOpen(false);
                      setEditForm(null);
                      setEditImageFile(null);
                    }}
                    className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>

                <form onSubmit={saveEdit} className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      className="border rounded-lg px-3 py-2"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="Name"
                      required
                    />

                    {/* ✅ CATEGORY DROPDOWN */}
                    <select
                      className="border rounded-lg px-3 py-2 bg-white"
                      value={editForm.category}
                      onChange={(e) =>
                        setEditForm({ ...editForm, category: e.target.value, customCategory: "" })
                      }
                      required
                    >
                      <option value="" disabled>
                        Select category…
                      </option>
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  {editForm.category === "Other…" && (
                    <input
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="Type your category…"
                      value={editForm.customCategory}
                      onChange={(e) => setEditForm({ ...editForm, customCategory: e.target.value })}
                      required
                    />
                  )}

                  <textarea
                    className="w-full border rounded-lg px-3 py-2 min-h-22.5"
                    value={editForm.description || ""}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    placeholder="Description"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      className="border rounded-lg px-3 py-2"
                      value={editForm.price}
                      onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                      placeholder="Price"
                      required
                    />
                    <input
                      className="border rounded-lg px-3 py-2"
                      value={editForm.stock}
                      onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })}
                      placeholder="Stock"
                      required
                    />

                    {/* ✅ UPLOAD NEW IMAGE */}
                    <input
                      type="file"
                      accept="image/*"
                      className="border rounded-lg px-3 py-2"
                      onChange={(e) => setEditImageFile(e.target.files?.[0] || null)}
                    />
                  </div>

                  {editImageFile && (
                    <p className="text-xs text-gray-600">
                      Selected new image: <span className="font-semibold">{editImageFile.name}</span>
                    </p>
                  )}

                  <button className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90">
                    Save changes
                  </button>
                </form>

                {pMsg && <p className="mt-3 text-sm text-red-600">{pMsg}</p>}
              </div>
            </div>
          )}
        </>
      )}

      {/* ORDERS TAB */}
      {tab === "orders" && (
        <>
          <div className="mt-6 flex items-center gap-2">
            <button
              onClick={refreshOrders}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
            >
              Refresh
            </button>
            {oMsg && <p className="text-sm text-red-600">{oMsg}</p>}
          </div>

          {oLoading ? (
            <p className="mt-6 text-gray-600">Loading orders…</p>
          ) : (
            <div className="mt-6 space-y-3">
              {filteredOrders.map((o) => (
                <div key={o.id} className="border rounded-xl p-4 bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">Order #{o.id}</div>
                      <div className="text-sm text-gray-600 break-all">
                        User: {o.user_id || "—"}
                      </div>
                      <div className="text-sm text-gray-600">
                        Date: {o.created_at ? new Date(o.created_at).toLocaleString() : "—"}
                      </div>
                    </div>

                    <div className="sm:text-right">
                      <div className="font-semibold">Total: ₱{num(o.total).toFixed(2)}</div>

                      <div className="mt-2">
                        <label className="text-xs text-gray-500">Status</label>
                        <select
                          className="mt-1 w-full sm:w-48 border rounded-lg px-3 py-2 text-sm"
                          value={o.status || "Pending"}
                          onChange={(e) => updateOrderStatus(o.id, e.target.value)}
                        >
                          {ORDER_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {filteredOrders.length === 0 && <p className="text-gray-600">No orders found.</p>}
            </div>
          )}
        </>
      )}
    </main>
  );
}
