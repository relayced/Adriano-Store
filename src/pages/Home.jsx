import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const NEW_ARRIVALS_LIMIT = 8;
const PRODUCT_IMG_BUCKET = "product-images";

function money(n) {
  return `₱${Number(n || 0).toFixed(2)}`;
}

function safeLower(x) {
  return String(x || "").toLowerCase();
}

function makeFileName(file) {
  const ext = (file?.name || "png").split(".").pop();
  const id =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random()}`.replace(/\./g, "");
  return `${id}.${ext}`;
}

async function uploadProductImage(file) {
  if (!file) return null;

  const fileName = makeFileName(file);
  const filePath = `products/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_IMG_BUCKET)
    .upload(filePath, file, { upsert: false });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(PRODUCT_IMG_BUCKET).getPublicUrl(filePath);
  return data?.publicUrl || null;
}

function ProductCard({
  product,
  session,
  isAdmin,
  onAdd,
  onUpdateImage,
  savingImage,
}) {
  const inStock = Number(product?.stock || 0) > 0;

  return (
    <div className="w-full bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">
      <div className="relative bg-gray-100 h-44 overflow-hidden">
        <span className="absolute top-3 left-3 px-3 py-1 text-xs font-semibold rounded-full bg-orange-400 text-white">
          NEW
        </span>

        {session && isAdmin && (
          <label className="absolute top-3 right-3 cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onUpdateImage(product?.id, e.target.files?.[0] || null)}
              disabled={savingImage}
            />
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-black text-white hover:opacity-90">
              {savingImage ? "Uploading…" : "Edit image"}
            </span>
          </label>
        )}

        {product?.image_url ? (
          <img
            src={product.image_url}
            alt={product?.name || "Product"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-sm text-gray-500">
            No image
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <div className="min-w-0">
          <h3 className="font-bold text-[#0A2540] leading-tight truncate">{product?.name || "Untitled"}</h3>
          <p className="mt-1 text-xs text-gray-600 truncate">{product?.category || "Uncategorized"}</p>

          {product?.description ? (
            <p className="mt-2 text-sm text-gray-700 line-clamp-3">{product.description}</p>
          ) : (
            <p className="mt-2 text-sm text-gray-500 line-clamp-3">No description yet.</p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-sm">
          <div className={`flex items-center gap-2 ${inStock ? "text-green-700" : "text-gray-500"}`}>
            <span className="text-base">🛒</span>
            <span className="font-medium">{inStock ? "In Stock" : "Out of Stock"}</span>
          </div>
          <div className="text-gray-600">Stock: {Number(product?.stock || 0)}</div>
        </div>

        <div className="mt-auto pt-4 flex items-center justify-between gap-3">
          <div className="text-lg font-bold text-black">{money(product?.price)}</div>
          <button
            onClick={() => onAdd(product)}
            disabled={!inStock}
            className="w-10 h-10 rounded-full bg-orange-400 text-white flex items-center justify-center text-xl font-bold hover:opacity-90 disabled:opacity-50"
            aria-label={`Add ${product?.name || "product"} to cart`}
            title="Add to cart"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home({ session, fullName, role }) {
  const navigate = useNavigate();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const displayName = (fullName || "").trim() || session?.user?.email?.split("@")?.[0] || "User";

  const [newArrivals, setNewArrivals] = useState([]);
  const [loadingArrivals, setLoadingArrivals] = useState(true);
  const [arrivalsErr, setArrivalsErr] = useState("");

  // timestamp (ms) of last successful arrivals fetch
  const lastFetchRef = useRef(0);
  // prevent concurrent fetches
  const fetchInProgressRef = useRef(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [savingImageId, setSavingImageId] = useState(null);

  // Admin check: prefer role passed from App to avoid duplicate DB queries
  useEffect(() => {
    let alive = true;

    if (role != null) {
      setIsAdmin(safeLower(role) === "admin");
      return () => {
        alive = false;
      };
    }

    async function checkAdmin() {
      setIsAdmin(false);
      if (!session?.user?.id) return;

      const { data: profile, error } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();

      if (!alive) return;

      if (error) {
        setIsAdmin(false);
        return;
      }

      setIsAdmin(safeLower(profile?.role) === "admin");
    }

    checkAdmin();
    return () => {
      alive = false;
    };
  }, [session?.user?.id, role]);

  async function fetchNewArrivals(force = false) {
    // avoid concurrent fetches
    if (fetchInProgressRef.current) return;

    // If data is fresh and not forced, skip fetching
    const FRESH_MS = 60 * 1000; // 60s
    if (!force && lastFetchRef.current && Date.now() - lastFetchRef.current < FRESH_MS) {
      return;
    }

    // only show loading indicator if forcing or we have no data yet
    if (isMountedRef.current) {
      if (force || !newArrivals || newArrivals.length === 0) {
        setLoadingArrivals(true);
      }
      setArrivalsErr("");
    }
    fetchInProgressRef.current = true;

    const timeoutMs = 15000;
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Request timeout")), timeoutMs));

    try {
      // Attempt 1: order by created_at DESC (best if column exists)
      const q1 = supabase
        .from("products")
        .select("id, name, description, price, category, stock, image_url, created_at")
        .order("created_at", { ascending: false })
        .limit(NEW_ARRIVALS_LIMIT);

      let res;
      try {
        res = await Promise.race([q1, timeout]);
      } catch (e) {
        throw e;
      }

      // If created_at ordering fails (column missing), fall back to id DESC
      if (res?.error && /created_at/i.test(res.error.message)) {
        const q2 = supabase
          .from("products")
          .select("id, name, description, price, category, stock, image_url")
          .order("id", { ascending: false })
          .limit(NEW_ARRIVALS_LIMIT);

        const res2 = await Promise.race([q2, timeout]);
        if (!isMountedRef.current) return;

        if (res2?.error) {
          setArrivalsErr(res2.error.message || "Failed to load new arrivals.");
          setNewArrivals([]);
        } else {
          setNewArrivals(Array.isArray(res2.data) ? res2.data : []);
          lastFetchRef.current = Date.now();
        }
        fetchInProgressRef.current = false;
        if (isMountedRef.current) setLoadingArrivals(false);
        return;
      }

      if (!isMountedRef.current) return;

      if (res?.error) {
        setArrivalsErr(res.error.message || "Failed to load new arrivals.");
        setNewArrivals([]);
      } else {
        setNewArrivals(Array.isArray(res.data) ? res.data : []);
        lastFetchRef.current = Date.now();
      }
    } catch (e) {
      if (!isMountedRef.current) return;
      setArrivalsErr(e?.message || "Failed to load new arrivals.");
      setNewArrivals([]);
    } finally {
      fetchInProgressRef.current = false;
      if (isMountedRef.current) setLoadingArrivals(false);
    }
  }

  useEffect(() => {
    // initial load
    fetchNewArrivals();

    // Refresh when tab focuses — but only if data is stale (fetchNewArrivals handles freshness)
    const onFocus = () => fetchNewArrivals(false);

    const onVis = () => {
      if (document.visibilityState === "visible") fetchNewArrivals(false);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addToCart(product) {
    if (!session) {
      navigate("/login");
      return;
    }
    if (!product?.id) return;

    const cart = JSON.parse(localStorage.getItem("cart") || "[]");

    const item = {
      product_id: product.id,
      name: product.name,
      price: Number(product.price) || 0,
      qty: 1,
      image_url: product.image_url || null,
    };

    const idx = cart.findIndex((x) => x.product_id === item.product_id);
    if (idx >= 0) cart[idx].qty += 1;
    else cart.push(item);

    localStorage.setItem("cart", JSON.stringify(cart));
    navigate("/cart");
  }

  async function handleUpdateImage(productId, file) {
    if (!file || !productId) return;

    try {
      setSavingImageId(productId);

      const url = await uploadProductImage(file);

      const { error } = await supabase.from("products").update({ image_url: url }).eq("id", productId);

      if (error) {
        setArrivalsErr(error.message);
        return;
      }

      setNewArrivals((prev) => prev.map((p) => (p.id === productId ? { ...p, image_url: url } : p)));
    } catch (e) {
      setArrivalsErr(e?.message || "Upload failed.");
    } finally {
      setSavingImageId(null);
    }
  }

  const hasArrivals = useMemo(() => newArrivals && newArrivals.length > 0, [newArrivals]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">{session ? `Welcome, ${displayName}.` : "The smart way to shop for school."}</h1>

      <p className="mt-2 text-gray-600">Browse the latest arrivals and essentials for your studies.</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/products" className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90">Shop all products</Link>
        <Link to="/cart" className="px-4 py-2 rounded-xl border bg-white hover:bg-gray-50">View cart</Link>
      </div>

      <section className="mt-10 grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { title: "Notebooks", text: "A5/A4, ruled/plain" },
          { title: "Writing", text: "Pens, pencils, markers" },
          { title: "Accessories", text: "Erasers, rulers, bags" },
          { title: "Paintings", text: "Art supplies & works" },
        ].map((x) => (
          <Link key={x.title} to={`/products?cat=${encodeURIComponent(x.title)}`} className="border rounded-xl p-4 hover:bg-gray-50 transition block">
            <div className="font-semibold">{x.title}</div>
            <div className="text-sm text-gray-600 mt-1">{x.text}</div>
          </Link>
        ))}
      </section>

      {/* NEW ARRIVALS */}
      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#0A2540]">New Arrivals</h2>
            <p className="text-sm text-gray-600">Latest products added by the admin.</p>
          </div>

          <button type="button" onClick={() => fetchNewArrivals(true)} className="px-4 py-2 rounded-xl border bg-white hover:bg-gray-50">
            Refresh
          </button>
        </div>

        {loadingArrivals ? (
          <div className="mt-4 border rounded-2xl p-6 bg-white text-gray-600">Loading new arrivals…</div>
        ) : arrivalsErr ? (
          <div className="mt-4 border rounded-2xl p-6 bg-white">
            <div className="text-sm text-red-700 font-semibold">Couldn’t load products</div>
            <div className="text-sm text-red-600 mt-1">{arrivalsErr}</div>
          </div>
        ) : !hasArrivals ? (
          <div className="mt-4 border rounded-2xl p-6 bg-white text-gray-600">No new arrivals yet.</div>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
            {newArrivals.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                session={session}
                isAdmin={isAdmin}
                onAdd={addToCart}
                onUpdateImage={handleUpdateImage}
                savingImage={savingImageId === p.id}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
