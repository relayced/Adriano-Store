import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const ORDER_STATUSES = ["placed", "Pending", "Paid", "Shipped", "Completed", "Cancelled"];
const PRODUCT_IMG_BUCKET = "product-images";
const DEFAULT_CATEGORIES = ["Notebooks", "Pens", "Pencils", "Paper", "Accessories", "Paintings"];

function money(n) {
  return `₱${Number(n || 0).toFixed(2)}`;
}
function safeLower(x) {
  return String(x || "").toLowerCase();
}
function toStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function pickFirstString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}
function getOrderUserId(o) {
  return (
    o?.user_id ??
    o?.customer_id ??
    o?.profile_id ??
    o?.user_uuid ??
    o?.user ??
    o?.profile ??
    null
  );
}
function orderCustomerName(o) {
  const v =
    o?.customer_name ??
    o?.customer_full_name ??
    o?.customer_fullname ??
    o?.full_name ??
    o?.name ??
    o?.buyer_name ??
    o?.customer ??
    "";
  return typeof v === "string" ? v : "";
}
function orderCustomerPhone(o) {
  const v =
    o?.customer_phone ??
    o?.phone ??
    o?.contact ??
    o?.contact_no ??
    o?.contact_number ??
    "";
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}
function orderAddress(o) {
  const v = o?.address ?? o?.shipping_address ?? o?.delivery_address ?? "";
  return typeof v === "string" ? v : "";
}

function normalizeItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === "string") {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getProductNamesFor(o) {
  const items = normalizeItems(o?.items);
  if (items.length === 0) return "No items";
  const names = items.map(item => item.name || "Item").slice(0, 2);
  const displayStr = names.join(", ");
  return items.length > 2 ? `${displayStr} +${items.length - 2} more` : displayStr;
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 text-gray-700"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

export default function Admin() {
  const nav = useNavigate();

  const [tab, setTab] = useState("products"); // products | orders | users
  const [msg, setMsg] = useState({ type: "", text: "" });

  // auth + role
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [me, setMe] = useState(null);

  // products
  const [products, setProducts] = useState([]);
  const [pLoading, setPLoading] = useState(false);
  const [pSearch, setPSearch] = useState("");

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    category: "",
    stock: "0",
    image_url: "",
  });

  const [productImageFile, setProductImageFile] = useState(null);
  const [productImagePreview, setProductImagePreview] = useState("");
  const [uploadingProductImage, setUploadingProductImage] = useState(false);

  // edit mode
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingOriginalImageUrl, setEditingOriginalImageUrl] = useState("");

  useEffect(() => {
    if (!productImageFile) {
      setProductImagePreview("");
      return;
    }
    const obj = URL.createObjectURL(productImageFile);
    setProductImagePreview(obj);
    return () => URL.revokeObjectURL(obj);
  }, [productImageFile]);

  // orders
  const [orders, setOrders] = useState([]);
  const [oLoading, setOLoading] = useState(false);
  const [oSearch, setOSearch] = useState("");
  const [viewOrder, setViewOrder] = useState(null);

  // users / profiles
  const [users, setUsers] = useState([]);
  const [uLoading, setULoading] = useState(false);
  const [uSearch, setUSearch] = useState("");
  const [profileNameById, setProfileNameById] = useState({});
  const [profilesById, setProfilesById] = useState({});

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setMsg({ type: "", text: "" });

        const { data: sess } = await supabase.auth.getSession();
        const session = sess?.session;
        if (!session) {
          nav("/login");
          return;
        }

        setMe(session.user);

        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("id, role")
          .eq("id", session.user.id)
          .maybeSingle();

        if (pErr) {
          console.error("profile read error", pErr);
          setMsg(pErr.message);
          setIsAdmin(false);
          return;
        }

        const admin = safeLower(prof?.role) === "admin";
        setIsAdmin(admin);

        if (!admin) {
          setMsg({ type: "error", text: "You are not authorized to view this page." });
          return;
        }

        refreshAll();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshAll() {
    await Promise.all([refreshProducts(), refreshUsers(), refreshOrders()]);
  }

  async function refresh() {
    if (tab === "products") return refreshProducts();
    if (tab === "orders") return refreshOrders();
    if (tab === "users") return refreshUsers();
  }

  async function refreshProducts() {
    try {
      setPLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, name, description, price, category, stock, image_url")
        .order("id", { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (e) {
      console.error(e);
      setMsg(e.message);
    } finally {
      setPLoading(false);
    }
  }

  async function refreshUsers() {
    try {
      setULoading(true);
      setMsg("");
      
      const timeoutMs = 5000;
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout")), timeoutMs)
      );

      const query = supabase
        .from("profiles")
        .select("id, role, full_name, contact_number, address, created_at")
        .order("created_at", { ascending: false });

      const { data, error } = await Promise.race([query, timeout]);

      if (error) throw error;

      const list = (data || []).map((u) => ({
        ...u,
        name: pickFirstString(u.full_name) || "—",
      }));

      const mapName = {};
      const mapFull = {};
      for (const u of list) {
        mapName[u.id] = u.name;
        mapFull[u.id] = u;
      }
      setUsers(list);
      setProfileNameById(mapName);
      setProfilesById(mapFull);
    } catch (e) {
      console.error("refreshUsers error:", e);
      setMsg({ type: "error", text: e.message || "Failed to load users" });
    } finally {
      setULoading(false);
    }
  }

  async function refreshOrders() {
    try {
      setOLoading(true);
      setMsg("");

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;

      const list = data || [];
      setOrders(list);

      const ids = Array.from(
        new Set(
          list
            .map((o) => getOrderUserId(o))
            .filter((v) => typeof v === "string" && v.length > 0)
        )
      );

      if (ids.length > 0) {
        const { data: profs, error: perr } = await supabase
          .from("profiles")
          .select("id, full_name, contact_number, address")
          .in("id", ids);

        if (!perr && Array.isArray(profs)) {
          setProfileNameById((prev) => {
            const next = { ...prev };
            for (const p of profs) {
              next[p.id] = pickFirstString(p.full_name) || prev[p.id] || "—";
            }
            return next;
          });
          setProfilesById((prev) => {
            const next = { ...prev };
            for (const p of profs) {
              next[p.id] = { ...prev[p.id], ...p };
            }
            return next;
          });
        }
      }
    } catch (e) {
      console.error(e);
      setMsg(e.message);
    } finally {
      setOLoading(false);
    }
  }

  async function uploadProductImage(file) {
    if (!file) return "";

    setUploadingProductImage(true);
    try {
      const safeName = (file.name || "image.jpg").replace(/\s+/g, "_");
      const path = `products/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(PRODUCT_IMG_BUCKET)
        .upload(path, file, { upsert: false });

      if (upErr) throw new Error(upErr.message);

      const { data } = supabase.storage.from(PRODUCT_IMG_BUCKET).getPublicUrl(path);
      const url = data?.publicUrl || "";
      if (!url) throw new Error("Failed to get public URL for uploaded image.");
      return url;
    } finally {
      setUploadingProductImage(false);
    }
  }

  function startEditProduct(p) {
    setMsg("");
    setEditingProductId(p.id);
    setEditingOriginalImageUrl(p.image_url || "");

    setForm({
      name: p.name || "",
      description: p.description || "",
      price: String(p.price ?? ""),
      category: p.category || "",
      stock: String(p.stock ?? "0"),
      image_url: p.image_url || "",
    });

    setProductImageFile(null);
    setProductImagePreview("");
  }

  function cancelEdit() {
    setEditingProductId(null);
    setEditingOriginalImageUrl("");
    setMsg("");

    setForm({
      name: "",
      description: "",
      price: "",
      category: "",
      stock: "0",
      image_url: "",
    });

    setProductImageFile(null);
    setProductImagePreview("");
  }

  async function addProduct(e) {
    e.preventDefault();
    setMsg("");

    try {
      let finalImageUrl = form.image_url.trim() || null;

      if (editingProductId && !finalImageUrl && !productImageFile) {
        finalImageUrl = editingOriginalImageUrl || null;
      }

      if (productImageFile) {
        finalImageUrl = await uploadProductImage(productImageFile);
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        price: Number(form.price),
        stock: Number(form.stock),
        image_url: finalImageUrl,
      };

      const { error } = editingProductId
        ? await supabase.from("products").update(payload).eq("id", editingProductId)
        : await supabase.from("products").insert(payload);

      if (error) return setMsg({ type: "error", text: error.message });

      setForm({
        name: "",
        description: "",
        price: "",
        category: "",
        stock: "0",
        image_url: "",
      });

      setProductImageFile(null);
      setProductImagePreview("");

      setEditingProductId(null);
      setEditingOriginalImageUrl("");

      refreshProducts();
    } catch (err) {
      setMsg({ type: "error", text: err?.message || "Failed to save product." });
    }
  }

  async function removeProduct(id) {
    if (!confirm("Delete this product?")) return;
    setMsg("");
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;

      if (editingProductId === id) cancelEdit();
      refreshProducts();
    } catch (e) {
      console.error(e);
      setMsg(e.message);
    }
  }

  async function updateOrderStatus(orderId, status) {
    setMsg({ type: "", text: "" });
    try {
      const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
      if (error) throw error;
      refreshOrders();
    } catch (e) {
      console.error(e);
      setMsg({ type: "error", text: e.message });
    }
  }

  async function toggleAdmin(userId, makeAdmin) {
    setMsg({ type: "", text: "" });
    try {
      const nextRole = makeAdmin ? "admin" : "user";

      const { error } = await supabase
        .from("profiles")
        .update({ role: nextRole })
        .eq("id", userId);

      if (error) throw error;

      console.log(`User ${userId} role updated to ${nextRole}`);

      // Refresh the users list to show updated role
      await refreshUsers();

      setMsg({ type: "success", text: `User role changed to ${nextRole}` });
    } catch (e) {
      console.error("toggleAdmin error:", e);
      setMsg({ type: "error", text: e.message || "Failed to update user role" });
    }
  }

  function resolvedOrderName(o) {
    const orderUserId = getOrderUserId(o);
    const fromProfile = typeof orderUserId === "string" ? profileNameById[orderUserId] : "";
    const fromOrder = orderCustomerName(o);
    return pickFirstString(toStr(fromProfile), toStr(fromOrder)) || "—";
  }

  function resolvedOrderPhone(o) {
    const orderUserId = getOrderUserId(o);
    const prof = typeof orderUserId === "string" ? profilesById[orderUserId] : null;
    const fromProfile = prof?.contact_number;
    const fromOrder = orderCustomerPhone(o);
    return pickFirstString(toStr(fromProfile), toStr(fromOrder)) || "—";
  }

  function resolvedOrderAddress(o) {
    const orderUserId = getOrderUserId(o);
    const prof = typeof orderUserId === "string" ? profilesById[orderUserId] : null;
    const fromProfile = prof?.address;
    const fromOrder = orderAddress(o);
    return pickFirstString(toStr(fromProfile), toStr(fromOrder)) || "—";
  }

  const filteredProducts = useMemo(() => {
    const q = safeLower(pSearch).trim();
    if (!q) return products;
    return products.filter((p) => {
      return (
        safeLower(p.name).includes(q) ||
        safeLower(p.description).includes(q) ||
        safeLower(p.category).includes(q)
      );
    });
  }, [products, pSearch]);

  const categories = useMemo(() => {
    const dbCats = Array.from(
      new Set(products.map((p) => p.category).filter(Boolean))
    );
    const allCats = Array.from(new Set([...DEFAULT_CATEGORIES, ...dbCats])).filter(c => c !== "Writing").sort();
    return allCats;
  }, [products]);

  const filteredOrders = useMemo(() => {
    const q = safeLower(oSearch).trim();
    if (!q) return orders;

    return orders.filter((o) => {
      const name = safeLower(resolvedOrderName(o));
      const phone = safeLower(resolvedOrderPhone(o));
      const addr = safeLower(resolvedOrderAddress(o));
      return (
        safeLower(o?.status).includes(q) ||
        name.includes(q) ||
        phone.includes(q) ||
        addr.includes(q) ||
        String(o?.id).includes(q)
      );
    });
  }, [orders, oSearch, profileNameById, profilesById]);

  const filteredUsers = useMemo(() => {
    const q = safeLower(uSearch).trim();
    if (!q) return users;
    return users.filter((u) => {
      return (
        safeLower(u.name).includes(q) ||
        safeLower(u.full_name).includes(q) ||
        safeLower(u.role).includes(q) ||
        safeLower(u.contact_number).includes(q) ||
        safeLower(u.address).includes(q) ||
        String(u.id).includes(q)
      );
    });
  }, [users, uSearch]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-700">
        Loading…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border rounded-2xl shadow-sm p-6">
          <h1 className="text-xl font-bold">Admin</h1>
          <p className="mt-2 text-gray-700 text-sm">{msg || "Not authorized."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-gray-600">
              Signed in as <span className="font-medium">{me?.email}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              nav("/login");
            }}
            className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("products")}
            className={`px-4 py-2 rounded-lg border ${
              tab === "products" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
            }`}
          >
            Products
          </button>
          <button
            type="button"
            onClick={() => setTab("orders")}
            className={`px-4 py-2 rounded-lg border ${
              tab === "orders" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
            }`}
          >
            Orders
          </button>
          <button
            type="button"
            onClick={() => setTab("users")}
            className={`px-4 py-2 rounded-lg border ${
              tab === "users" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
            }`}
          >
            Users
          </button>

          <button
            type="button"
            onClick={refresh}
            className="ml-auto px-4 py-2 rounded-lg border bg-white hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {/* PRODUCTS */}
        {tab === "products" && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
            <div className="bg-white border rounded-2xl shadow-sm p-5">
              <h2 className="text-lg font-bold">{editingProductId ? "Edit product" : "Add product"}</h2>

              <form className="mt-4 space-y-3" onSubmit={addProduct}>
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-lg border"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-lg border min-h-22.5"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Price</label>
                    <input
                      value={form.price}
                      onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Stock</label>
                    <input
                      value={form.stock}
                      onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border"
                      type="number"
                      step="1"
                      min="0"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-lg border bg-white"
                  >
                    {categories.filter(c => c !== "All").map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Image URL (optional)</label>
                  <input
                    value={form.image_url}
                    onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-lg border"
                    placeholder="https://..."
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Image (Choose File)</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-1 block w-full text-sm rounded-lg border border-gray-300 bg-white shadow-sm
                           file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0
                           file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                    onChange={(e) => setProductImageFile(e.target.files?.[0] || null)}
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-60"
                    disabled={uploadingProductImage}
                  >
                    {uploadingProductImage
                      ? "Uploading image…"
                      : editingProductId
                      ? "Update product"
                      : "Add product"}
                  </button>

                  {editingProductId && (
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="px-4 py-2 rounded-lg border hover:bg-gray-50"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>

                {msg.text && (
                  <p className={`text-sm font-semibold ${
                    msg.type === "success" ? "text-green-600" : "text-red-600"
                  }`}>
                    {msg.text}
                  </p>
                )}
              </form>
            </div>

            <div className="bg-white border rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Products</h2>
                <input
                  value={pSearch}
                  onChange={(e) => setPSearch(e.target.value)}
                  placeholder="Search products..."
                  className="px-3 py-2 rounded-lg border w-64 max-w-full"
                />
              </div>

              {pLoading ? (
                <div className="py-10 text-center text-gray-600">Loading products…</div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-10 text-center text-gray-600">No products found.</div>
              ) : (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
                  {filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      className="w-full max-w-sm border rounded-2xl overflow-hidden bg-white shadow-sm flex flex-col"
                    >
                      <div className="h-40 bg-gray-100 flex items-center justify-center overflow-hidden">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm text-gray-500">No image</span>
                        )}
                      </div>

                      <div className="p-4 flex flex-col flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold leading-tight truncate">{p.name}</h3>
                            <p className="text-xs text-gray-600 mt-1 truncate">{p.category}</p>
                          </div>
                          <div className="text-xs text-gray-600 shrink-0">Stock: {p.stock ?? 0}</div>
                        </div>

                        {p.description && (
                          <p className="mt-2 text-sm text-gray-700 line-clamp-3">{p.description}</p>
                        )}

                        <div className="mt-auto pt-3 flex items-center justify-between">
                          <div className="font-semibold">{money(p.price)}</div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEditProduct(p)}
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

                        <div className="mt-2 text-xs text-gray-500">ID: {p.id}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ORDERS */}
        {tab === "orders" && (
          <div className="mt-6 bg-white border rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Orders</h2>
              <input
                value={oSearch}
                onChange={(e) => setOSearch(e.target.value)}
                placeholder="Search orders..."
                className="px-3 py-2 rounded-lg border w-64 max-w-full"
              />
            </div>

            {oLoading ? (
              <div className="py-10 text-center text-gray-600">Loading orders…</div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-10 text-center text-gray-600">No orders found.</div>
            ) : (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
                {filteredOrders.map((o) => (
                  <div
                    key={o.id}
                    className="w-full max-w-sm bg-white border rounded-2xl shadow-sm overflow-hidden flex flex-col"
                  >
                    <div className="p-4 border-b bg-gray-50/60">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs text-gray-500">Products</div>
                          <div className="font-semibold text-gray-900 truncate">{getProductNamesFor(o)}</div>
                        </div>
                        <span className="shrink-0 text-xs px-2 py-1 rounded-full border bg-white text-gray-700">
                          {o.status || "placed"}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="text-sm text-gray-600">Total</div>
                        <div className="font-semibold">{money(o.total)}</div>
                      </div>

                      <div className="mt-2 text-xs text-gray-500">
                        {o.created_at ? new Date(o.created_at).toLocaleString() : ""}
                      </div>
                    </div>

                    <div className="p-4 flex flex-col flex-1">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-xl bg-gray-100 border flex items-center justify-center shrink-0">
                          <UserIcon />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs px-2 py-1 rounded-full bg-black text-white">
                              User
                            </span>
                            <div className="font-semibold text-gray-900 truncate">
                              {resolvedOrderName(o)}
                            </div>
                          </div>

                          <div className="mt-1 text-sm text-gray-700 truncate">
                            {resolvedOrderPhone(o)}
                          </div>

                          <div className="mt-2 text-sm text-gray-600 wrap-break-word line-clamp-2">
                            <span className="font-medium text-gray-700">Address:</span>{" "}
                            {resolvedOrderAddress(o)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t">
                        <div className="text-sm text-gray-700 font-medium mb-2">Status</div>
                        <select
                          value={o.status || "placed"}
                          onChange={(e) => updateOrderStatus(o.id, e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border bg-white"
                        >
                          {ORDER_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mt-auto pt-4">
                        <button
                          type="button"
                          onClick={() => setViewOrder(o)}
                          className="w-full px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 font-medium"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* USERS */}
        {tab === "users" && (
          <div className="mt-6 bg-white border rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Users</h2>
              <input
                value={uSearch}
                onChange={(e) => setUSearch(e.target.value)}
                placeholder="Search users..."
                className="px-3 py-2 rounded-lg border w-64 max-w-full"
              />
            </div>

            {uLoading ? (
              <div className="py-10 text-center text-gray-600">Loading users…</div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-10 text-center text-gray-600">No users found.</div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Contact</th>
                      <th className="py-2 pr-4">Address</th>
                      <th className="py-2 pr-4">Role</th>
                      <th className="py-2 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="border-t">
                        <td className="py-2 pr-4 font-medium">{u.name || "—"}</td>
                        <td className="py-2 pr-4">{u.contact_number || "—"}</td>
                        <td className="py-2 pr-4">{u.address || "—"}</td>
                        <td className="py-2 pr-4">{u.role || "—"}</td>
                        <td className="py-2 pr-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => toggleAdmin(u.id, true)}
                              className="px-3 py-2 rounded-lg border hover:bg-gray-50"
                              disabled={safeLower(u.role) === "admin"}
                            >
                              Make admin
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleAdmin(u.id, false)}
                              className="px-3 py-2 rounded-lg border hover:bg-gray-50"
                              disabled={safeLower(u.role) !== "admin"}
                            >
                              Remove admin
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {msg.text && (
                  <p className={`mt-3 text-sm font-semibold ${
                    msg.type === "success" ? "text-green-600" : "text-red-600"
                  }`}>
                    {msg.text}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* VIEW ORDER MODAL */}
      {viewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setViewOrder(null)} />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border overflow-hidden">
            <div className="p-4 sm:p-5 border-b flex items-start justify-between gap-3 bg-gray-50/60">
              <div className="min-w-0">
                <div className="text-xs text-gray-500">Order</div>
                <div className="text-lg font-bold break-all">#{viewOrder.id}</div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-1 rounded-full bg-black text-white">User</span>
                  <span className="font-semibold text-gray-900">{resolvedOrderName(viewOrder)}</span>
                </div>
                <div className="mt-1 text-sm text-gray-700">{resolvedOrderPhone(viewOrder)}</div>
              </div>

              <button
                type="button"
                onClick={() => setViewOrder(null)}
                className="px-3 py-2 rounded-lg border hover:bg-gray-50 shrink-0 bg-white"
              >
                Close
              </button>
            </div>

            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-gray-500">Status</div>
                  <div className="font-semibold">{viewOrder.status || "placed"}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-gray-500">Total</div>
                  <div className="font-semibold">{money(viewOrder.total)}</div>
                </div>
                <div className="border rounded-xl p-3 sm:col-span-2">
                  <div className="text-xs text-gray-500">Address</div>
                  <div className="font-semibold wrap-break-word">{resolvedOrderAddress(viewOrder)}</div>
                </div>
              </div>

              {Array.isArray(viewOrder.items) && viewOrder.items.length > 0 && (
                <div className="mt-5">
                  <div className="text-sm font-semibold">Items</div>
                  <div className="mt-2 border rounded-xl overflow-hidden">
                    {viewOrder.items.map((it, idx) => (
                      <div
                        key={idx}
                        className={`p-3 flex items-start justify-between gap-3 ${
                          idx !== 0 ? "border-t" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">{it.name}</div>
                          <div className="text-sm text-gray-600">Qty: {it.qty}</div>
                        </div>
                        <div className="shrink-0 font-semibold">{money(it.price)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5">
                <div className="text-sm font-semibold">Raw order data</div>
                <pre className="mt-2 text-xs bg-gray-50 border rounded-xl p-3 overflow-auto max-h-80">
{JSON.stringify(viewOrder, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t flex items-center justify-end gap-2 bg-white">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50"
                onClick={() => setViewOrder(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
