import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

const DEFAULT_CATEGORIES = ["All", "Notebooks", "Pens", "Pencils", "Paper", "Accessories", "Paintings"];

function getCart() {
  try {
    return JSON.parse(localStorage.getItem("cart") || "[]");
  } catch {
    return [];
  }
}

function setCart(items) {
  localStorage.setItem("cart", JSON.stringify(items));
}

export default function Products({ session }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Modal and Buy Now states
  const [buyNowProduct, setBuyNowProduct] = useState(null);
  const [buyNowQty, setBuyNowQty] = useState(1);
  const [buyNowOpen, setBuyNowOpen] = useState(false);
  const [toast, setToast] = useState({ message: "", visible: false });

  async function loadProducts() {
    setLoading(true);
    setErrorMsg("");

    try {
      const timeoutMs = 60000;
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Request timeout")), timeoutMs));

      async function callWithRetry(fn, retries = 2, delayMs = 400) {
        let lastErr;
        for (let i = 0; i <= retries; i++) {
          try {
            return await fn();
          } catch (err) {
            lastErr = err;
            if (i < retries) {
              console.log(`Retry attempt ${i + 1} after ${delayMs * (i + 1)}ms...`);
              await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
            }
          }
        }
        throw lastErr;
      }

      const q = supabase.from("products").select("*").order("id", { ascending: false });
      const res = await callWithRetry(() => Promise.race([q, timeout]), 2, 400);

      if (res?.error) {
        setErrorMsg(res.error.message || "Failed to load products.");
        setProducts([]);
      } else {
        setProducts(res?.data || []);
      }
    } catch (e) {
      console.error("loadProducts error:", e);
      setErrorMsg(e?.message || "Failed to load products.");
      setProducts([]);
      try {
        const { setSupabaseError } = await import("../utils/supabaseDebug");
        setSupabaseError(`Products: ${e?.message || String(e)}`);
      } catch (_) {}
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    const cat = searchParams.get("cat");
    if (cat) setCategory(cat);
  }, [searchParams]);

  function addToCart(p, goToCheckout = false) {
    if (!session) return navigate("/login");

    const cart = getCart();
    const idx = cart.findIndex((x) => x.product_id === p.id);

    if (idx >= 0) cart[idx].qty += 1;
    else
      cart.push({
        product_id: p.id,
        name: p.name,
        price: Number(p.price || 0),
        qty: 1,
        image_url: p.image_url || null,
      });

    setCart(cart);

    // Show toast instead of redirecting
    setToast({ message: `Added to cart`, visible: true });
    setTimeout(() => setToast({ message: "", visible: false }), 2000);
  }

  function openBuyNow(product) {
    if (!session) return navigate("/login");
    setBuyNowProduct(product);
    setBuyNowQty(1);
    setBuyNowOpen(true);
  }

  function confirmBuyNow() {
    if (!buyNowProduct) return;
    
    const cart = getCart();
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

    setCart(cart);
    setBuyNowOpen(false);
    navigate("/cart?checkout=1");
  }

  const categories = useMemo(() => {
    const dbCats = Array.from(
      new Set(products.map((p) => p.category).filter(Boolean))
    );
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...dbCats]));
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return products.filter((p) => {
      const catOk = category === "All" || (p.category || "") === category;
      const text = `${p.name || ""} ${p.description || ""}`.toLowerCase();
      const searchOk = !q || text.includes(q);
      return catOk && searchOk;
    });
  }, [products, category, search]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 bg-white rounded-2xl mt-6 mb-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-emerald-900">Shop All Products</h2>
          <p className="mt-1 text-sm text-emerald-700">
            Discover everything you need
          </p>
        </div>

        <button
          onClick={loadProducts}
          className="px-4 py-2 text-sm rounded-lg border border-emerald-900/20 text-emerald-700 hover:bg-emerald-50 transition w-fit focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          Refresh
        </button>
      </div>

      {/* Search + Category */}
      <div className="mt-6 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full border border-emerald-900/20 rounded-xl px-4 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div className="w-full md:w-64">
          <select
            className="w-full border border-emerald-900/20 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="mt-8 flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-emerald-700 font-semibold">Loading products…</p>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((p) => {
            const stock = Number(p.stock || 0);

            return (
              <div
                key={p.id}
                className="rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col h-full"
              >
                {/* Product Image */}
                <div className="w-full h-32 bg-green-50 overflow-hidden flex items-center justify-center">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-gray-400">No image</span>
                  )}
                </div>

                {/* Card Content */}
                <div className="p-3 flex flex-col flex-1">
                  {/* Category & Name */}
                  <div className="text-xs text-gray-500 uppercase tracking-wide">{p.category || "—"}</div>
                  <div className="mt-1 font-bold text-sm text-gray-800 line-clamp-2 min-h-8">{p.name}</div>

                  {/* Description (small spec text) */}
                  <div className="mt-1 text-xs text-gray-500 line-clamp-1">
                    {p.description || "—"}
                  </div>

                  {/* Price and Stock Info */}
                  <div className="mt-auto pt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                    <div className="font-bold text-lg text-emerald-700">
                      ₱{Number(p.price || 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">{stock > 0 ? `${stock} left` : "Out"}</div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => addToCart(p)}
                      disabled={stock === 0}
                      className="flex-1 px-3 py-2 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-medium hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                      title={stock > 0 ? "Add to cart" : "Out of stock"}
                    >
                      Add
                    </button>
                    <button
                      onClick={() => openBuyNow(p)}
                      disabled={stock === 0}
                      className="flex-1 px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                      title={stock > 0 ? "Buy now" : "Out of stock"}
                    >
                      Buy
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full text-center py-8">
              <p className="text-gray-600 text-sm">No products found.</p>
            </div>
          )}
        </div>
      )}

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
                    const cart = getCart();
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
                    setCart(cart);
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
