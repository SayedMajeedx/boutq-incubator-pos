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

async function checkColumn(columnName) {
  const { data, error } = await supabase.from("business_settings").select(columnName).limit(1);

  if (error) {
    console.log(`Checking column "${columnName}": FAILED`);
    console.log(`  - Code: ${error.code}`);
    console.log(`  - Message: ${error.message}`);
    console.log(`  - Details: ${error.details}`);
    return false;
  } else {
    console.log(`Checking column "${columnName}": SUCCESS (Exists and accessible!)`);
    return true;
  }
}

async function run() {
  console.log("\n=== TESTING NEWLY ADDED COLUMNS ===");
  await checkColumn("vat_inclusive");
  await checkColumn("card_processing_fee");
  await checkColumn("benefit_processing_fee");
  await checkColumn("card_public_key");
  await checkColumn("card_secret_key");
  await checkColumn("shipping_zones");

  console.log("\n=== TESTING VIEW brand_public_settings ===");
  const { data: viewData, error: viewError } = await supabase
    .from("brand_public_settings")
    .select("*")
    .limit(1);

  if (viewError) {
    console.log("Querying brand_public_settings: FAILED");
    console.log(`  - Code: ${viewError.code}`);
    console.log(`  - Message: ${viewError.message}`);
    console.log(`  - Details: ${viewError.details}`);
  } else {
    console.log("Querying brand_public_settings: SUCCESS!");
  }
}

run();
