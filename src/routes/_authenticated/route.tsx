import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context: { queryClient } }) => {
    const user = await queryClient.ensureQueryData({
      queryKey: ["auth_user"],
      queryFn: async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw redirect({ to: "/auth" });
        return data.user;
      },
      staleTime: 1000 * 60 * 5, // 5 min cache
    });

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
