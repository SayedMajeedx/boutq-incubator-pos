import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Dashboard access is invite-only. Storefront shoppers intentionally have
    // no dashboard profile and must never be treated as administrators.
    const { data: profile } = await supabase
      .from("profiles")
      .select("status, role")
      .eq("id", data.user.id)
      .maybeSingle();

    const dashboardRoles = new Set(["super_admin", "admin", "brand_admin", "staff", "courier"]);
    if (!profile || profile.status !== "active" || !dashboardRoles.has(profile.role ?? "")) {
      throw redirect({ to: "/auth" });
    }

    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
