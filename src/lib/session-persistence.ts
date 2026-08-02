// Enforces "Keep me logged in" behavior for Supabase auth sessions.
//
// The Supabase client is configured once with `persistSession: true` and
// localStorage as its store. We can't swap that store per-login, so we
// simulate sessionStorage semantics ourselves:
//
//  - When remember=true, we drop a persistent flag. Nothing else happens —
//    the session lives in localStorage as usual and survives browser close.
//  - When remember=false, we drop a per-tab marker in sessionStorage. On the
//    next page load, if the persistent flag is absent AND the per-tab marker
//    is missing (i.e. the browser session ended / a fresh tab was opened),
//    we sign the user out before any protected route can hydrate.

const REMEMBER_KEY = "boutq.auth.rememberMe";
const TAB_ALIVE_KEY = "boutq.auth.tabAlive";

export function applyRememberMe(remember: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (remember) {
      window.localStorage.setItem(REMEMBER_KEY, "1");
      window.sessionStorage.removeItem(TAB_ALIVE_KEY);
    } else {
      window.localStorage.removeItem(REMEMBER_KEY);
      window.sessionStorage.setItem(TAB_ALIVE_KEY, "1");
    }
  } catch {
    /* storage may be unavailable — ignore */
  }
}

/**
 * Returns true when the current stored session should be discarded because
 * the user did not opt into "Keep me logged in" and this is a fresh browser
 * session (sessionStorage was cleared on browser close).
 */
export function shouldClearNonRememberedSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const remembered = window.localStorage.getItem(REMEMBER_KEY) === "1";
    if (remembered) return false;
    const tabAlive = window.sessionStorage.getItem(TAB_ALIVE_KEY) === "1";
    return !tabAlive;
  } catch {
    return false;
  }
}

export function markTabAlive() {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(REMEMBER_KEY) !== "1") {
      window.sessionStorage.setItem(TAB_ALIVE_KEY, "1");
    }
  } catch {
    /* ignore */
  }
}
