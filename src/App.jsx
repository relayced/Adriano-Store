import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

import Navbar from "./components/Navbar";
import SupabaseDebug from "./components/SupabaseDebug";
import { setSupabaseError } from "./utils/supabaseDebug";

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
function withTimeoutAbort(builderOrPromise, ms = 60000) {
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
  const [adminNeedsLandscape, setAdminNeedsLandscape] = useState(false);

  useEffect(() => {
    function updateAdminOrientationGate() {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      const isPortrait = window.matchMedia("(orientation: portrait)").matches;
      setAdminNeedsLandscape(isMobile && isPortrait);
    }

    updateAdminOrientationGate();
    window.addEventListener("resize", updateAdminOrientationGate);
    window.addEventListener("orientationchange", updateAdminOrientationGate);

    return () => {
      window.removeEventListener("resize", updateAdminOrientationGate);
      window.removeEventListener("orientationchange", updateAdminOrientationGate);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function init() {
      setLoadingProfile(true);
      try {
        // getSession usually returns fast; keep a generous timeout
        const { data } = await withTimeoutAbort(supabase.auth.getSession(), 60000);
        if (!alive) return;

        const s = data?.session ?? null;
        setSession(s);

        if (s?.user?.id) {
          await safeLoadProfile(s.user.id);
        } else {
          setRole("user");
          setFullName("");
          setLoadingProfile(false);
        }
      } catch (e) {
        console.error("init error:", e);
        try { setSupabaseError(`init: ${e?.message || String(e)}`); } catch (_) {}
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
        await safeLoadProfile(newSession.user.id);
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

  async function safeLoadProfile(userId) {
    const watchdog = setTimeout(() => {
      console.warn("Profile loading timeout - stopping loading state");
      setLoadingProfile(false);
    }, 10000); // Faster timeout - 10 seconds

    try {
      await loadProfile(userId);
    } finally {
      clearTimeout(watchdog);
    }
  }

  async function loadProfile(userId) {
    setLoadingProfile(true);
    const startTime = Date.now();
    
    try {
      console.log(`[loadProfile] Starting for user: ${userId}`);

      // Try to query profile with a reasonable timeout
      const profileQuery = supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", userId)
        .maybeSingle();

      const { data, error } = await Promise.race([
        profileQuery,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Profile query timeout")), 5000)
        ),
      ]);

      const elapsed = Date.now() - startTime;
      console.log(`[loadProfile] Query completed in ${elapsed}ms`, { data, error: error?.message });

      // If there's a legitimate error (not "no rows"), just use defaults
      if (error) {
        console.warn("[loadProfile] Query failed:", error?.message);
        // Don't block - just use defaults
        setRole("user");
        setFullName("");
      } else if (data) {
        // Profile exists - use it
        const normalizedRole = String(data.role ?? "user").trim().toLowerCase();
        setRole(normalizedRole);
        setFullName(data.full_name ?? "");
        console.log(`[loadProfile] Profile loaded: role=${normalizedRole}, name=${data.full_name}`);
      } else {
        // No profile found
        console.warn(`[loadProfile] No profile row for user ${userId} - using defaults`);
        setRole("user");
        setFullName("");
      }
    } catch (e) {
      console.error("[loadProfile] Exception:", e?.message);
      // Don't show error, just use defaults
      setRole("user");
      setFullName("");
    } finally {
      setLoadingProfile(false);
      console.log(`[loadProfile] Finished (elapsed: ${Date.now() - startTime}ms)`);
    }
  }

  return (
    <div className="app-theme-soft bg-[#f6f2ec] min-h-screen flex flex-col">
      <SupabaseDebug />
      <Navbar session={session} />

      {/* ✅ never blocks the site */}
      {session && loadingProfile && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-full border border-emerald-100 bg-white px-5 py-3 shadow-sm">
            <div
              className="h-5 w-5 rounded-full border-2 border-emerald-100 border-t-emerald-600"
              style={{ animation: "spinner-rotate 0.9s linear infinite, spinner-color-cycle 2.4s linear infinite" }}
            />
            <span className="text-sm font-semibold text-emerald-800">Website loading…</span>
          </div>
        </div>
      )}

      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Home session={session} role={role} />} />
          <Route path="/products" element={<Products session={session} role={role} />} />
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
              ) : adminNeedsLandscape ? (
                <div className="mx-auto max-w-5xl px-6 py-10">
                  <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center">
                    <div className="text-2xl">📱</div>
                    <div className="mt-2 text-lg font-semibold text-emerald-900">Rotate your phone</div>
                    <div className="mt-1 text-sm text-emerald-700">
                      Please tilt your phone to landscape to access the admin page.
                    </div>
                  </div>
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
      </div>

      <footer className="border-t border-emerald-900/10 bg-white mt-auto">
        <div className="mx-auto max-w-6xl px-6 py-4 text-center text-sm text-emerald-900">
          © 2026 Adriano Store School Supplies
        </div>
      </footer>
    </div>
  );
}
