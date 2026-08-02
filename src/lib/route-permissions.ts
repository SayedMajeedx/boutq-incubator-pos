import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_ROLES = new Set(["admin", "brand_admin", "super_admin"]);
const FIXED_SUPER_ADMIN_EMAILS = new Set(["majeed@hotmail.it", "majeed@hotmail.com"]);

export async function requireBrandPermission(slug: string, permission: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw redirect({ to: "/auth" });

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("role, status, permissions")
    .eq("id", user.id)
    .maybeSingle();

  const email = (user.email || "").toLowerCase();
  const isSuperAdmin = FIXED_SUPER_ADMIN_EMAILS.has(email) || profile?.role === "super_admin";
  const isAdmin = ADMIN_ROLES.has(profile?.role);
  const isAssignedOrderCourier = profile?.role === "courier" && permission === "manage_orders";
  const permissions = Array.isArray(profile?.permissions) ? profile.permissions : [];
  const isActive = profile?.status === "active";

  if (
    !isActive ||
    (!isSuperAdmin && !isAdmin && !isAssignedOrderCourier && !permissions.includes(permission))
  ) {
    throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug } });
  }
}
