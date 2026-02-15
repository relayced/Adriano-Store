import { useEffect, useState } from "react";
import { subscribeSupabaseError, clearSupabaseError } from "../utils/supabaseDebug";

export default function SupabaseDebug() {
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const unsub = subscribeSupabaseError((m) => setMsg(m));
    return unsub;
  }, []);

  if (!msg) return null;

  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-4 z-50 w-[min(1100px,calc(100%-2rem))]">
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="font-semibold">Supabase error</div>
            <div className="mt-1 break-words">{String(msg)}</div>
          </div>
          <button
            onClick={() => clearSupabaseError()}
            className="text-red-600 hover:underline ml-4"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
