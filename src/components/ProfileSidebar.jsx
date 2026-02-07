import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const ADMIN_EMAILS = ["ralphdenverdimapilis@gmail.com"];

function getCartCount() {
  try {
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    return cart.reduce((s, i) => s + Number(i.qty || 0), 0);
  } catch {
    return 0;
  }
}

function withTimeout(promise, ms = 4000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export default function ProfileSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [cartCount, setCartCount] = useState(getCartCount());

  useEffect(() => {
    const sync = () => setCartCount(getCartCount());
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  useEffect(() => {
    async function loadUser() {
      try {
        const { data } = await withTimeout(supabase.auth.getUser(), 4000);
        const user = data?.user;
        if (!user) return;

        const emailNorm = (user.email || "").trim().toLowerCase();
        setEmail(emailNorm);

        let admin = ADMIN_EMAILS.map((e) => e.trim().toLowerCase()).includes(emailNorm);

        const { data: profile, error } = await withTimeout(
          supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
          4000
        );

        if (error) console.log("sidebar profile error:", error);

        if (profile?.role && String(profile.role).trim().toLowerCase() === "admin") admin = true;
        setIsAdmin(admin);
      } catch (e) {
        console.log("loadUser timeout:", e);
      }
    }

    loadUser();
  }, []);

  const links = useMemo(
    () => [
      { to: "/profile", label: "Account", icon: "👤" },
      { to: "/orders", label: "Orders", icon: "📦" },
      { to: "/cart", label: "Cart", icon: "🛒", badge: cartCount > 0 ? cartCount : null },
    ],
    [cartCount]
  );

  const isActive = (path) => location.pathname === path;

  async function logout() {
    try {
      await withTimeout(supabase.auth.signOut(), 4000);
    } catch {
      // ignore timeouts; we still force logout UI-side
    }
    localStorage.removeItem("cart");
    navigate("/login", { replace: true });
    window.location.reload(); // hard reset session UI
  }

  return (
    <aside className="border rounded-xl bg-white p-4 w-full max-w-xs">
      <div className="mb-3">
        <div className="text-xs text-gray-500">Signed in as</div>
        <div className="text-sm font-semibold break-all">{email}</div>

        {isAdmin && (
          <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-black text-white">
            Admin
          </span>
        )}
      </div>

      <nav className="space-y-1">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm border ${
              isActive(l.to) ? "bg-black text-white border-black" : "hover:bg-gray-50"
            }`}
          >
            <span className="flex items-center gap-2">
              <span>{l.icon}</span>
              {l.label}
            </span>

            {l.badge && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${isActive(l.to) ? "bg-white/20" : "bg-black text-white"}`}>
                {l.badge}
              </span>
            )}
          </Link>
        ))}

        {isAdmin && (
          <Link
            to="/admin"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
              isActive("/admin") ? "bg-black text-white border-black" : "hover:bg-gray-50"
            }`}
          >
            🛠️ Admin
          </Link>
        )}
      </nav>

      <button onClick={logout} className="mt-4 w-full px-3 py-2 text-sm rounded-lg border hover:bg-gray-50">
        Log out
      </button>
    </aside>
  );
}
