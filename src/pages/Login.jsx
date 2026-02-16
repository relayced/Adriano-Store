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

    // Ensure profile exists (in case user was created before trigger existed)
    if (data?.user?.id) {
      try {
        // Check if profile exists
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", data.user.id)
          .maybeSingle();

        // If no profile, create it
        if (!profile) {
          await supabase.from("profiles").insert({
            id: data.user.id,
            email: data.user.email || "",
            role: "user",
          });
        }
      } catch (err) {
        // Ignore profile creation errors - don't block login
        console.warn("Could not ensure profile exists:", err?.message);
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
                  {showPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
            </div>

            <button
              disabled={busy}
              className="w-full px-4 py-2 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 transition font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>

            {msg && <p className="text-sm text-red-600 font-semibold">{msg}</p>}

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
