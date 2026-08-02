import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Enterprise Safeguard: Checks if the user is a superadmin impersonating a tenant.
 * If yes, mutations are blocked by default unless the 'superadmin_impersonation_mutation_allowed'
 * system setting is explicitly set to 'true'.
 */
export async function enforceMutationSafeguard(
  supabaseClient: any,
  userId: string,
  targetBrandId: string,
): Promise<void> {
  // 1. Fetch the user's role and their assigned brand_id
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("role, brand_id")
    .eq("id", userId)
    .single();

  if (profileErr || !profile) {
    throw new Error("UNAUTHORIZED: Could not verify operator profile.");
  }

  const isSuperAdmin = profile.role === "super_admin";
  const belongsToBrand = profile.brand_id === targetBrandId;

  // 2. If they are a superadmin but DO NOT belong to the target brand, they are impersonating!
  if (isSuperAdmin && !belongsToBrand) {
    // 3. Query system settings for the developer overwrite override flag
    const { data: setting } = await supabaseAdmin
      .from("system_settings")
      .select("superadmin_impersonation_mutation_allowed")
      .eq("id", 1)
      .maybeSingle();

    const overwriteAllowed = setting?.superadmin_impersonation_mutation_allowed === true;

    if (!overwriteAllowed) {
      throw new Error(
        "MUTATION_BLOCKED: Superadmin Impersonation mode is strictly read-only. Enterprise safeguards prevent modifying live merchant finances or data unless developer overwrite is enabled.",
      );
    }
  }
}
