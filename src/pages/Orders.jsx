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

function itemProductId(item) {
  const raw = item?.product_id ?? item?.id ?? item?.productId ?? null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function clean(v) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function formatOrderStatusLabel(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "cancelled" || s === "canceled") {
    return "Cancelled";
  }
  if (s === "ship" || s === "shipped" || s === "out for delivery" || s === "delivering") {
    return "Shipped";
  }
  return status || "—";
}

function normalizeOrderStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "completed") return "completed";
  if (s === "ship" || s === "shipped" || s === "delivering" || s === "out for delivery") {
    return "out-for-delivery";
  }
  return "to-ship";
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [userId, setUserId] = useState("");
  const [orderCategory, setOrderCategory] = useState("to-ship");
  const [historyOpen, setHistoryOpen] = useState(false);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [itemReviewsByProductId, setItemReviewsByProductId] = useState({});
  const [reviewDraftByProductId, setReviewDraftByProductId] = useState({});
  const [reviewSavingProductId, setReviewSavingProductId] = useState(null);
  const [reviewMsg, setReviewMsg] = useState("");

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

  const toShipOrders = useMemo(
    () => orders.filter((o) => normalizeOrderStatus(o?.status) === "to-ship"),
    [orders]
  );

  const toDeliverOrders = useMemo(
    () => orders.filter((o) => normalizeOrderStatus(o?.status) === "out-for-delivery"),
    [orders]
  );

  const completedOrders = useMemo(
    () => orders.filter((o) => normalizeOrderStatus(o?.status) === "completed"),
    [orders]
  );

  const cancelledOrders = useMemo(
    () => orders.filter((o) => normalizeOrderStatus(o?.status) === "cancelled"),
    [orders]
  );

  const historyOrders = useMemo(
    () => [...completedOrders, ...cancelledOrders],
    [completedOrders, cancelledOrders]
  );

  const visibleOrders = useMemo(() => {
    if (orderCategory === "to-deliver") return toDeliverOrders;
    if (orderCategory === "cancelled") return cancelledOrders;
    return toShipOrders;
  }, [orderCategory, toDeliverOrders, cancelledOrders, toShipOrders]);

  const visibleLabel =
    orderCategory === "to-deliver"
      ? "Out for Delivery"
      : orderCategory === "cancelled"
      ? "Cancelled"
      : "To Ship";

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
  const displayShippingFeeFor = (o) => {
    const fee = Number(o?.shipping_fee);
    return Number.isNaN(fee) ? "—" : money(fee);
  };
  const displayPaymentStatusFor = (o) => {
    const method = String(o?.payment_method || "").toLowerCase();
    const status = String(o?.status || "").toLowerCase();
    if (method.includes("gcash")) return "Paid";
    if (method.includes("cod") && status === "completed") return "Paid";
    if (method.includes("cod")) return "Pending";
    return "Unpaid";
  };

  // Get product names from order items
  const getProductNamesFor = (o) => {
    const items = normalizeItems(o?.items);
    if (items.length === 0) return "No items";
    const names = items.map(item => item.name || "Item").slice(0, 2);
    const displayStr = names.join(", ");
    return items.length > 2 ? `${displayStr} +${items.length - 2} more` : displayStr;
  };

  async function cancelOrder(orderId) {
    if (!orderId) return;
    const ok = window.confirm("Cancel this order? This cannot be undone.");
    if (!ok) return;

    setErrorMsg("");
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "Cancelled" })
        .eq("id", orderId);

      if (error) throw error;
      if (userId) await loadOrders(userId);
    } catch (e) {
      console.error("cancel order error:", e);
      setErrorMsg(e?.message || "Failed to cancel order.");
    }
  }

  async function loadSelectedOrderReviews(order) {
    setItemReviewsByProductId({});
    setReviewDraftByProductId({});
    setReviewMsg("");

    if (!order || !userId) return;
    if (normalizeOrderStatus(order?.status) !== "completed") return;

    const ids = Array.from(
      new Set(
        normalizeItems(order.items)
          .map((it) => itemProductId(it))
          .filter((id) => id != null)
      )
    );

    if (!ids.length) return;

    const { data, error } = await supabase
      .from("product_reviews")
      .select("id, product_id, rating, comment, created_at")
      .eq("user_id", userId)
      .in("product_id", ids)
      .order("created_at", { ascending: false });

    if (error) return;

    const latestByProduct = {};
    for (const row of data || []) {
      if (!latestByProduct[row.product_id]) {
        latestByProduct[row.product_id] = row;
      }
    }

    setItemReviewsByProductId(latestByProduct);

    const draft = {};
    for (const id of ids) {
      const existing = latestByProduct[id];
      draft[id] = {
        rating: Number(existing?.rating || 5),
        comment: existing?.comment || "",
      };
    }
    setReviewDraftByProductId(draft);
  }

  async function submitItemReview(productId) {
    if (!selected || !userId) return;
    if (normalizeOrderStatus(selected?.status) !== "completed") return;

    const draft = reviewDraftByProductId[productId] || { rating: 5, comment: "" };
    const rating = Number(draft.rating || 0);
    const comment = String(draft.comment || "").trim();

    if (rating < 1 || rating > 5) {
      setReviewMsg("Please choose a rating from 1 to 5 stars.");
      return;
    }
    if (!comment) {
      setReviewMsg("Please add your comment before submitting.");
      return;
    }

    try {
      setReviewSavingProductId(productId);
      setReviewMsg("");

      const existingId = itemReviewsByProductId[productId]?.id;

      if (existingId) {
        const { error } = await supabase
          .from("product_reviews")
          .update({ rating, comment })
          .eq("id", existingId)
          .eq("user_id", userId);

        if (error) {
          const { error: insertErr } = await supabase
            .from("product_reviews")
            .insert({
              product_id: productId,
              user_id: userId,
              rating,
              comment,
            });

          if (insertErr) throw insertErr;
        }
      } else {
        const { error } = await supabase
          .from("product_reviews")
          .insert({
            product_id: productId,
            user_id: userId,
            rating,
            comment,
          });
        if (error) throw error;
      }

      await loadSelectedOrderReviews(selected);
      setReviewMsg("Feedback saved.");
    } catch (e) {
      setReviewMsg(e?.message || "Failed to save feedback.");
    } finally {
      setReviewSavingProductId(null);
    }
  }

  useEffect(() => {
    if (!open || !selected) return;
    loadSelectedOrderReviews(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selected?.id, selected?.status, userId]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h2 className="text-2xl font-bold text-emerald-900">Orders</h2>
      <p className="text-sm text-emerald-700 mt-1">View and manage your purchases.</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-6">
        <ProfileSidebar />

        <section className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOrderCategory("to-ship")}
                className={`px-3 py-1.5 text-sm rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  orderCategory === "to-ship"
                    ? "bg-emerald-700 border-emerald-700 text-white"
                    : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                To Ship
              </button>

              <button
                type="button"
                onClick={() => setOrderCategory("to-deliver")}
                className={`px-3 py-1.5 text-sm rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  orderCategory === "to-deliver"
                    ? "bg-emerald-700 border-emerald-700 text-white"
                    : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                Out for Delivery
              </button>

              <button
                type="button"
                onClick={() => setOrderCategory("cancelled")}
                className={`px-3 py-1.5 text-sm rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  orderCategory === "cancelled"
                    ? "bg-emerald-700 border-emerald-700 text-white"
                    : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                Cancelled
              </button>

              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="px-3 py-1.5 text-sm rounded-lg border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                History ({historyOrders.length})
              </button>
            </div>

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
              <h3 className="text-sm font-semibold text-emerald-900 mb-2">{visibleLabel}</h3>

              {visibleOrders.map((o) => (
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
                      <div className="text-xs text-emerald-700">{formatOrderStatusLabel(o.status)}</div>
                      <div className="font-semibold text-emerald-900">{money(o.total)}</div>

                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(o);
                            setOpen(true);
                          }}
                          className="px-3 py-1.5 text-xs rounded-lg border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                        >
                          View
                        </button>
                        {normalizeOrderStatus(o?.status) === "to-ship" && (
                          <button
                            type="button"
                            onClick={() => cancelOrder(o.id)}
                            className="px-3 py-1.5 text-xs rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 transition focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {visibleOrders.length === 0 && (
                <p className="text-emerald-700">No {visibleLabel.toLowerCase()} orders.</p>
              )}

              {orders.length === 0 && (
                <p className="text-emerald-700">You have no orders yet.</p>
              )}
            </div>
          )}
        </section>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-3xl bg-white rounded-2xl border border-emerald-200 shadow-lg overflow-hidden">
            <div className="p-5 border-b border-emerald-200 bg-emerald-50 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-emerald-900">History</h4>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-2 max-h-[70vh] overflow-y-auto">
              {historyOrders.map((o) => (
                <div key={o.id} className="border border-emerald-200 rounded-xl p-4 bg-white hover:bg-emerald-50 transition">
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
                      <div className="text-xs text-emerald-700">{formatOrderStatusLabel(o.status)}</div>
                      <div className="font-semibold text-emerald-900">{money(o.total)}</div>

                      <button
                        type="button"
                        onClick={() => {
                          setHistoryOpen(false);
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

              {historyOrders.length === 0 && (
                <p className="text-emerald-700">No history yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODAL */}
      {open && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-emerald-200 shadow-lg overflow-y-auto max-h-[85vh] sm:overflow-visible sm:max-h-none">
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
              {reviewMsg && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  {reviewMsg}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
                  <div className="text-xs text-emerald-700">Status</div>
                  <div className="font-semibold text-emerald-900 mt-1">{formatOrderStatusLabel(selected.status)}</div>
                </div>
                <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
                  <div className="text-xs text-emerald-700">Payment</div>
                  <div className="font-semibold text-emerald-900 mt-1">{displayPaymentFor(selected)}</div>
                </div>
                <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
                  <div className="text-xs text-emerald-700">Payment Status</div>
                  <div className="font-semibold text-emerald-900 mt-1">
                    {displayPaymentStatusFor(selected)}
                  </div>
                </div>
                <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
                  <div className="text-xs text-emerald-700">Shipping Fee</div>
                  <div className="font-semibold text-emerald-900 mt-1">
                    {displayShippingFeeFor(selected)}
                  </div>
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
                        className="border border-emerald-100 rounded-lg p-2 bg-white"
                      >
                        <div className="flex items-start justify-between gap-3">
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

                        {normalizeOrderStatus(selected?.status) === "completed" && itemProductId(it) != null && (
                          <div className="mt-3 border-t border-emerald-100 pt-3">
                            <div className="text-xs font-medium text-emerald-800">Satisfaction feedback</div>

                            <div className="mt-2 flex items-center gap-1" aria-label="Choose rating">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => {
                                    const pid = itemProductId(it);
                                    if (pid == null) return;
                                    setReviewDraftByProductId((prev) => ({
                                      ...prev,
                                      [pid]: {
                                        rating: n,
                                        comment: prev[pid]?.comment || "",
                                      },
                                    }));
                                  }}
                                  className={`text-xl leading-none ${(reviewDraftByProductId[itemProductId(it)]?.rating || 5) >= n ? "text-amber-500" : "text-gray-300"}`}
                                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                                >
                                  ★
                                </button>
                              ))}
                            </div>

                            <textarea
                              value={reviewDraftByProductId[itemProductId(it)]?.comment || ""}
                              onChange={(e) => {
                                const pid = itemProductId(it);
                                if (pid == null) return;
                                const nextComment = e.target.value;
                                setReviewDraftByProductId((prev) => ({
                                  ...prev,
                                  [pid]: {
                                    rating: prev[pid]?.rating || 5,
                                    comment: nextComment,
                                  },
                                }));
                              }}
                              rows={3}
                              placeholder="Share if you're satisfied with this item..."
                              className="mt-2 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />

                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() => submitItemReview(itemProductId(it))}
                                disabled={reviewSavingProductId === itemProductId(it)}
                                className="px-3 py-1.5 text-xs rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                              >
                                {reviewSavingProductId === itemProductId(it) ? "Saving..." : "Save feedback"}
                              </button>
                            </div>
                          </div>
                        )}
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
