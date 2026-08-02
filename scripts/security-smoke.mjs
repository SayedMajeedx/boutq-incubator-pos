import fs from "node:fs";
import path from "node:path";

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!match) return [];
        const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
        return [[match[1], value]];
      }),
  );
}

const localEnv = readEnv(path.resolve(".env"));
const env = { ...localEnv, ...process.env };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  env.SUPABASE_PUBLISHABLE_KEY ||
  env.SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Missing public Supabase URL/key");

const headers = { apikey: key };
if (!key.startsWith("sb_publishable_")) headers.Authorization = `Bearer ${key}`;

async function probe(name, resource, select, expectation) {
  const response = await fetch(
    `${url}/rest/v1/${resource}?select=${encodeURIComponent(select)}&limit=1`,
    { headers },
  );
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }
  const allowed = response.ok;
  const emptyResult = allowed && Array.isArray(body) && body.length === 0;
  const passed =
    expectation === "allow"
      ? allowed
      : expectation === "block-or-empty"
        ? !allowed || emptyResult
        : !allowed;
  return {
    name,
    passed,
    observed: allowed
      ? `allowed (${Array.isArray(body) ? body.length : 1} row result)`
      : `blocked (${response.status})`,
  };
}

const tests = await Promise.all([
  probe(
    "Public brands expose storefront columns",
    "brands",
    "id,slug,name_en,name_ar,logo_url,is_active",
    "allow",
  ),
  probe("Public brands block owner UUID", "brands", "created_by", "block"),
  probe(
    "Public products expose storefront columns",
    "products",
    "id,brand_id,name_en,image_url,is_active",
    "allow",
  ),
  probe("Public products block owner UUID", "products", "user_id", "block"),
  probe("Public variants block cost price", "product_variants", "cost_price", "block"),
  probe("Public settings block tenant owner UUID", "business_settings", "user_id", "block"),
  probe("Public settings block private email", "business_settings", "email", "block"),
  probe(
    "Anonymous users cannot read customers",
    "customers",
    "id,brand_id,name,email,phone",
    "block",
  ),
  probe("Anonymous users cannot read orders", "orders", "id,brand_id,customer_id,total", "block"),
  probe(
    "Anonymous users cannot read admin profiles",
    "profiles",
    "id,brand_id,role,status",
    "block-or-empty",
  ),
  probe(
    "Anonymous users cannot read integration secrets",
    "integration_settings",
    "brand_id,api_key,webhook_secret",
    "block",
  ),
]);

for (const test of tests)
  console.log(`${test.passed ? "PASS" : "FAIL"} | ${test.name} | ${test.observed}`);
const failed = tests.filter((test) => !test.passed);
console.log(
  `\n${tests.length - failed.length}/${tests.length} live anonymous-boundary checks passed.`,
);
if (failed.length) process.exitCode = 1;
