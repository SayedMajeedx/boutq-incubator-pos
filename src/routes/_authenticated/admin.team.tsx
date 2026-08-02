import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/admin/team")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
