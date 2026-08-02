import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

let pendingUserRequest: Promise<User | null> | null = null;

/**
 * Share the authoritative Supabase user lookup across route guards and the
 * profile provider. Running several auth methods at once during hydration can
 * contend for the browser auth lock and leave TanStack Router pending forever.
 */
export function getAuthenticatedUser(): Promise<User | null> {
  if (!pendingUserRequest) {
    pendingUserRequest = supabase.auth
      .getUser()
      .then(({ data, error }) => (error ? null : data.user))
      .finally(() => {
        window.setTimeout(() => {
          pendingUserRequest = null;
        }, 1000);
      });
  }

  return pendingUserRequest;
}

export function clearAuthenticatedUserRequest() {
  pendingUserRequest = null;
}
