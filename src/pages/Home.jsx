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
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const displayName = (fullName || "").trim() || session?.user?.email?.split("@")?.[0] || "User";

  const [allProducts, setAllProducts] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loadingSlideshow, setLoadingSlideshow] = useState(true);
  const [slideshowErr, setSlideshowErr] = useState("");

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

  async function fetchSlideshow() {
    setLoadingSlideshow(true);
    setSlideshowErr("");
    setCurrentSlide(0);

    try {
      const timeoutMs = 60000;
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), timeoutMs)
      );

      async function callWithRetry(fn, retries = 2, delayMs = 400) {
        let lastErr;
        for (let i = 0; i <= retries; i++) {
          try {
            return await fn();
          } catch (err) {
            lastErr = err;
            if (i < retries) await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
          }
        }
        throw lastErr;
      }

      const q = supabase.from("products").select("*").order("id", { ascending: false });
      
      const res = await callWithRetry(
        () => Promise.race([q, timeout]),
        2,
        400
      );

      console.debug("[Home] slideshow result:", { hasData: !!res?.data, count: res?.data?.length || 0, error: res?.error?.message });

      if (!isMountedRef.current) return;

      if (res?.error) {
        setSlideshowErr(res.error.message || "Failed to load slideshow.");
        setAllProducts([]);
      } else {
        setAllProducts(Array.isArray(res.data) ? res.data : []);
      }
    } catch (e) {
      console.error("[Home] fetchSlideshow error:", e);
      if (!isMountedRef.current) return;
      setSlideshowErr(e?.message || "Failed to load slideshow.");
      setAllProducts([]);
      try {
        const { setSupabaseError } = await import("../utils/supabaseDebug");
        setSupabaseError(`Slideshow: ${e?.message || String(e)}`);
      } catch (_) {}
    } finally {
      if (isMountedRef.current) setLoadingSlideshow(false);
    }
  }

  // Fetch slideshow products on mount
  useEffect(() => {
    fetchSlideshow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-advance slideshow every 5 seconds
  useEffect(() => {
    if (allProducts.length === 0) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % allProducts.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [allProducts.length]);

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
        setSlideshowErr(error.message);
        return;
      }

      setAllProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, image_url: url } : p)));
    } catch (e) {
      setSlideshowErr(e?.message || "Upload failed.");
    } finally {
      setSavingImageId(null);
    }
  }

  const currentProduct = useMemo(() => allProducts[currentSlide] || null, [allProducts, currentSlide]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 bg-white rounded-2xl mt-6 mb-6 shadow-sm">
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

      {/* PRODUCT SHOWCASE */}
      <section className="mt-10">
        {loadingSlideshow ? (
          <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 p-12 text-center text-emerald-700">
            <div className="text-lg font-semibold">Loading products…</div>
          </div>
        ) : slideshowErr ? (
          <div className="rounded-2xl border border-emerald-900/20 bg-emerald-50 p-6">
            <div className="text-sm text-emerald-700 font-semibold">Slideshow unavailable</div>
            <div className="text-sm text-emerald-600 mt-2">{slideshowErr}</div>
          </div>
        ) : allProducts.length === 0 ? (
          <div className="rounded-2xl bg-emerald-50 p-12 text-center text-emerald-700">
            <div className="text-lg font-semibold">No products available.</div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Featured Product Slide (if available) */}
            {currentProduct && (
              <div className="rounded-2xl overflow-hidden bg-white border border-emerald-900/20 shadow-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 md:p-10">
                  {/* Image */}
                  <div className="flex items-center justify-center bg-emerald-50 rounded-xl h-80">
                    {currentProduct.image_url ? (
                      <img
                        src={currentProduct.image_url}
                        alt={currentProduct.name}
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      <span className="text-emerald-300 text-center">No image</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex flex-col justify-center">
                    <div className="text-xs text-emerald-600 uppercase tracking-widest font-semibold">{currentProduct.category || "Product"}</div>
                    <h2 className="mt-2 text-3xl font-bold text-emerald-900">{currentProduct.name}</h2>
                    <p className="mt-3 text-gray-700 leading-relaxed line-clamp-4">{currentProduct.description || "No description available."}</p>

                    <div className="mt-6 flex items-center gap-6">
                      <div className="text-4xl font-bold text-emerald-800">₱{Number(currentProduct.price || 0).toFixed(2)}</div>
                      <button
                        onClick={() => addToCart(currentProduct)}
                        disabled={Number(currentProduct.stock || 0) === 0}
                        className="px-6 py-3 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 disabled:bg-gray-400"
                      >
                        {Number(currentProduct.stock || 0) > 0 ? "+ Add to Cart" : "Out of Stock"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Slide Navigation */}
                <div className="flex items-center justify-between gap-4 px-6 py-4 bg-emerald-50 border-t border-emerald-900/20">
                  <button
                    onClick={() => setCurrentSlide((prev) => (prev - 1 + allProducts.length) % allProducts.length)}
                    className="px-4 py-2 rounded-lg border border-emerald-900/20 hover:bg-emerald-100 text-emerald-700"
                  >
                    ← Previous
                  </button>

                  <div className="text-sm text-emerald-700 font-semibold">
                    {currentSlide + 1} / {allProducts.length}
                  </div>

                  <button
                    onClick={() => setCurrentSlide((prev) => (prev + 1) % allProducts.length)}
                    className="px-4 py-2 rounded-lg border border-emerald-900/20 hover:bg-emerald-100 text-emerald-700"
                  >
                    Next →
                  </button>
                </div>

                {/* Slide Indicators */}
                <div className="flex justify-center gap-2 px-6 py-4 bg-white flex-wrap">
                  {allProducts.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentSlide(i)}
                      className={`w-2 h-2 rounded-full transition ${
                        i === currentSlide ? "bg-emerald-700" : "bg-emerald-300 hover:bg-emerald-400"
                      }`}
                      aria-label={`Go to slide ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* "You might need" Grid Section */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-emerald-900">You might need</h2>
                <button
                  onClick={() => document.querySelector('[href="/products"]')?.click()}
                  className="text-emerald-600 hover:text-emerald-800 font-semibold text-sm"
                >
                  See more →
                </button>
              </div>

              {/* Product Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {allProducts.slice(0, 12).map((p) => (
                  <div key={p.id} className="rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col">
                    {/* Image */}
                    <div className="w-full h-32 bg-emerald-50 flex items-center justify-center overflow-hidden">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-gray-400">No image</span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-3 flex flex-col flex-1">
                      <div className="font-semibold text-sm text-gray-800 line-clamp-2">{p.name}</div>
                      <div className="text-xs text-gray-500 mt-1">{p.category || "—"}</div>
                      <div className="mt-auto pt-3 flex items-center justify-between">
                        <div className="font-bold text-lg text-emerald-700">₱{Number(p.price || 0).toFixed(2)}</div>
                        <button
                          onClick={() => addToCart(p)}
                          disabled={Number(p.stock || 0) === 0}
                          className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold hover:bg-emerald-200 disabled:opacity-50"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
