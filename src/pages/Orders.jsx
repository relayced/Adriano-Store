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

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) setErrorMsg(error.message);
    setOrders(data || []);
    setLoading(false);
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

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h2 className="text-2xl font-bold">Profile</h2>
      <p className="text-sm text-gray-600 mt-1">Manage your orders and cart.</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-[15rem_1fr] gap-6">
        <ProfileSidebar />

        <section className="min-w-0">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Orders</h3>
              <p className="text-xs text-gray-500 mt-1">
                Old orders (before you added checkout fields) may show “—”. New
                orders will show full details.
              </p>
            </div>

            <button
              type="button"
              onClick={() => userId && loadOrders(userId)}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
              disabled={!userId}
            >
              Refresh
            </button>
          </div>

          {loading && <p className="mt-4 text-gray-600">Loading…</p>}
          {errorMsg && <p className="mt-4 text-red-600">{errorMsg}</p>}

          {!loading && !errorMsg && (
            <div className="mt-4 space-y-3">
              {orders.map((o) => (
                <div key={o.id} className="border rounded-xl p-4 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">Order #{o.id}</div>
                      <div className="text-sm text-gray-600">
                        {o.created_at
                          ? new Date(o.created_at).toLocaleString()
                          : "—"}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        Payment: {clean(o.payment_method) || "—"} • Coupon:{" "}
                        {clean(o.coupon_code) || "—"}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm text-gray-600">
                        Status:{" "}
                        <span className="font-semibold">{o.status || "—"}</span>
                      </div>
                      <div className="font-semibold">{money(o.total)}</div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelected(o);
                          setOpen(true);
                        }}
                        className="mt-2 px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {orders.length === 0 && (
                <p className="text-gray-600">You have no orders yet.</p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* VIEW MODAL */}
      {open && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="p-5 border-b flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Order #{selected.id}</div>
                <div className="text-sm text-gray-600">
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
                className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-gray-500">Status</div>
                  <div className="font-semibold">{selected.status || "—"}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-gray-500">Payment</div>
                  <div className="font-semibold">{displayPaymentFor(selected)}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-gray-500">Total</div>
                  <div className="font-semibold">{money(selected.total)}</div>
                </div>
              </div>

              <div className="border rounded-xl p-4">
                <div className="font-semibold">Coupon</div>
                <div className="mt-1 text-sm text-gray-700">
                  {displayCouponFor(selected)}
                </div>
              </div>

              <div className="border rounded-xl p-4">
                <div className="font-semibold">Delivery details</div>
                <div className="mt-2 text-sm text-gray-700 space-y-1">
                  <div>Name: {displayNameFor(selected)}</div>
                  <div>Contact: {displayContactFor(selected)}</div>
                  <div className="whitespace-pre-wrap wrap-break-word">
                    Address: {displayAddressFor(selected)}
                  </div>
                </div>
              </div>

              <div className="border rounded-xl p-4">
                <div className="font-semibold">Items</div>

                {selectedItems.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-600">
                    No items saved for this order yet.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {selectedItems.map((it, idx) => (
                      <div
                        key={`${it.product_id || it.name || idx}`}
                        className="flex items-start justify-between gap-3 border rounded-lg p-3"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {it.name || "Item"}
                          </div>
                          <div className="text-sm text-gray-600">
                            Qty: {Number(it.qty || 0)} • {money(it.price)}
                          </div>
                        </div>

                        <div className="font-semibold shrink-0">
                          {money(Number(it.price || 0) * Number(it.qty || 0))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-3 border-t flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total</span>
                  <span className="font-semibold">{money(selected.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
