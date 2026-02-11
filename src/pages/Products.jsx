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

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("id", { ascending: false });

    if (error) setErrorMsg(error.message);
    setProducts(data || []);
    setLoading(false);
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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Products</h2>
          <p className="mt-1 text-sm text-gray-600">
            Browse products and add to cart.
          </p>
        </div>

        <button
          onClick={loadProducts}
          className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50 w-fit"
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
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="w-full md:w-64">
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
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
        <p className="mt-4 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <p className="mt-8 text-gray-600">Loading products…</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const stock = Number(p.stock || 0);

            return (
              <div
                key={p.id}
                className="border rounded-2xl bg-white overflow-hidden flex flex-col"
              >
                <div className="h-44 bg-gray-100 overflow-hidden flex items-center justify-center">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm text-gray-400">No image</span>
                  )}
                </div>

                <div className="p-4 flex flex-col flex-1">
                  <div className="text-xs text-gray-500">{p.category || "—"}</div>
                  <div className="mt-1 font-semibold">{p.name}</div>

                  {/* ✅ Keeps card height stable so buttons align even if description is 1–2 lines */}
                  <div className="mt-1 text-sm text-gray-600 line-clamp-2 min-h-10">
                    {p.description || "—"}
                  </div>

                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <div className="font-semibold">
                      ₱{Number(p.price || 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">Stock: {stock}</div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => addToCart(p, false)}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                    >
                      Add
                    </button>

                    {stock > 0 ? (
                      <button
                        onClick={() => addToCart(p, true)}
                        className="flex-1 text-center px-3 py-2 text-sm rounded-lg bg-black text-white hover:opacity-90"
                      >
                        Buy
                      </button>
                    ) : (
                      <span className="flex-1 text-center px-3 py-2 text-sm rounded-lg border text-gray-500">
                        Out
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <p className="text-gray-600">No products found.</p>
          )}
        </div>
      )}
    </main>
  );
}
