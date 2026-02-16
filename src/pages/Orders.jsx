import { useEffect, useMemo, useState } from "react";
import ProfileSidebar from "../components/ProfileSidebar";
import { supabase } from "../supabaseClient";

function money(n) {
  return `₱${Number(n || 0).toFixed(2)}`;
}

function normalizeItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === "string") {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function clean(v) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [userId, setUserId] = useState("");

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  // fallback profile (so "—" doesn't happen if order row has null fields)
  const [fallbackProfile, setFallbackProfile] = useState(null);

  async function loadOrders(uid) {
    setLoading(true);
    setErrorMsg("");

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
        .from("orders")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      const { data, error } = await callWithRetry(
        () => Promise.race([q, timeout]),
        2,
        400
      );

      if (error) setErrorMsg(error.message);
      setOrders(data || []);
    } catch (e) {
      console.error("loadOrders error:", e);
      setErrorMsg(e?.message || "Failed to load orders.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;

    async function init() {
      setLoading(true);
      setErrorMsg("");

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!alive) return;
      if (authErr) console.error("auth.getUser error:", authErr);

      if (!user) {
        setOrders([]);
        setLoading(false);
        setErrorMsg("Please log in to view your orders.");
        return;
      }

      setUserId(user.id);
      await loadOrders(user.id);
    }

    init();
    return () => {
      alive = false;
    };
  }, []);

  // refresh on focus (so status updates show)
  useEffect(() => {
    if (!userId) return;
    const onFocus = () => loadOrders(userId);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [userId]);

  // realtime updates (if enabled on orders table)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("orders-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `user_id=eq.${userId}`,
        },
        () => loadOrders(userId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const selectedItems = useMemo(
    () => normalizeItems(selected?.items),
    [selected]
  );

  // load fallback profile when opening modal
  useEffect(() => {
    let alive = true;

    async function loadProfileFallback() {
      setFallbackProfile(null);
      if (!open || !selected?.user_id) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name,contact_number,address")
        .eq("id", selected.user_id)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error("fallback profile error:", error);
        return;
      }
      setFallbackProfile(data || null);
    }

    loadProfileFallback();
    return () => {
      alive = false;
    };
  }, [open, selected?.user_id]);

  // Order fields first, then fallback to profile
  const displayNameFor = (o) =>
    clean(o?.shipping_name) || clean(fallbackProfile?.full_name) || "—";
  const displayContactFor = (o) =>
    clean(o?.shipping_contact) ||
    clean(fallbackProfile?.contact_number) ||
    "—";
  const displayAddressFor = (o) =>
    clean(o?.shipping_address) || clean(fallbackProfile?.address) || "—";
  const displayPaymentFor = (o) => clean(o?.payment_method) || "—";
  const displayCouponFor = (o) => clean(o?.coupon_code) || "—";

  // Get product names from order items
  const getProductNamesFor = (o) => {
    const items = normalizeItems(o?.items);
    if (items.length === 0) return "No items";
    const names = items.map(item => item.name || "Item").slice(0, 2);
    const displayStr = names.join(", ");
    return items.length > 2 ? `${displayStr} +${items.length - 2} more` : displayStr;
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h2 className="text-2xl font-bold text-emerald-900">Orders</h2>
      <p className="text-sm text-emerald-700 mt-1">View and manage your purchases.</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-[15rem_1fr] gap-6">
        <ProfileSidebar />

        <section className="min-w-0">
          <div className="flex items-center justify-end mb-4">
            <button
              type="button"
              onClick={() => userId && loadOrders(userId)}
              className="px-3 py-1.5 text-sm rounded-lg border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              disabled={!userId}
            >
              Refresh
            </button>
          </div>

          {loading && <p className="text-emerald-700">Loading…</p>}
          {errorMsg && <p className="text-red-600">{errorMsg}</p>}

          {!loading && !errorMsg && (
            <div className="space-y-2">
              {orders.map((o) => (
                <div key={o.id} className="border border-emerald-200 rounded-xl p-4 bg-emerald-50 hover:bg-emerald-100 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-emerald-900">{getProductNamesFor(o)}</div>
                      <div className="text-xs text-emerald-700 mt-0.5">
                        {o.created_at
                          ? new Date(o.created_at).toLocaleString()
                          : "—"}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs text-emerald-700">{o.status || "—"}</div>
                      <div className="font-semibold text-emerald-900">{money(o.total)}</div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelected(o);
                          setOpen(true);
                        }}
                        className="mt-2 px-3 py-1.5 text-xs rounded-lg border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {orders.length === 0 && (
                <p className="text-emerald-700">You have no orders yet.</p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* VIEW MODAL */}
      {open && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-emerald-200 shadow-lg overflow-hidden">
            <div className="p-5 border-b border-emerald-200 flex items-start justify-between gap-3 bg-emerald-50">
              <div>
                <div className="text-lg font-semibold text-emerald-900">{getProductNamesFor(selected)}</div>
                <div className="text-sm text-emerald-700 mt-1">
                  {selected.created_at
                    ? new Date(selected.created_at).toLocaleString()
                    : "—"}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSelected(null);
                }}
                className="px-3 py-1.5 text-sm rounded-lg border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
                  <div className="text-xs text-emerald-700">Status</div>
                  <div className="font-semibold text-emerald-900 mt-1">{selected.status || "—"}</div>
                </div>
                <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
                  <div className="text-xs text-emerald-700">Payment</div>
                  <div className="font-semibold text-emerald-900 mt-1">{displayPaymentFor(selected)}</div>
                </div>
                <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
                  <div className="text-xs text-emerald-700">Total</div>
                  <div className="font-semibold text-emerald-900 mt-1">{money(selected.total)}</div>
                </div>
              </div>

              <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
                <div className="text-sm font-semibold text-emerald-900">Coupon Code</div>
                <div className="mt-1 text-sm text-emerald-700">
                  {displayCouponFor(selected)}
                </div>
              </div>

              <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
                <div className="text-sm font-semibold text-emerald-900">Delivery Information</div>
                <div className="mt-2 text-sm text-emerald-700 space-y-1">
                  <div><span className="font-medium">Name:</span> {displayNameFor(selected)}</div>
                  <div><span className="font-medium">Contact:</span> {displayContactFor(selected)}</div>
                  <div className="whitespace-pre-wrap wrap-break-word"><span className="font-medium">Address:</span> {displayAddressFor(selected)}</div>
                </div>
              </div>

              <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
                <div className="text-sm font-semibold text-emerald-900">Items</div>

                {selectedItems.length === 0 ? (
                  <p className="mt-2 text-sm text-emerald-700">
                    No items in this order.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedItems.map((it, idx) => (
                      <div
                        key={`${it.product_id || it.name || idx}`}
                        className="flex items-start justify-between gap-3 border border-emerald-100 rounded-lg p-2 bg-white"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-emerald-900 truncate text-sm">
                            {it.name || "Item"}
                          </div>
                          <div className="text-xs text-emerald-700">
                            Qty: {Number(it.qty || 0)} × {money(it.price)}
                          </div>
                        </div>

                        <div className="font-semibold text-emerald-900 shrink-0 text-sm">
                          {money(Number(it.price || 0) * Number(it.qty || 0))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 pt-2 border-t border-emerald-200 flex items-center justify-between">
                  <span className="text-sm font-medium text-emerald-700">Total</span>
                  <span className="font-semibold text-emerald-900">{money(selected.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
