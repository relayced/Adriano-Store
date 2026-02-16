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

  // Modal and Buy Now states
  const [buyNowProduct, setBuyNowProduct] = useState(null);
  const [buyNowQty, setBuyNowQty] = useState(1);
  const [buyNowOpen, setBuyNowOpen] = useState(false);
  const [toast, setToast] = useState({ message: "", visible: false });

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
    if (allProducts.length > 0) setCurrentSlide(0);

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
    const slideshowProds = allProducts.slice(0, 12);
    if (slideshowProds.length === 0) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slideshowProds.length);
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
    
    // Show toast instead of redirecting
    setToast({ message: `Added to cart`, visible: true });
    setTimeout(() => setToast({ message: "", visible: false }), 2000);
  }

  function openBuyNow(product) {
    if (!session) {
      navigate("/login");
      return;
    }
    setBuyNowProduct(product);
    setBuyNowQty(1);
    setBuyNowOpen(true);
  }

  function confirmBuyNow() {
    if (!buyNowProduct) return;
    
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const idx = cart.findIndex((x) => x.product_id === buyNowProduct.id);

    if (idx >= 0) {
      cart[idx].qty += Number(buyNowQty);
    } else {
      cart.push({
        product_id: buyNowProduct.id,
        name: buyNowProduct.name,
        price: Number(buyNowProduct.price || 0),
        qty: Number(buyNowQty),
        image_url: buyNowProduct.image_url || null,
      });
    }

    localStorage.setItem("cart", JSON.stringify(cart));
    setBuyNowOpen(false);
    navigate("/cart?checkout=1");
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

  const slideshowProducts = useMemo(() => allProducts.slice(0, 12), [allProducts]);

  const currentProduct = useMemo(() => slideshowProducts[currentSlide] || null, [slideshowProducts, currentSlide]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 bg-white rounded-2xl mt-6 mb-6 shadow-sm">
      <h1 className="text-4xl font-bold tracking-tight text-[#0A2540] text-center">Adriano School Supplies</h1>

      <p className="mt-3 text-lg text-gray-700 text-center">Your complete destination for quality school essentials.</p>

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
                    <h2 className="text-3xl font-bold text-emerald-900">{currentProduct.name}</h2>
                    <p className="mt-3 text-gray-700 leading-relaxed line-clamp-4">{currentProduct.description || "No description available."}</p>

                    <div className="mt-6 flex items-center gap-3">
                      <div className="text-4xl font-bold text-emerald-800">₱{Number(currentProduct.price || 0).toFixed(2)}</div>
                      <button
                        onClick={() => addToCart(currentProduct)}
                        disabled={Number(currentProduct.stock || 0) === 0}
                        className="px-6 py-3 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-medium hover:bg-emerald-200 disabled:bg-gray-400 disabled:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                      >
                        {Number(currentProduct.stock || 0) > 0 ? "Add to Cart" : "Out of Stock"}
                      </button>
                      <button
                        onClick={() => openBuyNow(currentProduct)}
                        disabled={Number(currentProduct.stock || 0) === 0}
                        className="px-6 py-3 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 disabled:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                      >
                        Buy Now
                      </button>
                    </div>
                  </div>
                </div>

                {/* Slide Navigation */}
                <div className="flex items-center justify-between gap-4 px-6 py-4 bg-emerald-50 border-t border-emerald-900/20">
                  <button
                    onClick={() => setCurrentSlide((prev) => (prev - 1 + slideshowProducts.length) % slideshowProducts.length)}
                    className="px-4 py-2 rounded-lg border border-emerald-900/20 hover:bg-emerald-100 text-emerald-700 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                  >
                    ← Previous
                  </button>

                  <div className="text-sm text-emerald-700 font-semibold">
                    {currentSlide + 1} / {slideshowProducts.length}
                  </div>

                  <button
                    onClick={() => setCurrentSlide((prev) => (prev + 1) % slideshowProducts.length)}
                    className="px-4 py-2 rounded-lg border border-emerald-900/20 hover:bg-emerald-100 text-emerald-700 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                  >
                    Next →
                  </button>
                </div>

                {/* Slide Indicators */}
                <div className="flex justify-center gap-2 px-6 py-4 bg-white flex-wrap">
                    {slideshowProducts.map((_, i) => (
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
                      <div className="mt-auto pt-3 space-y-2">
                        <div className="font-bold text-lg text-emerald-700">₱{Number(p.price || 0).toFixed(2)}</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => addToCart(p)}
                            disabled={Number(p.stock || 0) === 0}
                            className="flex-1 px-2 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                          >
                            Cart
                          </button>
                          <button
                            onClick={() => openBuyNow(p)}
                            disabled={Number(p.stock || 0) === 0}
                            className="flex-1 px-2 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                          >
                            Buy
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Toast Notification */}
      {toast.visible && (
        <div className="fixed bottom-6 right-6 bg-emerald-700 text-white px-6 py-3 rounded-lg shadow-lg z-40">
          {toast.message}
        </div>
      )}

      {/* Buy Now Modal */}
      {buyNowOpen && buyNowProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-white rounded-2xl border border-emerald-200 shadow-lg overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-emerald-200 bg-emerald-50 flex items-center justify-between">
              <div className="text-lg font-semibold text-emerald-900">Order Summary</div>
              <button
                onClick={() => setBuyNowOpen(false)}
                className="text-2xl text-emerald-700 hover:text-emerald-900"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4">
              {/* Product Image */}
              <div className="w-full h-48 bg-emerald-50 rounded-lg overflow-hidden flex items-center justify-center">
                {buyNowProduct.image_url ? (
                  <img
                    src={buyNowProduct.image_url}
                    alt={buyNowProduct.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-400">No image</span>
                )}
              </div>

              {/* Product Info */}
              <div>
                <div className="font-bold text-lg text-emerald-900">{buyNowProduct.name}</div>
                <div className="text-sm text-emerald-700 mt-1">{buyNowProduct.description || "—"}</div>
              </div>

              {/* Quantity Selector */}
              <div className="border border-emerald-200 rounded-lg p-3 bg-emerald-50">
                <label className="text-xs text-emerald-700 font-medium">Quantity</label>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    onClick={() => setBuyNowQty(Math.max(1, buyNowQty - 1))}
                    className="px-3 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={Number(buyNowProduct.stock || 1)}
                    value={buyNowQty}
                    onChange={(e) => setBuyNowQty(Math.max(1, Number(e.target.value)))}
                    className="w-16 border border-emerald-200 rounded px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => setBuyNowQty(Math.min(Number(buyNowProduct.stock || 1), buyNowQty + 1))}
                    className="px-3 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Price Summary */}
              <div className="border-t border-emerald-200 pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-700">Subtotal</span>
                  <span className="font-semibold text-emerald-900">₱{(Number(buyNowProduct.price || 0) * buyNowQty).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-700">Shipping</span>
                  <span className="text-emerald-700">Calculated at checkout</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t border-emerald-200 pt-2">
                  <span className="text-emerald-900">Total</span>
                  <span className="text-emerald-700">₱{(Number(buyNowProduct.price || 0) * buyNowQty).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-5 border-t border-emerald-200 bg-emerald-50 flex gap-3">
              <button
                onClick={() => {
                  if (buyNowProduct) {
                    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
                    const idx = cart.findIndex((x) => x.product_id === buyNowProduct.id);
                    if (idx >= 0) {
                      cart[idx].qty += Number(buyNowQty);
                    } else {
                      cart.push({
                        product_id: buyNowProduct.id,
                        name: buyNowProduct.name,
                        price: Number(buyNowProduct.price || 0),
                        qty: Number(buyNowQty),
                        image_url: buyNowProduct.image_url || null,
                      });
                    }
                    localStorage.setItem("cart", JSON.stringify(cart));
                    setToast({ message: `Added to cart`, visible: true });
                    setTimeout(() => setToast({ message: "", visible: false }), 2000);
                  }
                  setBuyNowOpen(false);
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-100 text-emerald-700 font-medium hover:bg-emerald-200 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                Cart
              </button>
              <button
                onClick={confirmBuyNow}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
