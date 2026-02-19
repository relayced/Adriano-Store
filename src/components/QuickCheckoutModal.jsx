import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const BARANGAY_SHIPPING = {
  "Poblacion": 20,
  "Pinagbarilan": 20,
  "Santo Cristo": 20,
  "Bagong Nayon": 40,
  "Barangca": 40,
  "Sabang": 40,
  "San Jose": 40,
  "San Roque": 40,
  "Santo Niño": 40,
  "Tangos": 40,
  "Tibag": 40,
  "Calantipay": 60,
  "Catulinan": 60,
  "Concepcion": 60,
  "Hinukay": 60,
  "Makinabang": 60,
  "Matangtubig": 60,
  "Pagala": 60,
  "Paitan": 60,
  "Piel": 60,
  "Santa Barbara": 60,
  "Subic": 60,
  "Sulivan": 60,
  "Tarcan": 60,
  "Tiaong": 60,
  "Tilapayong": 60,
  "Virjen De Los Flores": 60,
};

const BARANGAYS = [
  "Bagong Nayon",
  "Barangca",
  "Calantipay",
  "Catulinan",
  "Concepcion",
  "Makinabang",
  "Matangtubig",
  "Pagala",
  "Paitan",
  "Piel",
  "Pinagbarilan",
  "Poblacion",
  "Sabang",
  "San Jose",
  "San Roque",
  "Santa Barbara",
  "Santo Cristo",
  "Santo Niño",
  "Subic",
  "Sulivan",
  "Tangos",
  "Tarcan",
  "Tiaong",
  "Tibag",
  "Tilapayong",
  "Virjen De Los Flores",
  "Hinukay",
];

function money(n) {
  return `₱${Number(n || 0).toFixed(2)}`;
}

