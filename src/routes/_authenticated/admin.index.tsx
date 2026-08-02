import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * /admin smart redirector.
 *
 * Routes signed-in users to their brand workspace:
 * - staff / cashier → /admin/b/{slug}/pos
 * - brand admin / super admin → /admin/b/{slug}/dashboard or /admin/b/{slug}/pos
 */
export const Route = createFileRoute("/_authenticated/admin/")({
  beforeLoad: async () => {
    // If executing during SSR on Cloudflare Worker server without browser window,
    // defer navigation check to client hydration
    if (typeof window === "undefined") {
      return {};
    }

    const { data: sessionData } = await supabase.auth.getSession();
    let user = sessionData.session?.user;

    if (!user) {
      const { data: userData } = await supabase.auth.getUser();
      user = userData.user ?? null;
    }

    if (!user) {
      throw redirect({ to: "/auth" });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, brand_id, email, status")
      .eq("id", user.id)
      .maybeSingle();

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === "majeed@hotmail.it" || email === "majeed@hotmail.com";
    const isSuperAdmin = isFixedSuperAdmin || profile?.role === "super_admin";

    let targetSlug = "boutq";

    if (profile?.brand_id) {
      const { data: brand } = await supabase
        .from("brands")
        .select("slug")
        .eq("id", profile.brand_id)
        .maybeSingle();
      if (brand?.slug) {
        targetSlug = brand.slug;
      }
    }

    if (profile?.role === "courier") {
      throw redirect({
        to: "/admin/b/$slug/orders",
        params: { slug: targetSlug },
      });
    }

    if (profile?.role === "staff") {
      throw redirect({
        to: "/admin/b/$slug/pos",
        params: { slug: targetSlug },
      });
    }

    // Default for admins
    throw redirect({
      to: "/admin/b/$slug/pos",
      params: { slug: targetSlug },
    });
  },
});
