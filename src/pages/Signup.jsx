import { useState } from "react";
import { supabase } from "../supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import loginImg from "../assets/login.jpg";

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

export default function Signup() {
  const [fullName, setFullName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [barangay, setBarangay] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleSignup(e) {
    e.preventDefault();
    setMsg("");

    // Validate Gmail only
    if (!email.endsWith("@gmail.com")) {
      setMsg("Please use a Gmail address (@gmail.com)");
      return;
    }

    // Validate barangay selection
    if (!barangay) {
      setMsg("Please select your barangay");
      return;
    }

    setBusy(true);

    try {
      // Step 1: Create auth user with metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            contact_number: contactNumber,
            barangay: barangay,
            address: address,
          },
        },
      });

      if (authError) {
        setMsg(authError.message);
        setBusy(false);
        return;
      }

      // Step 2: After user is created, ensure profile exists
      if (authData?.user?.id) {
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert(
            {
              id: authData.user.id,
              email: email,
              full_name: fullName.trim(),
              contact_number: contactNumber.trim(),
              barangay: barangay,
              address: address.trim(),
              role: "user",
            },
            { onConflict: "id" }
          );

        if (profileError) {
          console.warn("Profile creation warning:", profileError);
          // Don't fail signup if profile creation fails - user can update later
        }
      }

      setBusy(false);
      // If email confirmation is ON, they must verify then log in
      navigate("/login");
    } catch (err) {
      console.error("Signup error:", err);
      setMsg(err?.message || "An error occurred during signup");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-6 py-10 bg-gray-50">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-emerald-900/20 bg-white shadow-md grid grid-cols-1 md:grid-cols-2">
        <div className="hidden md:block relative bg-emerald-700">
          <img src={loginImg} alt="Signup design" className="h-full w-full object-cover opacity-80" />
          <div className="absolute inset-0 bg-emerald-700/30" />
          <div className="absolute bottom-6 left-6 right-6 text-white">
            <div className="text-2xl font-bold">Join us</div>
            <div className="text-sm text-emerald-50 mt-2">
              Get faster checkout and track your orders.
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8">
          <h2 className="text-3xl font-bold text-emerald-900">Create account</h2>
          <p className="text-sm text-emerald-700 mt-1">
            Welcome to Adriano
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSignup}>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-emerald-900">Full name</label>
              <input
                className="w-full border border-emerald-900/20 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-600 transition"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-emerald-900">Contact number</label>
              <input
                className="w-full border border-emerald-900/20 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-600 transition"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="09xxxxxxxxx"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-emerald-900">Barangay</label>
              <select
                className="w-full border border-emerald-900/20 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-600 transition bg-white"
                value={barangay}
                onChange={(e) => setBarangay(e.target.value)}
                required
              >
                <option value="">Select your barangay</option>
                {BARANGAYS.map((brgy) => (
                  <option key={brgy} value={brgy}>
                    {brgy}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-emerald-900">Address</label>
              <textarea
                className="w-full border border-emerald-900/20 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-600 transition min-h-20"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House/Street number and other details"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-emerald-900">Email</label>
              <input
                className="w-full border border-emerald-900/20 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-600 transition"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@gmail.com"
                type="email"
                pattern=".*@gmail\.com$"
                title="Please use a Gmail address (@gmail.com)"
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-emerald-900">Password</label>
              <div className="relative">
                <input
                  className="w-full border border-emerald-900/20 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-600 transition pr-10"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-800 transition"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-5 w-5"
                    >
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-5 w-5"
                    >
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                      <path d="M9.9 5.1C10.6 5 11.3 5 12 5c6 0 10 7 10 7a18.6 18.6 0 0 1-4.3 5.3" />
                      <path d="M6.1 6.1A18.6 18.6 0 0 0 2 12s4 7 10 7c1 0 1.9-.1 2.8-.3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              disabled={busy}
              className="w-full px-4 py-2 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 transition font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              {busy ? "Creating…" : "Create account"}
            </button>

            {msg && <p className="text-sm text-red-600 font-semibold">{msg}</p>}

            <p className="text-sm text-emerald-700">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold hover:text-emerald-900 underline">
                Log in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
