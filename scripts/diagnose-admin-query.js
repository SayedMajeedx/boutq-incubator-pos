import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read .env manually
const envPath = resolve(__dirname, "../.env");
const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : "";
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

console.log("Target Supabase URL:", supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

const brandId = "b2f628c9-cfeb-444b-befe-5dbbb9d5c9e6"; // Pura Line

async function testQuery(name, selectStr) {
  const { data, error } = await supabase
    .from("business_settings")
    .select(selectStr)
    .eq("brand_id", brandId)
    .maybeSingle();

  if (error) {
    console.log(`Query [${name}]: FAILED`);
    console.log(`  - Code: ${error.code}`);
    console.log(`  - Message: ${error.message}`);
    console.log(`  - Details: ${error.details}`);
  } else {
    console.log(`Query [${name}]: SUCCESS!`, data ? "Got data!" : "No row found.");
  }
}

async function run() {
  // Test 1: Parent route query (favicon_url, logo_url)
  await testQuery("Parent Route iconSettings", "favicon_url, logo_url");

  // Test 2: Settings general query (all columns)
  await testQuery("General Settings tab", "*");

  // Test 3: Payments query
  await testQuery(
    "Payments Settings tab",
    "cod_enabled, card_enabled, benefit_enabled, benefit_qr_url, benefit_account_number, card_processing_fee, benefit_processing_fee, card_public_key, card_secret_key",
  );

  // Test 4: Shipping query
  await testQuery(
    "Fulfillment Settings tab",
    "delivery_enabled, pickup_enabled, digital_delivery_enabled, delivery_fee, shipping_zones",
  );
}

run();
