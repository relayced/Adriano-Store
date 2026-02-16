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

// Fallback zone shipping (if GPS not allowed)
const SHIPPING_ZONES = [
  { value: "near", label: "Near (0–3 km)", fee: 20 },
  { value: "mid", label: "Medium (3–8 km)", fee: 40 },
  { value: "far", label: "Far (8+ km)", fee: 60 },
];

// ✅ Put your store coords here
const STORE_LOCATION = { lat: 14.953525018497311, lng: 120.90085425371905 };

// Haversine distance (no API)
function toRad(x) {
  return (x * Math.PI) / 180;
}
function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}
function computeShippingFromKm(km) {
  const base = 20;
  const perKm = 5;
  const min = 20;
  const max = 150;

  const fee = base + km * perKm;
  return Math.min(max, Math.max(min, Math.round(fee)));
}

export default function Cart() {
  const navigate = useNavigate();

  const [items, setItemsState] = useState([]);

  // Auth/Profile
  const [loadingUser, setLoadingUser] = useState(true);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");

  const [fullName, setFullName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [address, setAddress] = useState("");

  // Checkout UI
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutItemProductId, setCheckoutItemProductId] = useState(null); // for per-item checkout
  const [paymentMethod, setPaymentMethod] = useState("COD"); // "GCash" | "COD"
  const [coupon, setCoupon] = useState("");
  const [couponMsg, setCouponMsg] = useState("");
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState("");

  // Shipping: GPS + fallback zone
  const [shippingMode, setShippingMode] = useState("gps"); // "gps" | "zone"
  const [shippingZone, setShippingZone] = useState("near");
  const [locStatus, setLocStatus] = useState("");
  const [distanceKm, setDistanceKm] = useState(null);

  // ✅ GCash proof (FREE manual verification)
  const [gcashProofFile, setGcashProofFile] = useState(null);
  const [gcashProofPreview, setGcashProofPreview] = useState("");
  const [gcashReference, setGcashReference] = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);

  function setItems(next) {
    setItemsState(next);
    setCart(next);
  }

  useEffect(() => {
    setItemsState(getCart());
  }, []);

  // Load auth + profile
  useEffect(() => {
    let alive = true;

    async function loadUserAndProfile() {
      setLoadingUser(true);
      setErr("");

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

        const userRes = await callWithRetry(
          () => Promise.race([supabase.auth.getUser(), timeout]),
          2,
          400
        );
        const user = userRes?.data?.user;

        if (!alive) return;

        if (userRes?.error) console.error("auth.getUser error:", userRes.error);

        if (!user) {
          setLoadingUser(false);
          return;
        }

        setUserId(user.id);
        setEmail(user.email || "");

        const profileQuery = supabase
          .from("profiles")
          .select("full_name, contact_number, address")
          .eq("id", user.id)
          .maybeSingle();

        const { data: profile, error: pErr } = await callWithRetry(
          () => Promise.race([profileQuery, timeout]),
          2,
          400
        );

        if (!alive) return;

        if (pErr) {
          console.error("profiles select error:", pErr);
        } else if (profile) {
          setFullName(profile.full_name ?? "");
          setContactNumber(profile.contact_number ?? "");
          setAddress(profile.address ?? "");
        }

        setLoadingUser(false);
      } catch (e) {
        console.error("loadUserAndProfile error:", e);
        if (!alive) return;
        setLoadingUser(false);
      }
    }

    loadUserAndProfile();
    return () => {
      alive = false;
    };
  }, []);

  function updateQty(product_id, qty) {
    const q = Math.max(1, Number(qty || 1));
    const next = items.map((x) =>
      x.product_id === product_id ? { ...x, qty: q } : x
    );
    setItems(next);
  }

  function removeItem(product_id) {
    const next = items.filter((x) => x.product_id !== product_id);
    setItems(next);
  }

  const subtotal = useMemo(() => {
    return items.reduce(
      (sum, x) => sum + Number(x.price || 0) * Number(x.qty || 0),
      0
    );
  }, [items]);

  const shippingFee = useMemo(() => {
    if (shippingMode === "gps") {
      if (distanceKm == null) return 0;
      return computeShippingFromKm(distanceKm);
    }
    const z = SHIPPING_ZONES.find((x) => x.value === shippingZone);
    return z ? Number(z.fee || 0) : 0;
  }, [shippingMode, distanceKm, shippingZone]);

  const discount = useMemo(() => {
    const code = coupon.trim().toUpperCase();
    if (!code) return 0;
    if (code === "SAVE10") return subtotal * 0.1;
    if (code === "LESS50") return 50;
    return 0;
  }, [coupon, subtotal]);

  const grandTotal = Math.max(0, subtotal - discount + shippingFee);

  function applyCoupon() {
    setCouponMsg("");
    const code = coupon.trim().toUpperCase();
    if (!code) return setCouponMsg("Enter a coupon code.");
    if (code === "SAVE10") return setCouponMsg("Applied: 10% off ✅");
    if (code === "LESS50") return setCouponMsg("Applied: ₱50 off ✅");
    setCouponMsg("Invalid coupon code.");
  }

  async function saveProfileDetails() {
    if (!userId) return;
    const payload = {
      full_name: fullName.trim(),
      contact_number: contactNumber.trim(),
      address: address.trim(),
    };

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

      const result = await callWithRetry(
        () => Promise.race([supabase.from("profiles").update(payload).eq("id", userId), timeout]),
        2,
        400
      );

      if (result?.error) throw result.error;
    } catch (e) {
      console.error("saveProfileDetails error:", e);
      throw e;
    }
  }

  function toPurchaseItems(cart) {
    return cart.map((x) => ({
      product_id: Number(x.product_id),
      qty: Number(x.qty || 0),
    }));
  }

  function useMyLocation() {
    setErr("");
    setLocStatus("Requesting location…");
    setDistanceKm(null);

    if (!navigator.geolocation) {
      setLocStatus("");
      setShippingMode("zone");
      setErr("Geolocation not supported. Please use Shipping Zone instead.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const km = haversineKm(STORE_LOCATION, loc);
        setDistanceKm(km);
        setLocStatus(`Location detected ✅ (${km.toFixed(1)} km)`);
        setShippingMode("gps");
      },
      () => {
        setDistanceKm(null);
        setLocStatus("");
        setShippingMode("zone");
        setErr("Location permission denied. Please choose Shipping Zone instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ✅ Upload proof to Supabase Storage bucket "payments" (public bucket)
  async function uploadGcashProof(userIdArg) {
    if (!gcashProofFile) return "";

    setUploadingProof(true);
    try {
      const safeName = (gcashProofFile.name || "proof.jpg").replace(/\s+/g, "_");
      const path = `${userIdArg}/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("payments")
        .upload(path, gcashProofFile, { upsert: false });

      if (upErr) throw upErr;

      const { data } = supabase.storage.from("payments").getPublicUrl(path);
      const url = data?.publicUrl || "";
      if (!url) throw new Error("Failed to get proof URL.");
      return url;
    } finally {
      setUploadingProof(false);
    }
  }

  async function placeOrder() {
    setErr("");
    setCouponMsg("");

    if (!userId) return navigate("/login");
    if (items.length === 0) return setErr("Your cart is empty.");
    if (!fullName.trim() || !contactNumber.trim() || !address.trim()) {
      return setErr("Please fill Full name, Contact number, and Address.");
    }

    if (shippingMode === "gps" && distanceKm == null) {
      return setErr('Please click "Use my location" or switch to Shipping Zone.');
    }

    // ✅ Require proof if GCash
    if (paymentMethod === "GCash" && !gcashProofFile) {
      return setErr("GCash proof screenshot is required.");
    }

    try {
      setPlacing(true);

      await saveProfileDetails();

      // Upload proof first (if GCash)
      let proofUrl = "";
      if (paymentMethod === "GCash") {
        proofUrl = await uploadGcashProof(userId);
      }

      // If individual checkout, only purchase the selected item
      const cartForPurchase = checkoutItemProductId
        ? items.filter(x => x.product_id === checkoutItemProductId)
        : items;

      const purchaseItems = toPurchaseItems(cartForPurchase);

      try {
        const timeoutMs = 120000; // RPC calls may take longer
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Purchase timeout")), timeoutMs)
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

        const rpcCall = supabase.rpc("purchase_cart", {
          p_items: purchaseItems,
          p_discount: Number(discount || 0),
          p_shipping_fee: Number(shippingFee || 0),
          p_shipping_zone: shippingMode === "gps" ? "gps" : shippingZone,
          p_payment_method: paymentMethod,
          p_coupon_code: coupon.trim() ? coupon.trim().toUpperCase() : null,
          p_shipping_name: fullName.trim(),
          p_shipping_contact: contactNumber.trim(),
          p_shipping_address: address.trim(),
          p_payment_reference: gcashReference.trim() || null,
          p_payment_proof_url: proofUrl || null,
        });

        const { error: rpcErr } = await callWithRetry(
          () => Promise.race([rpcCall, timeout]),
          2,
          400
        );

        if (rpcErr) throw new Error(rpcErr.message || "Checkout failed.");
      } catch (rpcError) {
        throw rpcError;
      }

      // If individual checkout, remove only that item from cart; otherwise clear entire cart
      if (checkoutItemProductId) {
        setItems(items.filter(x => x.product_id !== checkoutItemProductId));
      } else {
        setItems([]);
      }
      setShowCheckout(false);
      setCheckoutItemProductId(null);

      // Reset gcash fields
      setGcashProofFile(null);
      setGcashProofPreview("");
      setGcashReference("");

      navigate("/orders");
    } catch (e) {
      setErr(e?.message || "Failed to place order.");
    } finally {
      setPlacing(false);
    }
  }

  // proof preview
  useEffect(() => {
    if (!gcashProofFile) {
      setGcashProofPreview("");
      return;
    }
    const url = URL.createObjectURL(gcashProofFile);
    setGcashProofPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [gcashProofFile]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 bg-white rounded-2xl mt-6 mb-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-emerald-900">Shopping Cart</h2>
          <p className="text-sm text-emerald-700 mt-1">Review and checkout your order.</p>
        </div>
        <button
          type="button"
          onClick={() => setItemsState(getCart())}
          className="px-4 py-2 rounded-lg border border-emerald-900/20 text-emerald-700 hover:bg-emerald-50 w-fit transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          Refresh cart
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        <ProfileSidebar />

        <section className="space-y-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-emerald-900">Cart</h3>
              {email && <p className="text-xs text-emerald-700 mt-1">Signed in: {email}</p>}
            </div>
          </div>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {err}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-3">
              {items.map((x) => (
                <div
                  key={x.product_id}
                  className="border border-emerald-200 rounded-2xl p-4 bg-emerald-50 flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  <div className="w-16 h-16 rounded-xl border border-emerald-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
                    {x.image_url ? (
                      <img src={x.image_url} alt={x.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-emerald-400">No img</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-emerald-900 truncate">{x.name}</div>
                    <div className="text-sm text-emerald-700">{money(x.price)}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      className="w-24 border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      value={x.qty}
                      onChange={(e) => updateQty(x.product_id, e.target.value)}
                    />
                    <button
                      onClick={() => removeItem(x.product_id)}
                      className="px-3 py-2 text-sm rounded-lg border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => {
                        setErr("");
                        setCheckoutItemProductId(x.product_id);
                        setShowCheckout(true);
                      }}
                      className="px-3 py-2 text-sm rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                    >
                      Buy
                    </button>
                  </div>
                </div>
              ))}

              {items.length === 0 && (
                <div className="border border-emerald-200 rounded-2xl p-6 bg-emerald-50 text-emerald-700">
                  Your cart is empty.
                  <button className="ml-2 font-semibold text-emerald-900 hover:text-emerald-800" onClick={() => navigate("/products")}>
                    Browse products
                  </button>
                </div>
              )}
            </div>
          </div>

          {showCheckout && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 overflow-y-auto">
              <div className="w-full max-w-2xl bg-white rounded-2xl border border-emerald-200 shadow-lg overflow-hidden my-8">
                <div className="p-5 border-b border-emerald-200 bg-emerald-50 flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-emerald-900">
                      Checkout {checkoutItemProductId && items.find(x => x.product_id === checkoutItemProductId) && `- ${items.find(x => x.product_id === checkoutItemProductId)?.name}`}
                    </h4>
                    <p className="text-sm text-emerald-700 mt-1">
                      Confirm your details, shipping, and payment.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCheckout(false);
                      setCheckoutItemProductId(null);
                    }}
                    className="text-2xl text-emerald-700 hover:text-emerald-900 shrink-0"
                  >
                    ×
                  </button>
                </div>

                <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
                  {/* Product info for individual checkout */}
                  {checkoutItemProductId && items.find(x => x.product_id === checkoutItemProductId) && (
                    <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50">
                      <div className="grid grid-cols-[120px_1fr] gap-4">
                        <div className="w-28 h-28 rounded-lg border border-emerald-200 bg-white overflow-hidden flex items-center justify-center">
                          {items.find(x => x.product_id === checkoutItemProductId)?.image_url ? (
                            <img 
                              src={items.find(x => x.product_id === checkoutItemProductId)?.image_url} 
                              alt={items.find(x => x.product_id === checkoutItemProductId)?.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xs text-emerald-400">No img</span>
                          )}
                        </div>
                        <div className="flex flex-col justify-between">
                          <div>
                            <div className="font-semibold text-emerald-900 text-base">{items.find(x => x.product_id === checkoutItemProductId)?.name}</div>
                            <div className="text-sm text-emerald-700 mt-1">{money(items.find(x => x.product_id === checkoutItemProductId)?.price || 0)} per item</div>
                          </div>
                          <div>
                            <label className="text-xs text-emerald-700 font-medium block mb-2">Quantity</label>
                            <input
                              type="number"
                              min={1}
                              className="w-20 border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              value={items.find(x => x.product_id === checkoutItemProductId)?.qty || 1}
                              onChange={(e) => updateQty(checkoutItemProductId, e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-emerald-200 flex justify-between">
                        <span className="text-emerald-700 font-medium">Subtotal</span>
                        <span className="font-semibold text-emerald-900">{money((items.find(x => x.product_id === checkoutItemProductId)?.price || 0) * (items.find(x => x.product_id === checkoutItemProductId)?.qty || 1))}</span>
                      </div>
                    </div>
                  )}

                  {/* Shipping fee section */}
                  <div className="pt-3 border-t border-emerald-200 flex justify-between text-sm">
                    <span className="text-emerald-700">Shipping fee</span>
                    <span className="font-semibold text-emerald-900">{money(shippingFee)}</span>
                  </div>

                  {loadingUser && <p className="mt-4 text-emerald-700">Loading account…</p>}

                  {!loadingUser && !userId && (
                    <div className="mt-4">
                      <p className="text-sm text-emerald-700 font-medium">Please sign in to continue checkout.</p>
                      <button
                        type="button"
                        onClick={() => navigate("/login")}
                        className="mt-3 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm hover:bg-emerald-800 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                      >
                        Sign in
                      </button>
                    </div>
                  )}

              {!loadingUser && userId && (
                <>
                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-emerald-700 font-medium">Full name</label>
                      <input
                        className="mt-1 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-emerald-700 font-medium">Contact number</label>
                      <input
                        className="mt-1 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-emerald-700 font-medium">Address</label>
                      <textarea
                        className="mt-1 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm min-h-[110px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Shipping */}
                  <div className="mt-5 border border-emerald-200 rounded-xl p-4 bg-emerald-50">
                    <div className="mb-3">
                      <div className="text-sm font-semibold text-emerald-900">Shipping fee</div>
                      <div className="text-xs text-emerald-700">
                        Share your location for accurate delivery distance calculation.
                      </div>
                    </div>

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={useMyLocation}
                        className="px-4 py-2 rounded-lg bg-white border border-emerald-300 text-sm text-emerald-700 hover:bg-emerald-100 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                      >
                        Use my location
                      </button>
                      {locStatus && (
                        <div className="mt-2 text-sm text-emerald-700">{locStatus}</div>
                      )}
                      {shippingMode === "gps" && distanceKm == null && (
                        <div className="mt-3 p-3 rounded-lg bg-amber-100 border border-amber-300">
                          <p className="text-sm text-amber-800 font-medium">⚠️ Please click "Use my location" to calculate shipping cost, or switch to Shipping Zone.</p>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex justify-between text-sm">
                      <span className="text-emerald-700 font-medium">Shipping fee</span>
                      <span className="font-semibold text-emerald-900">{money(shippingFee)}</span>
                    </div>
                  </div>

                  {/* Coupon */}
                  <div className="mt-5">
                    <label className="text-xs text-emerald-700 font-medium">Coupon code</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        className="flex-1 border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        value={coupon}
                        onChange={(e) => setCoupon(e.target.value)}
                        placeholder="Coupon code"
                      />
                      <button
                        type="button"
                        onClick={applyCoupon}
                        className="px-4 py-2 rounded-lg border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 text-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                      >
                        Apply
                      </button>
                    </div>
                    {couponMsg && <p className="mt-2 text-sm text-emerald-700">{couponMsg}</p>}
                  </div>

                  {/* Payment */}
                  <div className="mt-5">
                    <label className="text-xs text-emerald-700 font-medium">Payment method</label>
                    <div className="mt-1 text-xs text-amber-700 font-medium">ℹ️ GCash payment is currently unavailable. Please use Cash on Delivery.</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={true}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-500 bg-gray-100 cursor-not-allowed"
                      >
                        GCash (Unavailable)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("COD")}
                        className={`px-4 py-2 rounded-lg border text-sm transition ${
                          paymentMethod === "COD"
                            ? "bg-emerald-700 text-white border-emerald-700"
                            : "border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        COD
                      </button>
                    </div>

                    {paymentMethod === "GCash" && (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                        <div className="font-semibold text-emerald-900">GCash Payment Instructions</div>
                        <div className="mt-2 text-emerald-900">
                          Contact the store for GCash payment details.
                          <div className="mt-2 text-sm">
                            <div><b>Amount:</b> {money(grandTotal)}</div>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-emerald-700 font-medium">
                              Reference number (optional)
                            </label>
                            <input
                              className="mt-1 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              value={gcashReference}
                              onChange={(e) => setGcashReference(e.target.value)}
                              placeholder="e.g. 1234567890"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-emerald-700 font-medium">
                              Upload proof screenshot (required)
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              className="mt-1 w-full text-sm"
                              onChange={(e) => setGcashProofFile(e.target.files?.[0] || null)}
                            />
                          </div>
                        </div>

                        {gcashProofPreview && (
                          <div className="mt-3">
                            <div className="text-xs text-emerald-700 font-medium mb-2">Preview</div>
                            <img
                              src={gcashProofPreview}
                              alt="GCash proof preview"
                              className="w-full max-w-sm rounded-xl border border-emerald-200 bg-white"
                            />
                          </div>
                        )}

                        {uploadingProof && (
                          <div className="mt-3 text-xs text-emerald-700 font-medium">Uploading proof…</div>
                        )}

                        <div className="mt-3 text-xs text-emerald-700">
                          Your payment will be marked <b>Pending Verification</b> until admin confirms.
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={placeOrder}
                    disabled={placing || items.length === 0 || uploadingProof}
                    className="mt-6 w-full px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                  >
                    {placing ? "Placing order…" : "Place order"}
                  </button>
                </>
              )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
