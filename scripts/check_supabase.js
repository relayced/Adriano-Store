import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Try to read .env.local, .env, or process.env
const envFiles = ['.env.local', '.env'];
let env = {};
for (const f of envFiles) {
  const p = path.resolve(process.cwd(), f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');
  text.split(/\r?\n/).forEach((raw) => {
    let line = raw.trim();
    if (!line || line.startsWith('#')) return;
    // allow leading export
    line = line.replace(/^export\s+/, '');
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) return;
    let val = m[2].trim();
    // Strip surrounding quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  });
  if (Object.keys(env).length) break;
}

const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase URL or Key. Check .env.local or environment variables.');
  process.exit(2);
}

// Disable realtime to avoid leaving open websocket handles in short-lived scripts
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { enabled: false } });

try {
  console.log('Querying products (limit 5) from', SUPABASE_URL);
  const { data, error } = await supabase.from('products').select('id,name,price,stock').limit(5);
  if (error) {
    console.error('Supabase query error:', error);
    process.exit(3);
  }
  console.log('Products result:', data);
  // Try to clean up possible open handles from Supabase clients before exiting.
  try {
    if (supabase && supabase.removeAllRealtimeListeners) {
      try { supabase.removeAllRealtimeListeners(); } catch (_) {}
    }
    if (supabase && supabase.removeAllSubscriptions) {
      try { supabase.removeAllSubscriptions(); } catch (_) {}
    }
    if (supabase && supabase.realtime && typeof supabase.realtime.disconnect === 'function') {
      try { await supabase.realtime.disconnect(); } catch (_) {}
    }
    if (supabase && supabase.auth && typeof supabase.auth.signOut === 'function') {
      try { await supabase.auth.signOut(); } catch (_) {}
    }
  } catch (cleanupErr) {
    // ignore
  }

  // Allow a short grace period for any handles to close, then exit.
  setTimeout(() => process.exit(0), 80);
} catch (e) {
  console.error('Unexpected error:', e);
  process.exit(4);
}
