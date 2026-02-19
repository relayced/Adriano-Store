import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import ProfileSidebar from "../components/ProfileSidebar";

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

export default function Profile() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [barangay, setBarangay] = useState("");
  const [address, setAddress] = useState("");

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function splitFullName(value) {
    const cleaned = String(value || "").trim().replace(/\s+/g, " ");
    if (!cleaned) return { first: "", last: "" };
    const parts = cleaned.split(" ");
    if (parts.length === 1) return { first: parts[0], last: "" };
    return { first: parts[0], last: parts.slice(1).join(" ") };
  }

  function validateNameParts(first, last) {
    const firstClean = String(first || "").trim().replace(/\s+/g, " ");
    const lastClean = String(last || "").trim().replace(/\s+/g, " ");

    if (!firstClean || !lastClean) return "Please enter your first and last name.";

    const firstLetters = firstClean.replace(/[^A-Za-z]/g, "");
    const lastLetters = lastClean.replace(/[^A-Za-z]/g, "");

    if (firstLetters.length < 2 || lastLetters.length < 2) {
      return "Each name must be at least 2 letters.";
    }

    const isRepeated = (letters) => /^(.)\1+$/.test(letters.toLowerCase());
    const isBlacklisted = (letters) => {
      const blocked = new Set([
        "test",
        "testing",
        "asdf",
        "qwerty",
        "zxcv",
        "abc",
        "abcde",
        "unknown",
        "name",
        "firstname",
        "lastname",
      ]);
      return blocked.has(letters.toLowerCase());
    };

    const vowelCount = (letters) => (letters.match(/[aeiou]/gi) || []).length;
    const hasVowel = (letters) => /[aeiou]/i.test(letters);
    const hasLongConsonantStreak = (letters) => {
      const cleaned = letters.toLowerCase().replace(/[^a-z]/g, "");
      let streak = 0;
      for (const ch of cleaned) {
        if ("aeiou".includes(ch)) {
          streak = 0;
        } else {
          streak += 1;
          if (streak > 3) return true;
        }
      }
      return false;
    };

    if (isRepeated(firstLetters) || isRepeated(lastLetters)) {
      return "Please enter a real first and last name.";
    }

    if (isBlacklisted(firstLetters) || isBlacklisted(lastLetters)) {
      return "Please enter a real first and last name.";
    }

    const firstVowels = vowelCount(firstLetters);
    const lastVowels = vowelCount(lastLetters);

    if (!hasVowel(firstLetters) || !hasVowel(lastLetters) ||
        hasLongConsonantStreak(firstLetters) || hasLongConsonantStreak(lastLetters)) {
      return "Please enter a real first and last name.";
    }

    const firstRatio = firstLetters.length ? firstVowels / firstLetters.length : 0;
    const lastRatio = lastLetters.length ? lastVowels / lastLetters.length : 0;

    if ((firstLetters.length >= 6 && firstVowels < 2) || (lastLetters.length >= 6 && lastVowels < 2)) {
      return "Please enter a real first and last name.";
    }

    if ((firstLetters.length >= 6 && firstRatio < 0.3) || (lastLetters.length >= 6 && lastRatio < 0.3)) {
      return "Please enter a real first and last name.";
    }

    return "";
  }

  function validateContactNumber(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "Contact number is required.";

    const isLocal = digits.length === 11 && digits.startsWith("09");
    const isIntl = digits.length === 12 && digits.startsWith("63") && digits[2] === "9";

    if (!isLocal && !isIntl) {
      return "Please enter a valid PH mobile number (09xxxxxxxxx or +639xxxxxxxxx).";
    }

    return "";
  }

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
        .select("full_name, contact_number, barangay, address")
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
        const parsed = splitFullName(profile.full_name);
        setFirstName(parsed.first);
        setLastName(parsed.last);
        setContactNumber(profile.contact_number ?? "");
        setBarangay(profile.barangay ?? "");
        setAddress(profile.address ?? "");
      } else {
        // Profile doesn't exist yet - try to create it from auth metadata
        console.warn("No profile row found, creating from auth metadata...");
        
        const metadata = user?.user_metadata || {};
        const metaFirst = (metadata.first_name || "").trim();
        const metaLast = (metadata.last_name || "").trim();
        const parsed = metaFirst || metaLast ? { first: metaFirst, last: metaLast } : splitFullName(metadata.full_name);
        const fullName = `${parsed.first} ${parsed.last}`.trim();
        const payload = {
          id: user.id,
          email: user.email || "",
          full_name: fullName,
          contact_number: (metadata.contact_number || "").trim(),
          barangay: (metadata.barangay || "").trim(),
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

          const parsedPayload = splitFullName(payload.full_name);
          setFirstName(parsedPayload.first);
          setLastName(parsedPayload.last);
          setContactNumber(payload.contact_number);
          setBarangay(payload.barangay);
          setAddress(payload.address);
        } catch (e) {
          console.warn("Profile creation error:", e);
          // Set from metadata anyway
          setFirstName(parsed.first);
          setLastName(parsed.last);
          setContactNumber((metadata.contact_number || "").trim());
          setBarangay((metadata.barangay || "").trim());
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

    const nameError = validateNameParts(firstName, lastName);
    if (nameError) {
      setErr(nameError);
      setSaving(false);
      return;
    }

    const contactError = validateContactNumber(contactNumber);
    if (contactError) {
      setErr(contactError);
      setSaving(false);
      return;
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

    try {
      const payload = {
        full_name: fullName.trim(),
        contact_number: contactNumber.trim(),
        barangay: barangay.trim(),
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

      <div className="mt-6 grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-6">
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
                      <label className="text-xs text-emerald-700 font-medium">First name</label>
                      <input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="mt-1.5 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="First name"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-emerald-700 font-medium">Last name</label>
                      <input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="mt-1.5 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="Last name"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-emerald-700 font-medium">Contact number</label>
                      <input
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                        className="mt-1.5 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="09xxxxxxxxx or +639xxxxxxxxx"
                        type="tel"
                        inputMode="numeric"
                        disabled={loading}
                      />
                    </div>
                  </div>
                </div>

                {/* Shipping Address Section */}
                <div className="pt-4">
                  <h3 className="text-sm font-semibold text-emerald-900 mb-3">Delivery Address</h3>
                  
                  {!barangay && (
                    <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-300">
                      <p className="text-sm text-amber-800 font-medium">📍 Please select your barangay for accurate shipping fees</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-emerald-700 font-medium">Barangay <span className="text-red-600">*</span></label>
                      <select
                        value={barangay}
                        onChange={(e) => setBarangay(e.target.value)}
                        className="mt-1.5 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        disabled={loading}
                      >
                        <option value="">Select barangay</option>
                        {BARANGAYS.map((brgy) => (
                          <option key={brgy} value={brgy}>
                            {brgy}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-emerald-700 font-medium">Street/House Details</label>
                      <textarea
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="mt-1.5 w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm min-h-20 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="House no., street, landmarks"
                        disabled={loading}
                      />
                      <p className="mt-1.5 text-xs text-emerald-700">
                        Shipping fee is based on your selected barangay
                      </p>
                    </div>
                  </div>
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
