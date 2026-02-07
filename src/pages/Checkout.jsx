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

  useEffect(() => {
    async function load() {
      setMsg("");
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (error) setMsg(error.message);
      setProduct(data);
    }
    load();
  }, [id]);

  async function placeOrder() {
    setMsg("");
    setBusy(true);

    const { error } = await supabase.rpc("create_order", {
      p_product_id: Number(id),
      p_qty: Number(qty),
    });

    setBusy(false);

    if (error) return setMsg(error.message);

    navigate("/orders");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h2 className="text-2xl font-bold">Checkout</h2>
      <p className="text-sm text-gray-600 mt-1">
        Confirm quantity, then place order.
      </p>

      {msg && <p className="mt-4 text-red-600">{msg}</p>}
      {!product && !msg && <p className="mt-6 text-gray-600">Loading…</p>}

      {product && (
        <div className="mt-6 max-w-lg border rounded-xl p-6 space-y-3">
          <div className="text-xs text-gray-500">{product.category}</div>
          <div className="text-lg font-semibold">{product.name}</div>
          <div className="text-sm text-gray-600">{product.description || "—"}</div>

          <div className="flex items-center justify-between pt-2">
            <div className="font-bold">₱{Number(product.price || 0).toFixed(2)}</div>
            <div className="text-sm text-gray-500">Stock: {product.stock ?? 0}</div>
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
