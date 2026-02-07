import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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

  const categories = useMemo(() => {
    const fromDB = new Set(products.map((p) => p.category).filter(Boolean));
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...fromDB]));
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return products.filter((p) => {
      const matchesCategory = category === "All" || p.category === category;
      if (!q) return matchesCategory;

      const haystack = [p.name, p.description, p.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesCategory && haystack.includes(q);
    });
  }, [products, category, search]);

  function addToCart(p) {
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
    navigate("/cart");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Products</h2>
          <p className="text-sm text-gray-600 mt-1">
            Your classroom kit, just a click away.
          </p>
        </div>

        {/* Search + Refresh */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-56 sm:w-72 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={loadProducts}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="mt-5 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`px-3 py-2 text-sm rounded-full border ${
              c === category
                ? "bg-black text-white border-black"
                : "hover:bg-gray-50"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading && <p className="mt-6 text-gray-600">Loading…</p>}
      {errorMsg && <p className="mt-6 text-red-600">{errorMsg}</p>}

      {/* Products Grid */}
      {!loading && !errorMsg && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const stock = Number(p.stock || 0);

            return (
              <div
                key={p.id}
                className="border rounded-xl overflow-hidden flex flex-col bg-white"
              >
                {/* 🖼 Image Holder (fixed height so it won't affect layout) */}
                <div className="h-44 bg-gray-100 flex items-center justify-center overflow-hidden">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-sm text-gray-400">No image available</span>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 flex flex-col flex-1">
                  <div className="text-xs text-gray-500">{p.category}</div>
                  <div className="mt-1 font-semibold">{p.name}</div>

                  {/* ✅ FIX: keep description height consistent */}
                  <div className="mt-1 text-sm text-gray-600 line-clamp-2 min-h-10">
                    {p.description || "—"}
                  </div>

                  {/* ✅ FIX: push everything below to the bottom */}
                  <div className="mt-auto pt-4">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">
                        ₱{Number(p.price || 0).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">Stock: {stock}</div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => addToCart(p)}
                        disabled={stock <= 0}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border hover:bg-gray-50 disabled:opacity-50"
                      >
                        Add to cart
                      </button>

                      {stock > 0 ? (
                        <Link
                          to={`/checkout/${p.id}`}
                          className="flex-1 text-center px-3 py-2 text-sm rounded-lg bg-black text-white hover:opacity-90"
                        >
                          Buy
                        </Link>
                      ) : (
                        <span className="flex-1 text-center px-3 py-2 text-sm rounded-lg border text-gray-500">
                          Out
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
