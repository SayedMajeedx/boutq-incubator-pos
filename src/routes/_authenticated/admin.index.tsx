import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * /admin smart redirector.
 *
 * Routes signed-in users to their brand workspace:
 * - super admin → /admin/brands (unless they have a brand assigned, then to that brand's dashboard)
 * - brand admin / staff → /admin/b/{their-slug}/dashboard
 * - anyone without a brand assignment → /admin/brands (super admin) or /auth
 */
export const Route = createFileRoute("/_authenticated/admin/")({
  beforeLoad: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, brand_id, email")
      .eq("id", user.id)
      .maybeSingle();

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === "majeed@hotmail.it" || email === "majeed@hotmail.com";
    const isSuperAdmin = isFixedSuperAdmin || profile?.role === "super_admin";

    if (profile?.brand_id) {
      const { data: brand } = await supabase
        .from("brands")
        .select("slug")
        .eq("id", profile.brand_id)
        .maybeSingle();
      if (brand?.slug) {
        throw redirect({
          to: profile?.role === "courier" ? "/admin/b/$slug/orders" : "/admin/b/$slug/dashboard",
          params: { slug: brand.slug },
        });
      }
    }

    if (isSuperAdmin) {
      throw redirect({ to: "/admin/brands" });
    }

    const { data: fallback } = await supabase.from("brands").select("slug").limit(1).maybeSingle();
    if (fallback?.slug) {
      throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: fallback.slug } });
    }

    throw redirect({ to: "/auth" });
  },
});
