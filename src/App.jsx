import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

import Navbar from "./components/Navbar";

import Checkout from "./pages/Checkout";
import Home from "./pages/Home";
import Products from "./pages/Products";
import Cart from "./pages/Cart";
import Orders from "./pages/Orders";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import SpecialOffers from "./pages/SpecialOffers";

/**
 * Safer timeout helper:
 * - For Supabase PostgREST builders, we can abort using .abortSignal(signal).
 * - For plain promises, we just race with a timer.
 */
function withTimeoutAbort(builderOrPromise, ms = 12000) {
  // If it looks like a Postgrest builder (has abortSignal), use AbortController
  if (builderOrPromise && typeof builderOrPromise.abortSignal === "function") {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);

    return builderOrPromise
      .abortSignal(controller.signal)
      .then((res) => res)
      .catch((err) => {
        // Normalize abort error message
        if (err?.name === "AbortError") throw new Error("Request timeout");
        throw err;
      })
      .finally(() => clearTimeout(t));
  }

  // Fallback: plain promise timeout race
  return Promise.race([
    builderOrPromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), ms)
    ),
  ]);
}

export default function App() {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState("user");
  const [fullName, setFullName] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    let alive = true;

    async function init() {
      setLoadingProfile(true);
      try {
        // getSession usually returns fast; keep a generous timeout
        const { data } = await withTimeoutAbort(supabase.auth.getSession(), 30000);
        if (!alive) return;

        const s = data?.session ?? null;
        setSession(s);

        if (s?.user?.id) {
          await loadProfile(s.user.id);
        } else {
          setRole("user");
          setFullName("");
          setLoadingProfile(false);
        }
      } catch (e) {
        console.error("init error:", e);
        if (!alive) return;
        setSession(null);
        setRole("user");
        setFullName("");
        setLoadingProfile(false);
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!alive) return;

      setSession(newSession);

      if (newSession?.user?.id) {
        setLoadingProfile(true);
        await loadProfile(newSession.user.id);
      } else {
        setRole("user");
        setFullName("");
        setLoadingProfile(false);
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile(userId) {
    setLoadingProfile(true);
    try {
      // ✅ Abortable timeout (prevents “hang forever”)
      const { data, error } = await withTimeoutAbort(
        supabase.from("profiles").select("role, full_name").eq("id", userId).maybeSingle(),
        12000
      );

      if (error) {
        console.error("loadProfile error:", error);
        setRole("user");
        setFullName("");
        return;
      }

      if (!data) {
        console.warn("No profile row for:", userId);
        setRole("user");
        setFullName("");
        return;
      }

      const normalizedRole = String(data.role ?? "user").trim().toLowerCase();
      setRole(normalizedRole);
      setFullName(data.full_name ?? "");
    } catch (e) {
      console.error("loadProfile timeout/crash:", e);
      setRole("user");
      setFullName("");
    } finally {
      setLoadingProfile(false);
    }
  }

  return (
    <>
      <Navbar session={session} fullName={fullName} />

      {/* ✅ never blocks the site */}
      {session && loadingProfile && (
        <div className="border-b bg-white">
          <div className="mx-auto max-w-6xl px-6 py-2 text-xs text-gray-500">
            Loading account…
          </div>
        </div>
      )}

      <Routes>
        <Route path="/" element={<Home session={session} />} />
        <Route path="/products" element={<Products session={session} />} />
        <Route path="/offers" element={<SpecialOffers />} />
        <Route path="/checkout/:id" element={<Checkout />} />

        <Route path="/login" element={!session ? <Login /> : <Navigate to="/" replace />} />
        <Route path="/signup" element={!session ? <Signup /> : <Navigate to="/" replace />} />

        <Route path="/cart" element={session ? <Cart /> : <Navigate to="/login" replace />} />
        <Route path="/orders" element={session ? <Orders /> : <Navigate to="/login" replace />} />
        <Route path="/profile" element={session ? <Profile /> : <Navigate to="/login" replace />} />

        <Route
          path="/admin"
          element={
            !session ? (
              <Navigate to="/login" replace />
            ) : loadingProfile ? (
              <div className="mx-auto max-w-5xl px-6 py-10 text-gray-600">
                Checking admin access…
              </div>
            ) : role === "admin" ? (
              <Admin />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
