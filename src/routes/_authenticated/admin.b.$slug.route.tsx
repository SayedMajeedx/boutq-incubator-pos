import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { BrandProvider } from "@/lib/brand-context";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import type { Brand } from "@/types/storefront";

export const Route = createFileRoute("/_authenticated/admin/b/$slug")({
  beforeLoad: async ({ params }) => {
    // If executing during SSR on Cloudflare Worker server without browser window,
    // defer navigation check to client hydration
    if (typeof window === "undefined") {
      return {};
    }

    const { data: sessionData } = await supabase.auth.getSession();
    let user = sessionData.session?.user;

    if (!user) {
      const { data: userData, error } = await supabase.auth.getUser();
      if (error || !userData.user) {
        throw redirect({ to: "/auth" });
      }
      user = userData.user;
    }

    // Concurrently fetch target brand, caller profile
    const [brandRes, profileRes] = await Promise.all([
      (supabase as any)
        .from("brands")
        .select("*")
        .eq("slug", params.slug)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("role, status, brand_id, email")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const brand = brandRes.data;
    const profile = profileRes.data;

    if (brandRes.error || !brand) {
      throw redirect({ to: "/admin" });
    }

    // Fetch icon settings if brand exists
    let iconSettings = null;
    if (brand.id) {
      const { data: iconData } = await (supabase.from("business_settings") as any)
        .select("favicon_url, logo_url")
        .eq("brand_id", brand.id)
        .maybeSingle();
      iconSettings = iconData;
    }

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === "majeed@hotmail.it" || email === "majeed@hotmail.com";
    const isSuperAdmin = isFixedSuperAdmin || profile?.role === "super_admin";
    const isActive = !profile || profile.status === "active";

    if (!isActive) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }

    const belongsToBrand = profile?.brand_id === brand.id;

    if (!isSuperAdmin && !belongsToBrand) {
      // Allow POS staff and admins to access boutq POS workspace
      if (profile?.role === "admin" || profile?.role === "staff") {
        // Access allowed
      } else {
        throw redirect({ to: "/admin" });
      }
    }

    if (!brand.is_active && !isSuperAdmin) {
      throw redirect({ to: "/admin" });
    }

    return {
      brand: {
        ...brand,
        favicon_url: iconSettings?.favicon_url ?? null,
        logo_url: iconSettings?.logo_url ?? brand.logo_url ?? null,
      } as Brand,
    };
  },
  component: BrandLayout,
  errorComponent: BrandError,
  notFoundComponent: () => <BrandError />,
});

function BrandLayout() {
  const { brand } = Route.useRouteContext();
  return (
    <BrandProvider brand={brand}>
      <Outlet />
    </BrandProvider>
  );
}

function BrandError() {
  const { lang } = useI18n();
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full p-6 text-center space-y-3">
        <div className="text-lg font-bold font-heading text-foreground">
          {lang === "ar" ? "تعذر تحميل مساحة عمل المتجر" : "Error loading brand workspace"}
        </div>
        <p className="text-sm text-muted-foreground">
          {lang === "ar"
            ? "تعذر الوصول إلى هذا المتجر. تحقق من صلاحياتك أو أعد تحميل الصفحة."
            : "Unable to access this store. Verify your permissions or refresh the page."}
        </p>
      </Card>
    </div>
  );
}
