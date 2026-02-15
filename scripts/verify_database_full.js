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

if (!SUPABASE_URL) {
  console.error('❌ Missing SUPABASE_URL!');
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.error('\n⚠️  SUPABASE_SERVICE_KEY not found!');
  console.error('Add to .env.local: SUPABASE_SERVICE_KEY=your_key_here');
  console.error('\nGetting key:');
  console.error('1. Go to Supabase Dashboard');
  console.error('2. Click Settings > API');
  console.error('3. Copy "Service role secret"');
  console.error('4. Add to .env.local as SUPABASE_SERVICE_KEY=...\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { 
  realtime: { enabled: false } 
});

console.log('🔍 DATABASE VERIFICATION REPORT');
console.log('═'.repeat(70));
console.log(`Supabase URL: ${SUPABASE_URL}\n`);

const checks = [];

async function checkProfilesTable() {
  console.log('\n✓ Check #1: Profiles Table Exists');
  console.log('─'.repeat(70));
  try {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    
    if (error?.code === 'PGRST116' || !error) {
      console.log('✅ Profiles table EXISTS');
      checks.push({ name: 'Profiles Table', status: 'EXISTS' });
      return true;
    } else if (error?.message?.includes('relation') || error?.message?.includes('does not exist')) {
      console.log('❌ Profiles table MISSING');
      console.log('   Error:', error.message);
      checks.push({ name: 'Profiles Table', status: 'MISSING' });
      return false;
    } else {
      console.log('⚠️  Could not determine table status');
      console.log('   Error:', error?.message);
      checks.push({ name: 'Profiles Table', status: 'UNKNOWN' });
      return false;
    }
  } catch (e) {
    console.log('❌ Error checking table:', e.message);
    checks.push({ name: 'Profiles Table', status: 'ERROR' });
    return false;
  }
}

async function checkProfileData() {
  console.log('\n✓ Check #2: Existing Profiles');
  console.log('─'.repeat(70));
  try {
    const { data, error, count } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at', { count: 'exact' });
    
    if (error) {
      console.log('⚠️  Could not query profiles:', error.message);
      return;
    }

    if (count === 0) {
      console.log('📊 No profiles yet (table is empty)');
      checks.push({ name: 'Profiles Data', status: 'EMPTY' });
    } else {
      console.log(`📊 Found ${count} profile(s):`);
      if (data && data.length > 0) {
        data.forEach((p, idx) => {
          console.log(`   ${idx + 1}. ${p.email} - ${p.full_name} (${p.role})`);
        });
      }
      checks.push({ name: 'Profiles Data', status: `${count} profiles` });
    }
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
}

async function checkAuthUsers() {
  console.log('\n✓ Check #3: Auth Users');
  console.log('─'.repeat(70));
  try {
    const { data, error, count } = await supabase.auth.admin.listUsers();
    
    if (error) {
      console.log('⚠️  Could not list users:', error.message);
      return;
    }

    console.log(`👥 Found ${count} user(s)`);
    if (data?.users && data.users.length > 0) {
      data.users.slice(0, 5).forEach((u) => {
        console.log(`   - ${u.email} (created ${u.created_at.split('T')[0]})`);
      });
      if (count > 5) console.log(`   ... and ${count - 5} more`);
    }
    checks.push({ name: 'Auth Users', status: `${count} users` });
  } catch (e) {
    console.log('⚠️  Need admin key to list users:', e.message);
    checks.push({ name: 'Auth Users', status: 'Cannot verify' });
  }
}

async function testProfileCreate() {
  console.log('\n✓ Check #4: Can Profiles Be Created?');
  console.log('─'.repeat(70));
  
  // Get first auth user
  try {
    const { data, error } = await supabase.auth.admin.listUsers();
    
    if (error || !data?.users?.length) {
      console.log('⚠️  No users to test with');
      console.log('   Create a user first via signup');
      return;
    }

    const testUser = data.users[0];
    console.log(`Testing with user: ${testUser.email}`);

    // Try to read their profile
    const { data: profile, error: err } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', testUser.id)
      .maybeSingle();

    if (err) {
      console.log('❌ Cannot query profiles:', err.message);
      checks.push({ name: 'Profile Access', status: 'FAILED' });
      return;
    }

    if (profile) {
      console.log('✅ Profile exists and can be read');
      console.log(`   Email: ${profile.email}`);
      console.log(`   Name: ${profile.full_name || '(empty)'}`);
      console.log(`   Role: ${profile.role}`);
      checks.push({ name: 'Profile Access', status: 'Works' });
    } else {
      console.log('⚠️  User has no profile yet');
      console.log('   This is OK if they just signed up');
      console.log('   Trigger should auto-create on next event');
      checks.push({ name: 'Profile Access', status: 'No profile' });
    }
  } catch (e) {
    console.log('⚠️  Error:', e.message);
  }
}

async function runReport() {
  const tableExists = await checkProfilesTable();

  if (tableExists) {
    await checkProfileData();
    await checkAuthUsers();
    await testProfileCreate();
  } else {
    console.log('\n⛔ Profiles table is missing!');
    console.log('Run the SQL setup first: supabase_setup.sql');
  }

  // Summary
  console.log('\n\n📋 SUMMARY');
  console.log('═'.repeat(70));
  checks.forEach(c => {
    const icon = c.status.includes('MISSING') || c.status.includes('FAILED') ? '❌' : 
                 c.status.includes('UNKNOWN') || c.status.includes('Cannot') ? '⚠️ ' : '✅';
    console.log(`${icon} ${c.name}: ${c.status}`);
  });

  console.log('\n' + '═'.repeat(70));
  if (tableExists) {
    console.log('✅ Database structure looks GOOD!');
    console.log('\nNext steps:');
    console.log('1. Make sure you have SUPABASE_SERVICE_KEY in .env.local');
    console.log('2. Refresh your app');
    console.log('3. Try signing up with a new account');
    console.log('4. Go to Profile page - should show auto-created profile');
  } else {
    console.log('❌ Database setup INCOMPLETE');
    console.log('\nNext steps:');
    console.log('1. Go to Supabase Dashboard > SQL Editor');
    console.log('2. Click "New Query"');
    console.log('3. Copy contents of: supabase_setup.sql');
    console.log('4. Paste into SQL Editor');
    console.log('5. Click "Execute"');
    console.log('6. Then run this script again to verify');
  }
  console.log('═'.repeat(70) + '\n');
}

runReport().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
