import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { getAuthenticatedUser } from "@/lib/authenticated-user";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context: { queryClient } }) => {
    // If executing during SSR on Cloudflare Worker server without browser window,
    // defer auth check to client hydration to avoid premature redirection.
    if (typeof window === "undefined") {
      return {};
    }

    // Validate the user with Supabase instead of reading the local session here.
    // getSession() can wait indefinitely on the browser auth lock immediately
    // after signInWithPassword(), leaving every protected route on its pending
    // skeleton. getUser() performs the authoritative check without that
    // post-login transition deadlock.
    const user = await getAuthenticatedUser();
    if (!user) {
      throw redirect({ to: "/auth" });
    }

    const profile = await queryClient.ensureQueryData({
      queryKey: ["auth_profile_role", user.id],
      queryFn: async () => {
        const { data } = await supabase
          .from("profiles")
          .select("status, role")
          .eq("id", user.id)
          .maybeSingle();
        return data ?? null;
      },
      staleTime: 1000 * 60 * 5, // 5 min cache
    });

    const dashboardRoles = new Set(["super_admin", "admin", "brand_admin", "staff", "courier"]);
    if (!profile || profile.status !== "active" || !dashboardRoles.has(profile.role ?? "")) {
      throw redirect({ to: "/auth" });
    }

    return { user };
  },
  pendingComponent: RoutePendingSkeleton,
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
