import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/admin/inventory")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
