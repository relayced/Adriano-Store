import { useState } from "react";
import { supabase } from "../supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import loginImg from "../assets/login.jpg";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (error) return setMsg(error.message);
    navigate("/");
  }

  return (
    <main className="min-h-screen grid place-items-center px-6 py-10 bg-gray-50">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border bg-white shadow-sm grid grid-cols-1 md:grid-cols-2">
        {/* Left image */}
        <div className="hidden md:block relative">
          <img
            src={loginImg}
            alt="Login design"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-black/20" />
          <div className="absolute bottom-6 left-6 right-6 text-white">
            <div className="text-lg font-semibold">Adriano Store</div>
            <div className="text-sm text-white/90">
              School supplies & paintings, minimalist shopping.
            </div>
          </div>
        </div>

        {/* Right form */}
        <div className="p-6 md:p-8">
          <h2 className="text-2xl font-bold">Log in</h2>
          <p className="text-sm text-gray-600 mt-1">
            Access checkout, orders, and cart.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <div className="space-y-1">
              <label className="text-sm text-gray-600">Email</label>
              <input
                className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-black/10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-gray-600">Password</label>
              <input
                className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-black/10"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              disabled={busy}
              className="w-full px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Logging in…" : "Log in"}
            </button>

            {msg && <p className="text-sm text-red-600">{msg}</p>}

            <p className="text-sm text-gray-600">
              No account?{" "}
              <Link to="/signup" className="underline">
                Sign up
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
