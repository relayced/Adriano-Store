import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

import Navbar from "./components/Navbar";

import Home from "./pages/Home";
import Products from "./pages/Products";
import Cart from "./pages/Cart";
import Orders from "./pages/Orders";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

function withTimeout(promise, ms = 6000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Request timeout")), ms)),
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
        const { data } = await withTimeout(supabase.auth.getSession(), 6000);
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
        // don’t freeze app
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
    try {
      const { data, error } = await withTimeout(
        supabase.from("profiles").select("role, full_name").eq("id", userId).maybeSingle(),
        6000
      );

      if (error) {
        console.error("loadProfile error:", error);
        setRole("user");
        setFullName("");
        setLoadingProfile(false);
        return;
      }

      if (!data) {
        console.warn("No profile row for:", userId);
        setRole("user");
        setFullName("");
        setLoadingProfile(false);
        return;
      }

      const normalizedRole = String(data.role ?? "user").trim().toLowerCase();
      setRole(normalizedRole);
      setFullName(data.full_name ?? "");
      setLoadingProfile(false);
    } catch (e) {
      console.error("loadProfile timeout/crash:", e);
      setRole("user");
      setFullName("");
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
