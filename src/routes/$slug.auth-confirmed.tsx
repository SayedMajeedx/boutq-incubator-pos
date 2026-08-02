import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStorefront } from "@/lib/storefront-context";

export const Route = createFileRoute("/$slug/auth-confirmed")({
  component: StorefrontAuthConfirmed,
});

function StorefrontAuthConfirmed() {
  const { brand, t, refreshMembership } = useStorefront();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const finish = async () => {
      for (let attempt = 0; attempt < 20 && active; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          const meta = data.session.user.user_metadata ?? {};
          // Bypass storefront_slug restriction for Google OAuth sign-ins
          const isGoogleAuth =
            data.session.user.app_metadata?.provider === "google" ||
            data.session.user.identities?.some((id) => id.provider === "google");

          if (!isGoogleAuth && meta.storefront_slug !== brand.slug) {
            setFailed(true);
            return;
          }
          const { error } = await supabase.rpc("activate_storefront_membership", {
            p_brand_slug: brand.slug,
            p_name: typeof meta.name === "string" ? meta.name : undefined,
            p_phone: typeof meta.phone === "string" ? meta.phone : undefined,
          });
          if (error) {
            console.error("Membership activation failed", error);
            setFailed(true);
            return;
          }
          await refreshMembership();
          if (active) navigate({ to: "/$slug", params: { slug: brand.slug }, replace: true });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (active) setFailed(true);
    };
    void finish();
    return () => {
      active = false;
    };
  }, [brand.slug, navigate, refreshMembership]);

  return (
    <main className="mx-auto grid min-h-[55vh] max-w-lg place-items-center px-4 text-center">
      <div className="space-y-4">
        {failed ? (
          <AlertCircle className="mx-auto h-12 w-12 text-amber-600" />
        ) : (
          <Loader2 className="mx-auto h-10 w-10 animate-spin" />
        )}
        <h1 className="font-display text-2xl">
          {failed
            ? t("تعذر ربط الحساب بهذا المتجر", "Could not register this account with the store")
            : t("جارٍ تأكيد حسابك", "Confirming your account")}
        </h1>
        {failed && (
          <button
            className="underline underline-offset-4"
            onClick={() =>
              navigate({
                to: "/$slug/auth",
                params: { slug: brand.slug },
                search: { redirect: undefined },
                replace: true,
              })
            }
          >
            {t("العودة إلى تسجيل الدخول", "Return to sign in")}
          </button>
        )}
      </div>
    </main>
  );
}
