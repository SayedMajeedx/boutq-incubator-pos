import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { createServerFn } from "@tanstack/react-start";

const resolveDomainRoute = createServerFn({ method: "GET" }).handler(async () => {
  const { resolveDomainRouteImpl } = await import("@/lib/domain-routing.server");
  return resolveDomainRouteImpl();
});

export const Route = createFileRoute("/")({
  loader: async () => {
    const res = await resolveDomainRoute();
    if (res?.redirect) {
      throw redirect({ to: res.redirect as any });
    }
  },
  component: IndexRedirector,
});

function IndexComponent({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#800020]" />
        <p className="text-zinc-400 text-sm font-light tracking-wide animate-pulse max-w-md">
          {text}
        </p>
      </div>
    </div>
  );
}

function IndexRedirector() {
  const navigate = useNavigate();
  const isAr =
    typeof navigator !== "undefined" &&
    (navigator.language?.startsWith("ar") || navigator.languages?.some((l) => l.startsWith("ar")));
  const [loaderText, setLoaderText] = useState(
    isAr ? "جاري فتح المتجر الإلكتروني..." : "Resolving boutique storefront...",
  );

  useEffect(() => {
    const resolveRouting = async () => {
      try {
        const hostname = window.location.hostname.toLowerCase();

        // List of known platform domains that should go to the Super Admin / Merchant login
        const isPlatformDomain =
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname.endsWith(".pura.bh") ||
          hostname === "pura.bh" ||
          hostname.endsWith(".pages.dev") ||
          hostname.endsWith(".workers.dev");

        if (isPlatformDomain) {
          void navigate({ to: "/admin" });
          return;
        }

        // Helper to load custom loading text for a brand ID
        const fetchCustomLoaderText = async (brandId: string) => {
          try {
            const { data: settings } = await (supabase as any)
              .from("brand_public_settings")
              .select("storefront_loader_text_en, storefront_loader_text_ar")
              .eq("brand_id", brandId)
              .maybeSingle();

            if (settings) {
              const customText = isAr
                ? settings.storefront_loader_text_ar
                : settings.storefront_loader_text_en;
              if (customText) {
                setLoaderText(customText);
              }
            }
          } catch (e) {
            console.error("Failed to load custom storefront loader text:", e);
          }
        };

        // 1. Boutq Wildcard Subdomain Mapping (e.g., pura.boutq.store -> slug "pura")
        if (hostname.endsWith(".boutq.store") && hostname !== "boutq.store") {
          const subdomain = hostname.slice(0, -12); // Extract "pura" from "pura.boutq.store"
          try {
            // Safe query: only filter and select by public columns allowed for anonymous selection
            const { data: brand } = await (supabase as any)
              .from("brands")
              .select("id, slug")
              .eq("slug", subdomain)
              .eq("is_active", true)
              .maybeSingle();

            if (brand?.slug) {
              if (brand.id) {
                await fetchCustomLoaderText(brand.id);
              }
              void navigate({
                to: "/$slug",
                params: { slug: brand.slug },
              });
              return;
            }
          } catch (subdomainErr) {
            console.error("Subdomain lookup failed:", subdomainErr);
          }
        }

        // 2. Custom Domain Mapping: Check if this custom hostname is bound to a boutique brand
        try {
          const { data: brand } = await (supabase as any)
            .from("brands")
            .select("id, slug")
            .eq("custom_domain", hostname)
            .eq("is_active", true)
            .maybeSingle();

          if (brand?.slug) {
            if (brand.id) {
              await fetchCustomLoaderText(brand.id);
            }
            void navigate({
              to: "/$slug",
              params: { slug: brand.slug },
            });
            return;
          }
        } catch (customDomainErr) {
          console.log(
            "Custom domain query bypassed due to column-level select permissions:",
            customDomainErr,
          );
        }

        // Fallback: If no matching storefront resolved, route to admin
        void navigate({ to: "/admin" });
      } catch (err) {
        console.error("Overall routing resolution failed:", err);
        void navigate({ to: "/admin" });
      }
    };

    void resolveRouting();
  }, [navigate]);

  return <IndexComponent text={loaderText} />;
}
