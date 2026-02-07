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

      // If profile doesn't exist yet, keep empty values (your trigger should create it, but this is safe)
      if (profileErr) {
        setErr(profileErr.message);
      } else if (profile) {
        setFullName(profile.full_name ?? "");
        setContactNumber(profile.contact_number ?? "");
        setAddress(profile.address ?? "");
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
      <h2 className="text-2xl font-bold">Profile</h2>
      <p className="text-sm text-gray-600 mt-1">Account settings and details.</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-[15rem_1fr] gap-6">
        <ProfileSidebar />

        <section className="min-w-0 space-y-6">
          {/* Account */}
          <div className="border rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold">Account</h3>

            {loading ? (
              <p className="mt-4 text-gray-600">Loading…</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs text-gray-500">Email</div>
                  <div className="text-sm font-semibold break-all">{email || "—"}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={sendPasswordReset}
                    className="px-4 py-2 rounded-lg border hover:bg-gray-50 text-sm"
                    type="button"
                  >
                    Send password reset email
                  </button>
                </div>

                <p className="text-xs text-gray-500">
                  This will send a reset link to your email.
                </p>
              </div>
            )}
          </div>

          {/* Profile details */}
          <div className="border rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold">Profile details</h3>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Full name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Your full name"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="text-xs text-gray-500">Contact number</label>
                <input
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="09xx xxx xxxx"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Shipping address */}
          <div className="border rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold">Shipping address</h3>

            <div className="mt-4">
              <label className="text-xs text-gray-500">Address</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-27.5"
                placeholder="House no., street, barangay, city, province"
                disabled={loading}
              />
              <p className="mt-2 text-xs text-gray-500">
                This will be used as your default delivery address.
              </p>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={saveProfile}
                disabled={loading || saving}
                className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-60 text-sm"
                type="button"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>

            {msg && <p className="mt-3 text-sm text-green-700">{msg}</p>}
            {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
