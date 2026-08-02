import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/admin/orders")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
