import { useState } from "react";
import { supabase } from "../supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import loginImg from "../assets/login.jpg";

export default function Signup() {
  const [fullName, setFullName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleSignup(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          contact_number: contactNumber,
          address: address,
        },
      },
    });

    setBusy(false);

    if (error) return setMsg(error.message);

    // If email confirmation is ON, they must verify then log in
    navigate("/login");
  }

  return (
    <main className="min-h-screen grid place-items-center px-6 py-10 bg-gray-50">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border bg-white shadow-sm grid grid-cols-1 md:grid-cols-2">
        <div className="hidden md:block relative">
          <img src={loginImg} alt="Signup design" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/20" />
          <div className="absolute bottom-6 left-6 right-6 text-white">
            <div className="text-lg font-semibold">Create your account</div>
            <div className="text-sm text-white/90">
              Save your details for faster checkout.
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8">
          <h2 className="text-2xl font-bold">Sign up</h2>
          <p className="text-sm text-gray-600 mt-1">
            Create an account to buy products.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSignup}>
            <div className="space-y-1">
              <label className="text-sm text-gray-600">Full name</label>
              <input
                className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-black/10"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-gray-600">Contact number</label>
              <input
                className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-black/10"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="09xxxxxxxxx"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-gray-600">Address</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-black/10 min-h-24
"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House/Street, Barangay, City, Province"
              />
            </div>

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
                placeholder="At least 6 characters"
                autoComplete="new-password"
                required
              />
            </div>

            <button
              disabled={busy}
              className="w-full px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create account"}
            </button>

            {msg && <p className="text-sm text-red-600">{msg}</p>}

            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <Link to="/login" className="underline">
                Log in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
