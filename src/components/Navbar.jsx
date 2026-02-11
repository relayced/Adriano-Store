import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

export default function Navbar({ session }) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const linkBase = "px-4 py-2 text-sm font-medium rounded-full transition";
  const inactive = "text-gray-700 hover:bg-gray-100";
  const active = "bg-orange-400 text-white";

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        {/* LEFT: LOGO */}
        <div
          className="text-xl font-bold tracking-tight text-[#0A2540] cursor-pointer"
          onClick={() => navigate("/")}
        >
          Adriano Store
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
            Browse Menu
          </NavLink>

          <NavLink
            to="/offers"
            className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}
          >
            Special Offers
          </NavLink>
        </nav>

        {/* RIGHT: LOGIN/SIGNUP or PROFILE + HAMBURGER MENU */}
        <div className="flex items-center gap-4">
          {!session ? (
            <button
              onClick={() => navigate("/login")}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-black text-white text-sm hover:opacity-90"
            >
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-orange-400 text-black text-xs font-bold">
                👤
              </span>
              Login / Signup
            </button>
          ) : (
            <button
              onClick={() => navigate("/profile")}
              className="hidden sm:block px-4 py-2 rounded-full border text-sm hover:bg-gray-50"
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
            <span className="w-6 h-0.5 bg-gray-800 block"></span>
            <span className="w-6 h-0.5 bg-gray-800 block"></span>
            <span className="w-6 h-0.5 bg-gray-800 block"></span>
          </button>
        </div>
      </div>

      {/* MOBILE MENU */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-t bg-white">
          <div className="mx-auto max-w-6xl px-6 py-4 space-y-2">
            <NavLink
              to="/"
              onClick={closeMobileMenu}
              className={({ isActive }) => `block px-4 py-2 rounded-lg ${isActive ? "bg-orange-400 text-white" : "text-gray-700 hover:bg-gray-100"}`}
            >
              Home
            </NavLink>

            <NavLink
              to="/products"
              onClick={closeMobileMenu}
              className={({ isActive }) => `block px-4 py-2 rounded-lg ${isActive ? "bg-orange-400 text-white" : "text-gray-700 hover:bg-gray-100"}`}
            >
              Browse Menu
            </NavLink>

            <NavLink
              to="/offers"
              onClick={closeMobileMenu}
              className={({ isActive }) => `block px-4 py-2 rounded-lg ${isActive ? "bg-orange-400 text-white" : "text-gray-700 hover:bg-gray-100"}`}
            >
              Special Offers
            </NavLink>

            {!session ? (
              <button
                onClick={() => {
                  navigate("/login");
                  closeMobileMenu();
                }}
                className="w-full mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-black text-white text-sm hover:opacity-90"
              >
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-orange-400 text-black text-xs font-bold">
                  👤
                </span>
                Login / Signup
              </button>
            ) : (
              <button
                onClick={() => {
                  navigate("/profile");
                  closeMobileMenu();
                }}
                className="w-full mt-4 px-4 py-2 rounded-lg border text-sm hover:bg-gray-50"
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
