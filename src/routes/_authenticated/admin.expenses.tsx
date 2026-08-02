import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/admin/expenses")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
