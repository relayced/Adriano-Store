import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

const DEFAULT_CATEGORIES = ["All", "Notebooks", "Writing", "Accessories", "Paintings"];

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

    // ✅ If user clicked BUY, open cart checkout with full details UI
    navigate(goToCheckout ? "/cart?checkout=1" : "/cart");
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
          className="px-4 py-2 text-sm rounded-lg border border-emerald-900/20 text-emerald-700 hover:bg-emerald-50 transition w-fit"
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

                  {/* Add to Cart Button */}
                  <button
                    onClick={() => addToCart(p)}
                    disabled={stock === 0}
                    className="mt-3 w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition mx-auto"
                    title={stock > 0 ? "Add to cart" : "Out of stock"}
                  >
                    +
                  </button>
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
    </main>
  );
}
