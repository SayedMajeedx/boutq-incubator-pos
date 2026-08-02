/**
 * Small isomorphic environment reader.
 *
 * Keep this separate from auth middleware so public storefront media helpers
 * do not pull Supabase auth and server-only modules into the client bundle.
 */
export function getEnvVariable(name: string): string | undefined {
  const viteName = name.startsWith("VITE_") ? name : `VITE_${name}`;
  const unprefixed = name.startsWith("VITE_") ? name.slice(5) : name;

  try {
    const globalEnvironment = globalThis as typeof globalThis & {
      __CLOUDFLARE_ENV__?: Record<string, string | undefined>;
      process?: { env?: Record<string, string | undefined> };
      [key: string]: unknown;
    };
    const liveEnvironment = globalEnvironment.__CLOUDFLARE_ENV__ ?? globalEnvironment.process?.env;
    const liveValue =
      liveEnvironment?.[name] ?? liveEnvironment?.[viteName] ?? liveEnvironment?.[unprefixed];
    if (liveValue) return liveValue;
  } catch {
    // Continue through the portable fallbacks.
  }

  try {
    const metaEnvironment = (
      import.meta as ImportMeta & {
        env?: Record<string, string | undefined>;
      }
    ).env;
    const metaValue =
      metaEnvironment?.[name] ?? metaEnvironment?.[viteName] ?? metaEnvironment?.[unprefixed];
    if (metaValue) return metaValue;
  } catch {
    // import.meta.env is not available in every runtime.
  }

  try {
    const processEnvironment = typeof process !== "undefined" ? process.env : undefined;
    const processValue =
      processEnvironment?.[name] ??
      processEnvironment?.[viteName] ??
      processEnvironment?.[unprefixed];
    if (processValue) return processValue;
  } catch {
    // process is not available in browsers without Node compatibility.
  }

  try {
    const globalEnvironment = globalThis as Record<string, unknown>;
    const globalValue =
      globalEnvironment[name] ?? globalEnvironment[viteName] ?? globalEnvironment[unprefixed];
    return typeof globalValue === "string" && globalValue ? globalValue : undefined;
  } catch {
    return undefined;
  }
}
