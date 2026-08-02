import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BrandProvider, type Brand } from "@/lib/brand-context";
import { useT } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

function getImpersonationToken(request?: Request): string | null {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(^|;)\s*boutq_impersonation_token\s*=\s*([^;]+)/);
    return match ? match[2] : null;
  }
  if (request) {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(/(^|;)\s*boutq_impersonation_token\s*=\s*([^;]+)/);
    return match ? match[2] : null;
  }
  return null;
}

function decodeBase64(str: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "base64").toString("utf-8");
  }
  return atob(str);
}

export const Route = createFileRoute("/_authenticated/admin/b/$slug")({
  beforeLoad: async ({ params }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    // Load target brand with all subscription metadata fields
    const { data: brand, error: brandErr } = await (supabase as any)
      .from("brands")
      .select(
        "id, slug, name_en, name_ar, logo_url, is_active, subscription_tier, subscription_status, subscription_expires_at, payment_receipt_url, payment_receipt_uploaded_at, custom_domain, support_access_enabled, plan_type, trial_ends_at, created_at",
      )
      .eq("slug", params.slug)
      .maybeSingle();

    if (brandErr || !brand) {
      throw redirect({ to: "/admin" });
    }

    // Load caller profile (may be null for legacy users; treat email match as super admin)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status, brand_id, email")
      .eq("id", user.id)
      .maybeSingle();

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
      // Non-super-admin trying to access a brand they don't belong to.
      // Send them to their own workspace, or to the dashboard redirector.
      throw redirect({ to: "/admin" });
    }

    // Secure Impersonation Check: Ensure troubleshooting access is enabled for this brand and token is present
    if (isSuperAdmin && !belongsToBrand) {
      const accessEnabled = brand.support_access_enabled !== false;
      if (!accessEnabled) {
        throw redirect({ to: "/admin/brands" });
      }

      // Check cookie session token directly from standard request headers or client-side document.cookie
      const token = getImpersonationToken();
      if (!token) {
        throw redirect({ to: "/admin/brands" });
      }

      try {
        const payload = JSON.parse(decodeBase64(token));
        const matchesBrand = payload.targetTenantId === brand.id;
        const isNotExpired = payload.issuedAt > Date.now() - 1000 * 60 * 60 * 24;

        if (!matchesBrand || !isNotExpired) {
          throw redirect({ to: "/admin/brands" });
        }
      } catch {
        throw redirect({ to: "/admin/brands" });
      }
    }

    if (!brand.is_active && !isSuperAdmin) {
      throw redirect({ to: "/admin" });
    }

    const { data: iconSettings } = await (supabase.from("business_settings") as any)
      .select("favicon_url, logo_url")
      .eq("brand_id", brand.id)
      .maybeSingle();

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
  const { brand } = Route.useRouteContext() as any;
  return (
    <BrandProvider brand={brand}>
      <Outlet />
    </BrandProvider>
  );
}

function BrandError({ error }: { error?: any }) {
  const t = useT();
  return (
    <div className="p-8 max-w-lg mx-auto">
      <Card className="p-8 text-center">
        <h2 className="text-xl font-display mb-2">{t("app.title")}</h2>
        <p className="text-muted-foreground mb-4">Brand not found or unavailable.</p>
        {error && (
          <div className="text-left p-4 bg-destructive/10 text-destructive rounded-md text-xs font-mono break-all whitespace-pre-wrap">
            {error.message || String(error)}
          </div>
        )}
      </Card>
    </div>
  );
}
