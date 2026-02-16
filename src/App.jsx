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
    <div className="bg-gray-50 min-h-screen">
      <SupabaseDebug />
      <Navbar session={session} />

      {/* ✅ never blocks the site */}
      {session && loadingProfile && (
        <div className="border-b bg-white">
          <div className="mx-auto max-w-6xl px-6 py-2 text-xs text-gray-500">
            Loading account…
          </div>
        </div>
      )}

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
  );
}
