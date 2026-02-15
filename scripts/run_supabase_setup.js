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
  console.error('   You need to add SUPABASE_SERVICE_KEY to your .env.local');
  console.error('   Get it from: Supabase Dashboard > Project > Settings > API keys > Service role key');
  process.exit(1);
}

console.log('📝 Running Supabase setup SQL...\n');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { 
  realtime: { enabled: false } 
});

// Read the SQL file
const sqlPath = path.resolve(process.cwd(), 'supabase_setup.sql');
if (!fs.existsSync(sqlPath)) {
  console.error('❌ supabase_setup.sql not found!');
  process.exit(1);
}

const sqlContent = fs.readFileSync(sqlPath, 'utf8');

// Split by semicolon and execute each statement
const statements = sqlContent
  .split(';')
  .map(stmt => stmt.trim())
  .filter(stmt => stmt && !stmt.startsWith('--'));

let executed = 0;
let failed = 0;

for (const statement of statements) {
  try {
    await supabase.rpc('exec', {
      sql: statement,
    }).catch(async () => {
      // exec might not exist, try direct query instead
      return supabase.from('_raw_sql').insert({ sql: statement });
    }).catch(async () => {
      // Fallback: execute using a simple approach
      // Note: This requires postgrest middleware support, which may not work for DDL
      // For DDL statements, we should guide user to Supabase SQL editor
      throw new Error('DDL execution requires Supabase SQL Editor');
    });
    console.log('✅ Executed statement:', statement.substring(0, 60) + '...');
    executed++;
  } catch (err) {
    console.error('⚠️  Error:', err.message);
    failed++;
  }
}

console.log(`\n📊 Results: ${executed} executed, ${failed} failed`);

if (failed > 0) {
  console.log('\n📝 IMPORTANT: Run this SQL manually in Supabase SQL Editor:');
  console.log('1. Go to: https://supabase.com/dashboard/project/' + SUPABASE_URL.split('//')[1].split('.')[0]);
  console.log('2. Click "SQL Editor" in the left sidebar');
  console.log('3. Click "New query"');
  console.log('4. Paste the contents of supabase_setup.sql');
  console.log('5. Click "Execute"');
}
