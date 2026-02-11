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

  // Your own GCash details (display only)
  const GCASH_NAME = "Ralph Denver Dimapilis";
  const GCASH_NUMBER = "0936 717 4070";

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

      const { data, error } = await supabase.auth.getUser();
      const user = data?.user;

      if (!alive) return;

      if (error) console.error("auth.getUser error:", error);

      if (!user) {
        setLoadingUser(false);
        return;
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

  const discount = useMemo(() => {
    const code = coupon.trim().toUpperCase();
    if (!code) return 0;
    if (code === "SAVE10") return subtotal * 0.1;
    if (code === "LESS50") return 50;
    return 0;
  }, [coupon, subtotal]);

  const shippingFee = useMemo(() => {
    if (shippingMode === "gps") {
      if (distanceKm == null) return 0;
      return computeShippingFromKm(distanceKm);
    }
    const z = SHIPPING_ZONES.find((x) => x.value === shippingZone);
    return z ? Number(z.fee || 0) : 0;
  }, [shippingMode, distanceKm, shippingZone]);

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
    const { error } = await supabase.from("profiles").update(payload).eq("id", userId);
    if (error) throw error;
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

      const purchaseItems = toPurchaseItems(items);

      const { error: rpcErr } = await supabase.rpc("purchase_cart", {
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

      if (rpcErr) throw new Error(rpcErr.message || "Checkout failed.");

      // Clear cart
      setItems([]);
      setShowCheckout(false);

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
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Profile</h2>
          <p className="text-sm text-gray-600 mt-1">Manage your orders and cart.</p>
        </div>
        <button
          type="button"
          onClick={() => setItemsState(getCart())}
          className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 w-fit"
        >
          Refresh cart
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        <ProfileSidebar />

        <section className="space-y-6">
          <div className="flex items-end justify-between gap-3">
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

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {err}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div className="space-y-3">
              {items.map((x) => (
                <div
                  key={x.product_id}
                  className="border rounded-2xl p-4 bg-white flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  <div className="w-16 h-16 rounded-xl border bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                    {x.image_url ? (
                      <img src={x.image_url} alt={x.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-gray-400">No img</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{x.name}</div>
                    <div className="text-sm text-gray-600">{money(x.price)}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      className="w-24 border rounded-lg px-3 py-2 text-sm"
                      value={x.qty}
                      onChange={(e) => updateQty(x.product_id, e.target.value)}
                    />
                    <button
                      onClick={() => removeItem(x.product_id)}
                      className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {items.length === 0 && (
                <div className="border rounded-2xl p-6 bg-white text-gray-600">
                  Your cart is empty.
                  <button className="ml-2 underline" onClick={() => navigate("/products")}>
                    Browse products
                  </button>
                </div>
              )}
            </div>

            <div className="lg:sticky lg:top-6 h-fit border rounded-2xl p-5 bg-white space-y-3">
              <div className="text-sm font-semibold">Summary</div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold">{money(subtotal)}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping</span>
                <span className="font-semibold">{money(shippingFee)}</span>
              </div>

              <div className="pt-3 border-t flex justify-between">
                <span className="font-semibold">Grand total</span>
                <span className="font-semibold">{money(grandTotal)}</span>
              </div>

              <button
                type="button"
                onClick={() => setShowCheckout(true)}
                disabled={items.length === 0}
                className="w-full mt-2 px-4 py-2 rounded-lg bg-orange-400 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                Checkout
              </button>

              <p className="text-xs text-gray-500">
                Shipping fee uses free GPS distance or a zone fallback.
              </p>
            </div>
          </div>

          {showCheckout && (
            <div className="border rounded-2xl p-6 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold">Checkout</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Confirm your details, shipping, and payment.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCheckout(false)}
                  className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

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
                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Full name</label>
                      <input
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Contact number</label>
                      <input
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-gray-500">Address</label>
                      <textarea
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-[110px]"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Shipping */}
                  <div className="mt-5 border rounded-xl p-4 bg-gray-50">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">Shipping fee</div>
                        <div className="text-xs text-gray-600">
                          GPS = real distance (free), Zone = manual fallback.
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShippingMode("gps")}
                          className={`px-3 py-2 rounded-lg border text-sm ${
                            shippingMode === "gps"
                              ? "bg-black text-white border-black"
                              : "hover:bg-white"
                          }`}
                        >
                          GPS
                        </button>
                        <button
                          type="button"
                          onClick={() => setShippingMode("zone")}
                          className={`px-3 py-2 rounded-lg border text-sm ${
                            shippingMode === "zone"
                              ? "bg-black text-white border-black"
                              : "hover:bg-white"
                          }`}
                        >
                          Zone
                        </button>
                      </div>
                    </div>

                    {shippingMode === "gps" ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={useMyLocation}
                          className="px-4 py-2 rounded-lg bg-white border text-sm hover:bg-gray-50"
                        >
                          Use my location
                        </button>
                        {locStatus && (
                          <div className="mt-2 text-sm text-gray-700">{locStatus}</div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3">
                        <label className="text-xs text-gray-600">Select zone</label>
                        <select
                          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                          value={shippingZone}
                          onChange={(e) => setShippingZone(e.target.value)}
                        >

                        </select>
                      </div>
                    )}

                    <div className="mt-3 flex justify-between text-sm">
                      <span className="text-gray-600">Shipping fee</span>
                      <span className="font-semibold">{money(shippingFee)}</span>
                    </div>
                  </div>

                  {/* Coupon */}
                  <div className="mt-5">
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
                    {couponMsg && <p className="mt-2 text-sm text-gray-600">{couponMsg}</p>}
                  </div>

                  {/* Payment */}
                  <div className="mt-5">
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
                        COD
                      </button>
                    </div>

                    {paymentMethod === "GCash" && (
                      <div className="mt-4 rounded-xl border bg-blue-50 p-4 text-sm">
                        <div className="font-semibold">GCash Payment Instructions</div>
                        <div className="mt-2 text-gray-800">
                          Send payment to:
                          <div className="mt-2 text-sm">
                            <div><b>Name:</b> {GCASH_NAME}</div>
                            <div><b>Number:</b> {GCASH_NUMBER}</div>
                            <div><b>Amount:</b> {money(grandTotal)}</div>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-600">
                              Reference number (optional)
                            </label>
                            <input
                              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                              value={gcashReference}
                              onChange={(e) => setGcashReference(e.target.value)}
                              placeholder="e.g. 1234567890"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-gray-600">
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
                            <div className="text-xs text-gray-600 mb-2">Preview</div>
                            <img
                              src={gcashProofPreview}
                              alt="GCash proof preview"
                              className="w-full max-w-sm rounded-xl border bg-white"
                            />
                          </div>
                        )}

                        {uploadingProof && (
                          <div className="mt-3 text-xs text-gray-700">Uploading proof…</div>
                        )}

                        <div className="mt-3 text-xs text-gray-600">
                          Your payment will be marked <b>Pending Verification</b> until admin confirms.
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={placeOrder}
                    disabled={placing || items.length === 0 || uploadingProof}
                    className="mt-6 w-full px-4 py-2 rounded-lg bg-orange-400 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
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
