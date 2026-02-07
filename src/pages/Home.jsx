import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

function makeFileName(file) {
  const ext = (file?.name || "png").split(".").pop();
  const id = (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
  ).replace(/\./g, "");
  return `${id}.${ext}`;
}

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

function NewArrivalCard({
  product,
  session,
  isAdmin,
  onAdd,
  onUpdateImage,
  savingImage,
  msg,
  err,
}) {
  const priceText =
    typeof product?.price === "number"
      ? `₱${product.price.toFixed(2)}`
      : product?.price
        ? `₱${product.price}`
        : "—";

  return (
    <div className="mt-10 bg-white rounded-2xl shadow-sm border overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
        {/* Hero Image */}
        <div className="relative bg-gray-100 p-6 flex items-center justify-center">
          {/* Status Badge */}
          <span className="absolute top-4 left-4 px-3 py-1 text-xs font-semibold rounded-full bg-orange-400 text-white">
            NEW ARRIVAL!
          </span>

          {/* Admin: Edit image */}
          {session && isAdmin && (
            <label className="absolute top-4 right-4 cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onUpdateImage(e.target.files?.[0] || null)}
              />
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-black text-white hover:opacity-90">
                {savingImage ? "Uploading…" : "Edit image"}
              </span>
            </label>
          )}

          {/* Image */}
          <div className="w-full h-44 rounded-xl bg-white border overflow-hidden flex items-center justify-center">
            {product?.image_url ? (
              <img
                src={product.image_url}
                alt={product?.name || "Product"}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm text-gray-500">No image yet</span>
            )}
          </div>

          {/* Messages */}
          {(msg || err) && (
            <div className="absolute bottom-4 left-4 right-4">
              {msg && (
                <div className="text-xs bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2">
                  {msg}
                </div>
              )}
              {err && (
                <div className="text-xs bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 mt-2">
                  {err}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-[#0A2540]">
              {product?.name || "New Arrival"}
            </h3>

            <p className="mt-2 text-sm text-gray-600">
              {product?.description || "Check out our latest product."}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              {/* Stock */}
              <div
                className={`flex items-center gap-2 ${
                  Number(product?.stock) > 0 ? "text-green-700" : "text-gray-500"
                }`}
              >
                <span className="text-base">🛒</span>
                <span className="text-sm font-medium">
                  {Number(product?.stock) > 0 ? "In Stock" : "Out of Stock"}
                </span>
              </div>
            </div>
          </div>

          {/* Price + Add */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <div className="text-lg font-bold text-black">{priceText}</div>
            <button
              onClick={onAdd}
              disabled={!product || Number(product?.stock) <= 0}
              className="w-10 h-10 rounded-full bg-orange-400 text-white flex items-center justify-center text-xl font-bold hover:opacity-90 disabled:opacity-50"
              aria-label="Add to cart"
              title="Add to cart"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home({ session, fullName }) {
  const navigate = useNavigate();

  const displayName =
    (fullName || "").trim() ||
    session?.user?.email?.split("@")?.[0] ||
    "User";

  const [featured, setFeatured] = useState(null);
  const [loadingFeatured, setLoadingFeatured] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function loadFeatured() {
    setLoadingFeatured(true);
    setErr("");

    // ✅ latest product becomes New Arrival
    const { data, error } = await supabase
      .from("products")
      .select("id, name, description, price, category, stock, image_url")
      .order("id", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Home featured product error:", error);
      setErr(error.message);
      setFeatured(null);
    } else {
      setFeatured((data && data[0]) || null);
    }

    setLoadingFeatured(false);
  }

  // Load featured on mount + when tab refocuses (so new admin uploads show up)
  useEffect(() => {
    loadFeatured();

    const onFocus = () => loadFeatured();
    window.addEventListener("focus", onFocus);

    const onVis = () => {
      if (document.visibilityState === "visible") loadFeatured();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Check admin role
  useEffect(() => {
    let alive = true;

    async function checkAdmin() {
      setIsAdmin(false);
      if (!session?.user?.id) return;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error("Home admin check error:", error);
        setIsAdmin(false);
        return;
      }

      const role = String(profile?.role || "").trim().toLowerCase();
      setIsAdmin(role === "admin");
    }

    checkAdmin();
    return () => {
      alive = false;
    };
  }, [session?.user?.id]);

  function addFeaturedToCart() {
    if (!session) {
      navigate("/login");
      return;
    }
    if (!featured) return;

    const cart = JSON.parse(localStorage.getItem("cart") || "[]");

    const item = {
      product_id: featured.id,
      name: featured.name,
      price: Number(featured.price) || 0,
      qty: 1,
      image_url: featured.image_url || null,
    };

    const idx = cart.findIndex((x) => x.product_id === item.product_id);
    if (idx >= 0) cart[idx].qty += 1;
    else cart.push(item);

    localStorage.setItem("cart", JSON.stringify(cart));
    navigate("/cart");
  }

  async function handleUpdateImage(file) {
    setMsg("");
    setErr("");

    if (!file) return;
    if (!featured?.id) {
      setErr("No featured product found.");
      return;
    }

    try {
      setSavingImage(true);

      const url = await uploadProductImage(file);

      const { error } = await supabase
        .from("products")
        .update({ image_url: url })
        .eq("id", featured.id);

      if (error) {
        console.error("Update product image error:", error);
        setErr(error.message);
        return;
      }

      setFeatured((prev) => (prev ? { ...prev, image_url: url } : prev));
      setMsg("Image updated ✅");
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Upload failed.");
    } finally {
      setSavingImage(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        {session ? `Welcome, ${displayName}.` : "The smart way to shop for school."}
      </h1>

      <p className="mt-3 text-gray-600 max-w-xl">
        Adriano Store helps you find notebooks, writing tools, accessories, and
        paintings with a clean checkout flow.
      </p>

      {/* ✅ Home stays clean: just browse + login */}
      <div className="mt-6 flex gap-3">
        <Link
          to="/products"
          className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90"
        >
          Browse products
        </Link>

        {!session && (
          <Link
            to="/login"
            className="px-4 py-2 rounded-lg border hover:bg-gray-50"
          >
            Log in
          </Link>
        )}
      </div>

      {/* Categories -> Products with ?cat= */}
      <section className="mt-10 grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { title: "Notebooks", text: "A5/A4, ruled/plain" },
          { title: "Writing", text: "Pens, pencils, markers" },
          { title: "Accessories", text: "Erasers, rulers, bags" },
          { title: "Paintings", text: "Art supplies & works" },
        ].map((x) => (
          <Link
            key={x.title}
            to={`/products?cat=${encodeURIComponent(x.title)}`}
            className="border rounded-xl p-4 hover:bg-gray-50 transition block"
          >
            <div className="font-semibold">{x.title}</div>
            <div className="text-sm text-gray-600 mt-1">{x.text}</div>
          </Link>
        ))}
      </section>

      {/* New Arrival (latest product from DB) */}
      {loadingFeatured ? (
        <div className="mt-10 border rounded-2xl p-6 bg-white text-gray-600">
          Loading new arrival…
        </div>
      ) : (
        <NewArrivalCard
          product={featured}
          session={session}
          isAdmin={isAdmin}
          onAdd={addFeaturedToCart}
          onUpdateImage={handleUpdateImage}
          savingImage={savingImage}
          msg={msg}
          err={err}
        />
      )}
    </main>
  );
}
