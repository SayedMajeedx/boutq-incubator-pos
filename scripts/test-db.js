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

console.log("Supabase URL:", supabaseUrl);
console.log("Has Anon Key:", !!supabaseKey);

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("--- Testing query on brand_public_settings (select *) ---");
  const { data, error } = await supabase.from("brand_public_settings").select("*").limit(1);

  if (error) {
    console.error("Query brand_public_settings Failed:", error);
  } else {
    console.log("Query brand_public_settings Succeeded!");
    if (data && data.length > 0) {
      console.log(
        "Columns available in brand_public_settings view:\n",
        Object.keys(data[0]).sort(),
      );
    } else {
      console.log("No rows returned, but query succeeded.");
    }
  }
}

run();
