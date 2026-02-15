import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment
const envFiles = ['.env.local', '.env'];
let env = {};
for (const f of envFiles) {
  const p = path.resolve(process.cwd(), f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');
  text.split(/\r?\n/).forEach((raw) => {
    let line = raw.trim();
    if (!line || line.startsWith('#')) return;
    line = line.replace(/^export\s+/, '');
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) return;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  });
  if (Object.keys(env).length) break;
}

const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_KEY in environment!');
  console.error('   Add this to your .env.local:');
  console.error('   SUPABASE_SERVICE_KEY=your_service_key_here');
  console.error('');
  console.error('   Get it from: Supabase Dashboard > Settings > API keys > Service role key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { 
  realtime: { enabled: false } 
});

console.log('🔍 Running comprehensive database verification...\n');

async function runCheck(name, query) {
  try {
    const { data, error } = await supabase.rpc('exec', { sql: query }).catch(() => 
      // Fallback - direct query if exec doesn't work
      supabase.from('_query_runner').select().catch(() => ({ data: null, error: new Error('Need manual SQL') }))
    );
    
    if (error?.message?.includes('Need manual SQL')) {
      return { status: 'MANUAL', name, message: 'Cannot run via RPC, need manual check' };
    }
    
    if (error) {
      return { status: 'ERROR', name, message: error.message };
    }
    
    return { status: 'OK', name, data };
  } catch (e) {
    return { status: 'EXCEPTION', name, message: e.message };
  }
}

async function runAllChecks() {
  const checks = [
    {
      name: 'Check #1: Profiles table exists',
      query: `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema='public' AND table_name='profiles'
      ) AS exists;`
    },
    {
      name: 'Check #2: Table columns',
      query: `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='profiles'
        ORDER BY ordinal_position;`
    },
    {
      name: 'Check #3: Profile count',
      query: `SELECT COUNT(*) as total FROM public.profiles;`
    },
    {
      name: 'Check #4: Recent profiles',
      query: `SELECT id, email, full_name, role, created_at FROM public.profiles 
        ORDER BY created_at DESC LIMIT 5;`
    },
    {
      name: 'Check #5: RLS enabled',
      query: `SELECT rowsecurity FROM pg_tables 
        WHERE schemaname='public' AND tablename='profiles';`
    },
    {
      name: 'Check #6: RLS policies count',
      query: `SELECT COUNT(*) as policy_count FROM pg_policies 
        WHERE tablename='profiles';`
    },
    {
      name: 'Check #7: Triggers',
      query: `SELECT trigger_name FROM information_schema.triggers 
        WHERE trigger_schema='public' 
        AND event_object_table IN ('profiles', 'users')
        ORDER BY trigger_name;`
    },
    {
      name: 'Check #8: Functions',
      query: `SELECT routine_name FROM information_schema.routines 
        WHERE routine_schema='public'
        ORDER BY routine_name;`
    },
    {
      name: 'Check #9: Indexes',
      query: `SELECT indexname FROM pg_indexes 
        WHERE schemaname='public' AND tablename='profiles'
        ORDER BY indexname;`
    }
  ];

  for (const check of checks) {
    const result = await runCheck(check.name, check.query);
    console.log(`\n${check.name}`);
    console.log('─'.repeat(60));
    
    if (result.status === 'OK') {
      console.log('✅ Result:', result.data);
    } else if (result.status === 'MANUAL') {
      console.log('⚠️  Need manual check');
      console.log('   SQL:', check.query);
    } else {
      console.log('❌ Error:', result.message);
    }
  }
}

runAllChecks().catch(console.error);
