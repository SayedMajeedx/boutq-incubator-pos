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

async function checkBrands() {
  const { data, error } = await supabase
    .from("brands")
    .select("id, slug, name_en, name_ar, is_active, custom_domain");

  if (error) {
    console.log("Querying brands: FAILED");
    console.log(error);
  } else {
    console.log("Querying brands: SUCCESS!");
    console.log("Brands inside database:", data);
  }
}

checkBrands();
