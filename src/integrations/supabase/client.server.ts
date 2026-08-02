import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let getEventFn: any = null;
import(/* @vite-ignore */ "vinxi/http")
  .then((m) => {
    getEventFn = m.getEvent;
  })
  .catch(() => {});

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function getEnvSync(name: string): string | undefined {
  const viteName = name.startsWith("VITE_") ? name : `VITE_${name}`;
  const unprefixed = name.startsWith("VITE_") ? name.slice(5) : name;

  // 1. Try Vinxi/Cloudflare context synchronously
  try {
    if (getEventFn) {
      const event = getEventFn();
      const env =
        event?.context?.cloudflare?.env ||
        (event?.context as any)?.env ||
        event?.context?.cloudflare ||
        (event?.context as any)?.cloudflare?.env;
      if (env) {
        if (env[name]) return env[name];
        if (env[viteName]) return env[viteName];
        if (env[unprefixed]) return env[unprefixed];
      }
    }
  } catch {}

  // 2. Try process.env
  try {
    const g = globalThis as any;
    const liveEnv = g["__CLOUDFLARE_ENV__"] || g["process"]?.["env"] || process.env;
    if (liveEnv) {
      if (liveEnv[name]) return liveEnv[name];
      if (liveEnv[viteName]) return liveEnv[viteName];
      if (liveEnv[unprefixed]) return liveEnv[unprefixed];
    }
  } catch {}

  return undefined;
}

function createSupabaseAdminClient() {
  let SUPABASE_URL = getEnvSync("SUPABASE_URL") || getEnvSync("VITE_SUPABASE_URL");
  if (SUPABASE_URL && !SUPABASE_URL.startsWith("http://") && !SUPABASE_URL.startsWith("https://")) {
    SUPABASE_URL = `https://${SUPABASE_URL}`;
  }
  const SUPABASE_SERVICE_ROLE_KEY = getEnvSync("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Please configure your Supabase environment variables in your environment config or hosting panel.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_SERVICE_ROLE_KEY),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

// Server-side Supabase client with service role - bypasses RLS
// SECURITY: Only use this for trusted server-side operations, never expose to client code
// Load inside server handlers: const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
// Top-level import is safe only in other .server.ts modules - route files and *.functions.ts ship to the client bundle.
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
