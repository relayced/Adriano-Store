import { NavLink, useNavigate } from "react-router-dom";

export default function Navbar({ session, fullName }) {
  const navigate = useNavigate();

  const linkBase = "px-4 py-2 text-sm font-medium rounded-full transition";
  const inactive = "text-gray-700 hover:bg-gray-100";
  const active = "bg-orange-400 text-white";

  const displayName =
    (fullName || "").trim() ||
    session?.user?.email?.split("@")?.[0] ||
    "User";

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

        {/* CENTER: NAV MENU */}
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

        {/* RIGHT: LOGIN/SIGNUP or WELCOME */}
        {!session ? (
          <button
            onClick={() => navigate("/login")}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-black text-white text-sm hover:opacity-90"
          >
            <span className="w-6 h-6 flex items-center justify-center rounded-full bg-orange-400 text-black text-xs font-bold">
              👤
            </span>
            Login / Signup
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-sm text-gray-700">
            </div>

            <button
              onClick={() => navigate("/profile")}
              className="px-4 py-2 rounded-full border text-sm hover:bg-gray-50"
            >
              Profile
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