export default function QuickCheckoutModal({ open, onClose, item, onOrdered }) {
  const navigate = useNavigate();
  const [loadingUser, setLoadingUser] = useState(true);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [barangay, setBarangay] = useState("");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState("");

  const shippingFee = useMemo(() => {
    if (!barangay) return 0;
    return BARANGAY_SHIPPING[barangay] || 60;
  }, [barangay]);

  const productTotal = useMemo(
    () => Number(item?.price || 0) * Number(item?.qty || 0),
    [item?.price, item?.qty]
  );

  async function loadUserAndProfile() {
    setLoadingUser(true);
    setErr("");

    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const user = userRes?.user;
      if (!user) {
        setUserId("");
        setEmail("");
        setLoadingUser(false);
        return;
      }

      setUserId(user.id);
      setEmail(user.email || "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, contact_number, barangay, address")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        setFullName(profile.full_name ?? "");
        setContactNumber(profile.contact_number ?? "");
        setBarangay(profile.barangay ?? "");
        setAddress(profile.address ?? "");
      }
    } catch (e) {
      setErr(e?.message || "Failed to load profile.");
    } finally {
      setLoadingUser(false);
    }
  }

  useEffect(() => {
    if (open) {
      loadUserAndProfile();
    }
  }, [open]);

  async function saveProfileDetails() {
    if (!userId) return;
    const payload = {
      full_name: fullName.trim(),
      contact_number: contactNumber.trim(),
      barangay: barangay.trim(),
      address: address.trim(),
    };

    const { error } = await supabase.from("profiles").update(payload).eq("id", userId);
    if (error) throw error;
  }

  async function placeOrder() {
    setErr("");

    if (!userId) {
      navigate("/login");
      return;
    }

    if (!item?.product_id) {
      setErr("Product is missing.");
      return;
    }

    if (!fullName.trim() || !contactNumber.trim() || !barangay.trim() || !address.trim()) {
      setErr("Please fill all required fields including barangay.");
      return;
    }

    try {
      setPlacing(true);
      await saveProfileDetails();

      const { error: rpcErr } = await supabase.rpc("purchase_cart", {
        p_items: [
          {
            product_id: Number(item.product_id),
            qty: Number(item.qty || 1),
          },
        ],
        p_discount: 0,
        p_shipping_fee: Number(shippingFee || 0),
        p_shipping_zone: barangay || "Unknown",
        p_payment_method: paymentMethod,
        p_coupon_code: null,
        p_shipping_name: fullName.trim(),
        p_shipping_contact: contactNumber.trim(),
        p_shipping_address: address.trim(),
        p_payment_reference: null,
        p_payment_proof_url: null,
      });

      if (rpcErr) throw new Error(rpcErr.message || "Checkout failed.");

      if (typeof onOrdered === "function") onOrdered();
      if (typeof onClose === "function") onClose();
    } catch (e) {
      setErr(e?.message || "Failed to place order.");
    } finally {
      setPlacing(false);
    }
  }

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-emerald-200 shadow-lg overflow-hidden my-8">
        <div className="p-5 border-b border-emerald-200 bg-emerald-50 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-emerald-900">Checkout - {item.name}</h4>
            <p className="text-sm text-emerald-700 mt-1">Confirm your details, shipping, and payment.</p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl text-emerald-700 hover:text-emerald-900 shrink-0">
            ×
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {err}
            </div>
          )}

          <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50">
            <div className="grid grid-cols-[120px_1fr] gap-4">
              <div className="w-28 h-28 rounded-lg border border-emerald-200 bg-white overflow-hidden flex items-center justify-center">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-emerald-400">No img</span>
                )}
              </div>
              <div className="flex flex-col justify-between">
                <div>
                  <div className="font-semibold text-emerald-900 text-base">{item.name}</div>
                  <div className="text-sm text-emerald-700 mt-1">{money(item.price || 0)} per item</div>
                  {(item.options?.length || item.options?.color) && (
                    <div className="text-xs text-emerald-700 mt-1">
                      {item.options?.length ? `Length: ${item.options.length}` : ""}
                      {item.options?.length && item.options?.color ? " • " : ""}
                      {item.options?.color ? `Color: ${item.options.color}` : ""}
                    </div>
                  )}
                </div>
                <div className="text-sm text-emerald-700">Qty: {Number(item.qty || 1)}</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-emerald-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-emerald-700 font-medium">Subtotal</span>
                <span className="font-semibold text-emerald-900">{money(productTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-700 font-medium">Shipping fee</span>
                <span className="font-semibold text-emerald-900">{money(shippingFee)}</span>
              </div>
            </div>
          </div>

          {loadingUser && <p className="text-emerald-700">Loading account…</p>}

          {!loadingUser && !userId && (
            <div>
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
              {email && <p className="text-xs text-emerald-700">Signed in: {email}</p>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <label className="text-xs text-emerald-700 font-medium">Barangay <span className="text-red-600">*</span></label>
                  <select
                    className="mt-1 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    value={barangay}
                    onChange={(e) => setBarangay(e.target.value)}
                  >
                    <option value="">Select barangay</option>
                    {BARANGAYS.map((brgy) => (
                      <option key={brgy} value={brgy}>
                        {brgy}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-emerald-700 font-medium">Street/House Details</label>
                  <textarea
                    className="mt-1 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm min-h-20 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="House no., street, landmarks"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-emerald-700 font-medium">Payment method</label>
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
              </div>

              <div className="space-y-2 border-t border-emerald-200 pt-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-emerald-900">Subtotal</div>
                  <div className="text-sm font-semibold text-emerald-900">{money(productTotal)}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-emerald-900">Shipping fee</div>
                  <div className="text-sm font-semibold text-emerald-900">{money(shippingFee)}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-emerald-900">Total cost</div>
                  <div className="text-lg font-bold text-emerald-900">{money(productTotal + shippingFee)}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={placeOrder}
                disabled={placing}
                className="w-full px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                {placing ? "Placing order…" : "Place order"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
