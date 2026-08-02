import { getRequest } from "@tanstack/react-start/server";

export type DomainRouteResult = {
  redirect: string;
  brandId?: string;
  loaderText?: string | null;
};

export async function resolveDomainRouteImpl(): Promise<DomainRouteResult> {
  try {
    const req = getRequest();
    const host = req?.headers.get("x-forwarded-host") || req?.headers.get("host") || "";
    const hostname = host.split(":")[0].toLowerCase();

    // Known platform domains that should route to /admin
    const isPlatformDomain =
      !hostname ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".pura.bh") ||
      hostname === "pura.bh" ||
      hostname.endsWith(".pages.dev") ||
      hostname.endsWith(".workers.dev") ||
      hostname === "boutq.store" ||
      hostname === "www.boutq.store";

    if (isPlatformDomain) {
      return { redirect: "/admin" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Boutq Wildcard Subdomain Mapping (e.g., pura.boutq.store -> slug "pura")
    if (hostname.endsWith(".boutq.store") && hostname !== "boutq.store") {
      const subdomain = hostname.slice(0, -12); // Extract "pura"
      if (subdomain) {
        const { data: brand } = await (supabaseAdmin as any)
          .from("brands")
          .select("id, slug")
          .eq("slug", subdomain)
          .eq("is_active", true)
          .maybeSingle();

        if (brand?.slug) {
          return { redirect: `/${brand.slug}`, brandId: brand.id };
        }
      }
    }

    // 2. Custom Domain Mapping
    const { data: brand } = await (supabaseAdmin as any)
      .from("brands")
      .select("id, slug")
      .eq("custom_domain", hostname)
      .eq("is_active", true)
      .maybeSingle();

    if (brand?.slug) {
      return { redirect: `/${brand.slug}`, brandId: brand.id };
    }

    return { redirect: "/admin" };
  } catch (error) {
    console.error("[resolveDomainRoute] Failed to resolve domain:", error);
    return { redirect: "/admin" };
  }
}
