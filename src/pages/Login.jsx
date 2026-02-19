import { useState } from "react";
import { supabase } from "../supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import loginImg from "../assets/login.jpg";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);

    const { data, error } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });
    
    if (error) {
      setBusy(false);
      return setMsg(error.message);
    }

    // Check if user is banned
    if (data?.user?.id) {
      try {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, banned")
          .eq("id", data.user.id)
          .maybeSingle();

        console.log("[Login] Profile check:", { profile, profileError, userId: data.user.id });

        // If user is banned, show error and keep them on this page
        if (profile?.banned === true) {
          console.log("[Login] User is banned - preventing login");
          setBusy(false);
          return setMsg("Your account has been suspended. You cannot log in at this time. Please contact support for assistance.");
        }

        // If profile query failed, sign them out and show error
        if (profileError) {
          console.warn("[Login] Profile query error:", profileError);
          await supabase.auth.signOut();
          setBusy(false);
          return setMsg("Could not verify your account. Please try again.");
        }

        // If no profile, create it
        if (!profile) {
          console.log("[Login] Creating new profile for user");
          await supabase.from("profiles").insert({
            id: data.user.id,
            email: data.user.email || "",
            role: "user",
            banned: false,
          });
        }
      } catch (err) {
        console.error("[Login] Error during ban check:", err);
        await supabase.auth.signOut();
        setBusy(false);
        return setMsg("An error occurred during login. Please try again.");
      }
    }

    setBusy(false);
    navigate("/");
  }

  return (
    <main className="min-h-screen grid place-items-center px-6 py-10 bg-gray-50">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-emerald-900/20 bg-white shadow-md grid grid-cols-1 md:grid-cols-2">
        {/* Left image */}
        <div className="hidden md:block relative bg-emerald-700">
          <img
            src={loginImg}
            alt="Login design"
            className="h-full w-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-emerald-700/30" />
          <div className="absolute bottom-6 left-6 right-6 text-white">
            <div className="text-2xl font-bold">Adriano</div>
            <div className="text-sm text-emerald-50 mt-2">
              Campus essentials & supplies. Smart shopping for students.
            </div>
          </div>
        </div>

        {/* Right form */}
        <div className="p-6 md:p-8">
          <h2 className="text-3xl font-bold text-emerald-900">Welcome back</h2>
          <p className="text-sm text-emerald-700 mt-1">
            Sign in to your account
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            {msg && (
              <div className={`rounded-xl border-2 p-4 flex gap-3 ${
                msg.toLowerCase().includes("suspended") 
                  ? "border-red-300 bg-red-50"
                  : "border-red-300 bg-red-50"
              }`}>
                <div className="text-2xl">🚫</div>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${
                    msg.toLowerCase().includes("suspended")
                      ? "text-red-900"
                      : "text-red-800"
                  }`}>
                    {msg.toLowerCase().includes("suspended") ? "Account Suspended" : "Login Error"}
                  </p>
                  <p className={`text-sm mt-1 ${
                    msg.toLowerCase().includes("suspended")
                      ? "text-red-800"
                      : "text-red-700"
                  }`}>
                    {msg}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-semibold text-emerald-900">Email</label>
              <input
                className="w-full border border-emerald-900/20 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-600 transition"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
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
                  placeholder="••••••••"
                  autoComplete="current-password"
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
              {busy ? "Signing in…" : "Sign in"}
            </button>

            <p className="text-sm text-emerald-700">
              Don't have an account?{" "}
              <Link to="/signup" className="font-semibold hover:text-emerald-900 underline">
                Sign up
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
