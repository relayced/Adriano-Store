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

function SidebarIcon({ name }) {
  if (name === "account") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21a8 8 0 0 0-16 0" />
        <circle cx="12" cy="8" r="4" />
      </svg>
    );
  }
  if (name === "orders") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7h18" />
        <path d="M6 3h12l1 4H5l1-4z" />
        <path d="M5 7h14v12H5z" />
      </svg>
    );
  }
  if (name === "cart") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="18" cy="20" r="1.5" />
        <path d="M2 3h3l2.1 10.5a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 2-1.5L22 7H7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.3 4.7L19 9l-4.7 2.3L12 16l-2.3-4.7L5 9l4.7-2.3L12 2z" />
    </svg>
  );
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
      { to: "/profile", label: "Account", icon: "account" },
      { to: "/orders", label: "Orders", icon: "orders" },
      { to: "/cart", label: "Cart", icon: "cart", badge: cartCount > 0 ? cartCount : null },
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
    <aside className="border border-emerald-200 rounded-xl bg-emerald-50 p-4 w-full max-w-sm">
      <div className="mb-3">
        <div className="text-xs text-emerald-700">Signed in as</div>
        <div className="text-sm font-semibold break-all text-emerald-900">{email}</div>

        {isAdmin && (
          <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-emerald-700 text-white">
            Admin
          </span>
        )}
      </div>

      <nav className="space-y-1">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm border transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
              isActive(l.to) ? "bg-emerald-700 text-white border-emerald-700" : "border-emerald-200 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="shrink-0">
                <SidebarIcon name={l.icon} />
              </span>
              {l.label}
            </span>

            {l.badge && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${isActive(l.to) ? "bg-white/20" : "bg-emerald-200 text-emerald-900"}`}>
                {l.badge}
              </span>
            )}
          </Link>
        ))}

        {isAdmin && (
          <Link
            to="/admin"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
              isActive("/admin") ? "bg-emerald-700 text-white border-emerald-700" : "border-emerald-200 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            <SidebarIcon name="admin" /> Admin
          </Link>
        )}
      </nav>

      <button onClick={logout} className="mt-4 w-full px-3 py-2 text-sm rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
        Log out
      </button>
    </aside>
  );
}
