import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProfileSidebar from "../components/ProfileSidebar";
import { supabase } from "../supabaseClient";

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

function money(n) {
  return `₱${Number(n || 0).toFixed(2)}`;
}

export default function Cart() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);

  // Auth/Profile
  const [loadingUser, setLoadingUser] = useState(true);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");

  const [fullName, setFullName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [address, setAddress] = useState("");

  // Checkout UI
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("COD"); // "GCash" | "COD"
  const [coupon, setCoupon] = useState("");
  const [couponMsg, setCouponMsg] = useState("");
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setItems(getCart());
  }, []);

  // Load auth + profile details
  useEffect(() => {
    let alive = true;

    async function loadUserAndProfile() {
      setLoadingUser(true);
      setErr("");

      const { data, error } = await supabase.auth.getUser();
      const user = data?.user;

      if (!alive) return;

      if (error) console.error("auth.getUser error:", error);

      if (!user) {
        setLoadingUser(false);
        return; // user may be browsing without login
      }

      setUserId(user.id);
      setEmail(user.email || "");

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("full_name, contact_number, address")
        .eq("id", user.id)
        .maybeSingle();

      if (!alive) return;

      if (pErr) {
        console.error("profiles select error:", pErr);
      } else if (profile) {
        setFullName(profile.full_name ?? "");
        setContactNumber(profile.contact_number ?? "");
        setAddress(profile.address ?? "");
      }

      setLoadingUser(false);
    }

    loadUserAndProfile();
    return () => {
      alive = false;
    };
  }, []);

  function updateQty(product_id, qty) {
    const next = items.map((x) =>
      x.product_id === product_id
        ? { ...x, qty: Math.max(1, Number(qty || 1)) }
        : x
    );
    setItems(next);
    setCart(next);
  }

  function removeItem(product_id) {
    const next = items.filter((x) => x.product_id !== product_id);
    setItems(next);
    setCart(next);
  }

  const subtotal = useMemo(
    () => items.reduce((sum, x) => sum + Number(x.price || 0) * Number(x.qty || 0), 0),
    [items]
  );

  // Simple coupon logic (you can expand later)
  const discount = useMemo(() => {
    const code = coupon.trim().toUpperCase();
    if (!code) return 0;

    // Examples:
    // SAVE10 = 10% off
    // LESS50 = ₱50 off
    if (code === "SAVE10") return subtotal * 0.1;
    if (code === "LESS50") return 50;

    return 0;
  }, [coupon, subtotal]);

  const total = Math.max(0, subtotal - discount);

  function applyCoupon() {
    setCouponMsg("");
    const code = coupon.trim().toUpperCase();
    if (!code) return setCouponMsg("Enter a coupon code.");
    if (code === "SAVE10") return setCouponMsg("Applied: 10% off ✅");
    if (code === "LESS50") return setCouponMsg("Applied: ₱50 off ✅");
    setCouponMsg("Invalid coupon code.");
  }

  async function saveProfileDetailsIfChanged() {
    if (!userId) return;

    // Update profile so your checkout info stays saved
    const payload = {
      full_name: fullName.trim(),
      contact_number: contactNumber.trim(),
      address: address.trim(),
    };

    const { error } = await supabase.from("profiles").update(payload).eq("id", userId);
    if (error) throw error;
  }

  async function placeOrder() {
    setErr("");
    setCouponMsg("");

    if (!userId) {
      navigate("/login");
      return;
    }

    if (items.length === 0) {
      setErr("Your cart is empty.");
      return;
    }

    if (!fullName.trim() || !contactNumber.trim() || !address.trim()) {
      setErr("Please fill in Full name, Contact number, and Address.");
      return;
    }

    try {
      setPlacing(true);

      // Save profile details first (so Orders/Profile stays consistent)
      await saveProfileDetailsIfChanged();

      const orderItems = items.map((x) => ({
        product_id: x.product_id,
        name: x.name,
        price: Number(x.price || 0),
        qty: Number(x.qty || 0),
        image_url: x.image_url || null,
      }));

      // Best-effort insert (tries common ecommerce columns first)
      const payloadA = {
        user_id: userId,
        items: orderItems, // jsonb recommended on DB
        subtotal: Number(subtotal),
        discount: Number(discount),
        total: Number(total),
        status: "Pending",
        payment_method: paymentMethod,
        coupon_code: coupon.trim() ? coupon.trim().toUpperCase() : null,
        shipping_name: fullName.trim(),
        shipping_contact: contactNumber.trim(),
        shipping_address: address.trim(),
      };

      let insertError = null;

      // Attempt A
      {
        const { error } = await supabase.from("orders").insert(payloadA);
        insertError = error || null;
      }

      // Fallback insert if your orders table has fewer columns
      if (insertError) {
        console.warn("Order insert (A) failed, trying fallback:", insertError);

        const payloadB = {
          user_id: userId,
          items: orderItems,
          total: Number(total),
          status: "Pending",
        };

        const { error } = await supabase.from("orders").insert(payloadB);
        if (error) throw error;
      }

      // Success → clear cart
      setItems([]);
      setCart([]);
      setShowCheckout(false);
      navigate("/orders");
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to place order.");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h2 className="text-2xl font-bold">Profile</h2>
      <p className="text-sm text-gray-600 mt-1">Manage your orders and cart.</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-[15rem_1fr] gap-6">
        <ProfileSidebar />

        <section className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-lg font-semibold">Cart</h3>
              {email && <p className="text-xs text-gray-500 mt-1">Signed in: {email}</p>}
            </div>

            <button
              type="button"
              onClick={() => {
                setErr("");
                setShowCheckout((v) => !v);
              }}
              disabled={items.length === 0}
              className="px-4 py-2 rounded-lg bg-black text-white text-sm hover:opacity-90 disabled:opacity-50"
            >
              {showCheckout ? "Close checkout" : "Buy"}
            </button>
          </div>

          {/* Items */}
          <div className="space-y-3">
            {items.map((x) => (
              <div key={x.product_id} className="border rounded-xl p-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {/* Image holder */}
                    <div className="w-16 h-16 rounded-lg border bg-gray-100 overflow-hidden flex items-center justify-center">
                      {x.image_url ? (
                        <img
                          src={x.image_url}
                          alt={x.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-gray-400">No img</span>
                      )}
                    </div>

                    <div>
                      <div className="font-semibold">{x.name}</div>
                      <div className="text-sm text-gray-600">{money(x.price)}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => removeItem(x.product_id)}
                    className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-sm text-gray-600">Qty</div>
                  <input
                    type="number"
                    min={1}
                    className="w-24 border rounded-lg px-3 py-2"
                    value={x.qty}
                    onChange={(e) => updateQty(x.product_id, e.target.value)}
                  />
                </div>
              </div>
            ))}

            {items.length === 0 && <p className="text-gray-600">Your cart is empty.</p>}
          </div>

          {/* Totals */}
          <div className="border rounded-xl p-4 bg-white space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">Subtotal</div>
              <div className="font-semibold">{money(subtotal)}</div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">Discount</div>
              <div className="font-semibold">{money(discount)}</div>
            </div>

            <div className="pt-2 border-t flex items-center justify-between">
              <div className="text-sm text-gray-600">Total</div>
              <div className="font-semibold">{money(total)}</div>
            </div>
          </div>

          {/* Checkout panel */}
          {showCheckout && (
            <div className="border rounded-xl p-5 bg-white">
              <h4 className="text-base font-semibold">Checkout</h4>
              <p className="text-sm text-gray-600 mt-1">
                Confirm your details and choose payment.
              </p>

              {loadingUser && <p className="mt-4 text-gray-600">Loading account…</p>}

              {!loadingUser && !userId && (
                <div className="mt-4">
                  <p className="text-sm text-gray-600">Please log in to continue.</p>
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="mt-3 px-4 py-2 rounded-lg bg-black text-white text-sm hover:opacity-90"
                  >
                    Go to login
                  </button>
                </div>
              )}

              {!loadingUser && userId && (
                <>
                  {/* Profile Details */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Full name</label>
                      <input
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Your full name"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Contact number</label>
                      <input
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                        placeholder="09xx xxx xxxx"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-gray-500">Address</label>
                      <textarea
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-27.5"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="House no., street, barangay, city, province"
                      />
                    </div>
                  </div>

                  {/* Coupon */}
                  <div className="mt-4">
                    <label className="text-xs text-gray-500">Coupon code</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        className="flex-1 border rounded-lg px-3 py-2 text-sm"
                        value={coupon}
                        onChange={(e) => setCoupon(e.target.value)}
                        placeholder="e.g. SAVE10 or LESS50"
                      />
                      <button
                        type="button"
                        onClick={applyCoupon}
                        className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50"
                      >
                        Apply
                      </button>
                    </div>
                    {couponMsg && (
                      <p className="mt-2 text-sm text-gray-600">{couponMsg}</p>
                    )}
                  </div>

                  {/* Payment */}
                  <div className="mt-4">
                    <label className="text-xs text-gray-500">Payment method</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("GCash")}
                        className={`px-4 py-2 rounded-lg border text-sm ${
                          paymentMethod === "GCash"
                            ? "bg-black text-white border-black"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        GCash
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("COD")}
                        className={`px-4 py-2 rounded-lg border text-sm ${
                          paymentMethod === "COD"
                            ? "bg-black text-white border-black"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        Cash on Delivery (COD)
                      </button>
                    </div>

                    {paymentMethod === "GCash" && (
                      <p className="mt-2 text-xs text-gray-500">
                        You can add the GCash payment instructions later (QR / number).
                      </p>
                    )}
                  </div>

                  {/* Summary */}
                  <div className="mt-5 border rounded-xl p-4 bg-gray-50">
                    <div className="text-sm font-semibold">Order summary</div>
                    <div className="mt-2 space-y-1 text-sm text-gray-700">
                      {items.map((x) => (
                        <div key={x.product_id} className="flex justify-between gap-3">
                          <div className="truncate">
                            {x.name} × {x.qty}
                          </div>
                          <div className="shrink-0">
                            {money(Number(x.price || 0) * Number(x.qty || 0))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 pt-3 border-t flex justify-between text-sm">
                      <span className="text-gray-600">Total</span>
                      <span className="font-semibold">{money(total)}</span>
                    </div>
                  </div>

                  {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

                  <button
                    type="button"
                    onClick={placeOrder}
                    disabled={placing || items.length === 0}
                    className="mt-5 w-full px-4 py-2 rounded-lg bg-orange-400 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    {placing ? "Placing order…" : "Place order"}
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
