import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://guozdhpnfwcxhxkzflfz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_awijfMA2cMP8avG5TGlyug_HLfnijTR";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testLogin() {
  console.log("Testing Supabase Auth Login with test accounts...");

  // 1. Test Admin Login
  const { data: adminData, error: adminErr } = await supabase.auth.signInWithPassword({
    email: "admin@boutq.com",
    password: "Password123!",
  });

  if (adminErr) {
    console.error("Admin Login Failed:", adminErr.message);
  } else {
    console.log("✅ Admin Login Successful! User ID:", adminData.user.id);
  }

  // 2. Test Cashier Login
  const { data: cashierData, error: cashierErr } = await supabase.auth.signInWithPassword({
    email: "cashier@boutq.com",
    password: "Password123!",
  });

  if (cashierErr) {
    console.error("Cashier Login Failed:", cashierErr.message);
  } else {
    console.log("✅ Cashier Login Successful! User ID:", cashierData.user.id);
  }
}

testLogin().catch(console.error);
