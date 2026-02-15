import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

export default function Navbar({ session }) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const linkBase = "px-4 py-2 text-sm font-medium rounded-full transition";
  const inactive = "text-emerald-700 hover:bg-emerald-50";
  const active = "bg-emerald-700 text-white";

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="border-b border-emerald-900/20 bg-gradient-to-r from-emerald-900/5 to-white">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        {/* LEFT: LOGO */}
        <div
          className="text-2xl font-bold tracking-tight text-emerald-900 cursor-pointer"
          onClick={() => navigate("/")}
        >
          Adriano
        </div>

        {/* CENTER: NAV MENU (Desktop) */}
        <nav className="hidden md:flex items-center gap-2">
          <NavLink
            to="/"
            className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}
          >
            Home
          </NavLink>

          <NavLink
            to="/products"
            className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}
          >
            Shop
          </NavLink>

          <NavLink
            to="/offers"
            className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}
          >
            Offers
          </NavLink>
        </nav>

        {/* RIGHT: LOGIN/SIGNUP or PROFILE + HAMBURGER MENU */}
        <div className="flex items-center gap-4">
          {!session ? (
            <button
              onClick={() => navigate("/login")}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-700 text-white text-sm hover:bg-emerald-800 transition"
            >
              <span className="text-lg">👤</span>
              Sign In
            </button>
          ) : (
            <button
              onClick={() => navigate("/profile")}
              className="hidden sm:block px-4 py-2 rounded-full border border-emerald-900/20 text-emerald-700 text-sm hover:bg-emerald-50 transition"
            >
              Profile
            </button>
          )}

          {/* HAMBURGER MENU (Mobile) */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex flex-col gap-1.5"
            aria-label="Toggle menu"
          >
            <span className="w-6 h-0.5 bg-emerald-700 block"></span>
            <span className="w-6 h-0.5 bg-emerald-700 block"></span>
            <span className="w-6 h-0.5 bg-emerald-700 block"></span>
          </button>
        </div>
      </div>

      {/* MOBILE MENU */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-t border-emerald-900/20 bg-emerald-50/30">
          <div className="mx-auto max-w-6xl px-6 py-4 space-y-2">
            <NavLink
              to="/"
              onClick={closeMobileMenu}
              className={({ isActive }) => `block px-4 py-2 rounded-lg ${isActive ? "bg-emerald-700 text-white" : "text-emerald-700 hover:bg-emerald-100"}`}
            >
              Home
            </NavLink>

            <NavLink
              to="/products"
              onClick={closeMobileMenu}
              className={({ isActive }) => `block px-4 py-2 rounded-lg ${isActive ? "bg-emerald-700 text-white" : "text-emerald-700 hover:bg-emerald-100"}`}
            >
              Shop
            </NavLink>

            <NavLink
              to="/offers"
              onClick={closeMobileMenu}
              className={({ isActive }) => `block px-4 py-2 rounded-lg ${isActive ? "bg-emerald-700 text-white" : "text-emerald-700 hover:bg-emerald-100"}`}
            >
              Offers
            </NavLink>

            {!session ? (
              <button
                onClick={() => {
                  navigate("/login");
                  closeMobileMenu();
                }}
                className="w-full mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm hover:bg-emerald-800 transition"
              >
                <span className="text-lg">👤</span>
                Sign In
              </button>
            ) : (
              <button
                onClick={() => {
                  navigate("/profile");
                  closeMobileMenu();
                }}
                className="w-full mt-4 px-4 py-2 rounded-lg border border-emerald-900/20 text-emerald-700 text-sm hover:bg-emerald-100 transition"
              >
                Profile
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
