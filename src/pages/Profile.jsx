import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import ProfileSidebar from "../components/ProfileSidebar";

export default function Profile() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");

  const [fullName, setFullName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [address, setAddress] = useState("");

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMsg("");
      setErr("");

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      const user = userRes?.user;

      if (!alive) return;

      if (userErr) {
        setErr(userErr.message);
        setLoading(false);
        return;
      }

      if (!user) {
        // Not logged in
        setLoading(false);
        navigate("/login", { replace: true });
        return;
      }

      setEmail(user.email || "");
      setUserId(user.id);

      // Load profile row
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("full_name, contact_number, address")
        .eq("id", user.id)
        .maybeSingle();

      if (!alive) return;

      // Handle profile loading
      if (profileErr && profileErr.code !== "PGRST116") {
        // PGRST116 means no rows found, which is OK
        console.error("Profile query error:", profileErr);
        setErr(profileErr.message);
      }

      if (profile) {
        // Profile exists - use it
        setFullName(profile.full_name ?? "");
        setContactNumber(profile.contact_number ?? "");
        setAddress(profile.address ?? "");
      } else {
        // Profile doesn't exist yet - try to create it from auth metadata
        console.warn("No profile row found, creating from auth metadata...");
        
        const metadata = user?.user_metadata || {};
        const payload = {
          id: user.id,
          email: user.email || "",
          full_name: (metadata.full_name || "").trim(),
          contact_number: (metadata.contact_number || "").trim(),
          address: (metadata.address || "").trim(),
          role: "user",
        };

        try {
          const { error: createErr } = await supabase
            .from("profiles")
            .upsert(payload, { onConflict: "id" });

          if (!alive) return;

          if (createErr) {
            console.warn("Could not create profile:", createErr);
            // Still set the data from metadata so user can see and edit
          }

          setFullName(payload.full_name);
          setContactNumber(payload.contact_number);
          setAddress(payload.address);
        } catch (e) {
          console.warn("Profile creation error:", e);
          // Set from metadata anyway
          setFullName((metadata.full_name || "").trim());
          setContactNumber((metadata.contact_number || "").trim());
          setAddress((metadata.address || "").trim());
        }
      }

      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, [navigate]);

  async function saveProfile() {
    setSaving(true);
    setMsg("");
    setErr("");

    try {
      const payload = {
        full_name: fullName.trim(),
        contact_number: contactNumber.trim(),
        address: address.trim(),
      };

      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", userId);

      if (error) {
        setErr(error.message);
      } else {
        setMsg("Saved successfully ✅");
      }
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function sendPasswordReset() {
    setMsg("");
    setErr("");

    if (!email) {
      setErr("No email found for this account.");
      return;
    }

    try {
      // Sends password reset email
      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) {
        setErr(error.message);
      } else {
        setMsg("Password reset email sent. Check your inbox (and spam).");
      }
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h2 className="text-2xl font-bold text-emerald-900">Profile</h2>
      <p className="text-sm text-emerald-700 mt-1">Manage your account and preferences.</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-[15rem_1fr] gap-6">
        <ProfileSidebar />

        <section className="min-w-0">
          <div className="border border-emerald-200 rounded-xl bg-emerald-50 p-6">
            {loading ? (
              <p className="text-emerald-700">Loading…</p>
            ) : (
              <>
                {/* Account Section */}
                <div className="pb-4 border-b border-emerald-200">
                  <h3 className="text-sm font-semibold text-emerald-900 mb-3">Account</h3>
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-emerald-700">Email</div>
                      <div className="text-sm font-semibold text-emerald-900">{email || "—"}</div>
                    </div>
                    <button
                      onClick={sendPasswordReset}
                      className="mt-2 px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 text-xs transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                      type="button"
                    >
                      Reset password
                    </button>
                  </div>
                </div>

                {/* Profile Details Section */}
                <div className="py-4 border-b border-emerald-200">
                  <h3 className="text-sm font-semibold text-emerald-900 mb-3">Personal Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-emerald-700 font-medium">Full name</label>
                      <input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="mt-1.5 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="Your full name"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-emerald-700 font-medium">Contact number</label>
                      <input
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                        className="mt-1.5 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="09xx xxx xxxx"
                        disabled={loading}
                      />
                    </div>
                  </div>
                </div>

                {/* Shipping Address Section */}
                <div className="pt-4">
                  <h3 className="text-sm font-semibold text-emerald-900 mb-3">Delivery Address</h3>
                  <label className="text-xs text-emerald-700 font-medium">Address</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="mt-1.5 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm min-h-20 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="House no., street, barangay, city, province"
                    disabled={loading}
                  />
                  <p className="mt-1.5 text-xs text-emerald-700">
                    Used for order deliveries
                  </p>
                </div>

                {/* Actions */}
                <div className="mt-6 flex items-center gap-2">
                  <button
                    onClick={saveProfile}
                    disabled={loading || saving}
                    className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60 text-sm transition font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                    type="button"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>

                {msg && <p className="mt-3 text-sm text-emerald-700 font-medium">{msg}</p>}
                {err && <p className="mt-3 text-sm text-red-600 font-medium">{err}</p>}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
