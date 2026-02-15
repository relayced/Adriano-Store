import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Checkout() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadProduct() {
    setMsg("");
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

      const q = supabase
        .from("products")
        .select("*")
        .eq("id", Number(id))
        .single();

      const { data, error } = await callWithRetry(
        () => Promise.race([q, timeout]),
        2,
        400
      );

      if (error) {
        setProduct(null);
        setMsg(error.message);
        return;
      }

      setProduct(data);
      const s = Number(data?.stock || 0);
      setQty((q) => Math.min(Math.max(1, Number(q || 1)), Math.max(1, s)));
    } catch (e) {
      console.error("loadProduct error:", e);
      setProduct(null);
      setMsg(e?.message || "Failed to load product.");
    }
  }

  useEffect(() => {
    if (!id) {
      setMsg("Missing product id in URL. Route must be /checkout/:id");
      return;
    }
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function placeOrder() {
    setMsg("");
    setBusy(true);

    try {
      if (!product) throw new Error("Product not loaded.");

      const q = Math.max(1, Number(qty || 1));
      const currentStock = Number(product.stock || 0);

      if (q > currentStock) throw new Error("Not enough stock.");

      // ✅ Single RPC: decrements stock + creates order + inserts order_items (server-side)
      // NOTE: This requires you already created the SQL function `purchase_product`
      const { error: rpcErr } = await supabase.rpc("purchase_product", {
        p_product_id: Number(id),
        p_qty: Number(q),
      });
      if (rpcErr) throw rpcErr;

      // refresh UI stock
      await loadProduct();

      navigate("/orders");
    } catch (err) {
      setMsg(err?.message || "Failed to place order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h2 className="text-2xl font-bold">Checkout</h2>
      <p className="text-sm text-gray-600 mt-1">
        Confirm quantity, then place order.
      </p>

      {msg && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
          {msg}
        </div>
      )}

      {!product && !msg && <p className="mt-6 text-gray-600">Loading…</p>}

      {product && (
        <div className="mt-6 max-w-lg border rounded-xl p-6 space-y-3 bg-white">
          <div className="text-xs text-gray-500">{product.category}</div>
          <div className="text-lg font-semibold">{product.name}</div>
          <div className="text-sm text-gray-600">{product.description || "—"}</div>

          <div className="flex items-center justify-between pt-2">
            <div className="font-bold">
              ₱{Number(product.price || 0).toFixed(2)}
            </div>
            <div className="text-sm text-gray-500">
              Stock: {product.stock ?? 0}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Qty</label>
            <input
              className="w-24 border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-black/10"
              type="number"
              min={1}
              max={product.stock ?? 1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>

          <button
            disabled={busy || Number(product.stock || 0) <= 0}
            onClick={placeOrder}
            className="w-full px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Placing…" : "Place order"}
          </button>
        </div>
      )}
    </main>
  );
}
