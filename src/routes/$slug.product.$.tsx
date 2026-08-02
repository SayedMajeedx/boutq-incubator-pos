import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$slug/product/$")({
  beforeLoad: ({ params }) => {
    const splat = params._splat || (params as Record<string, any>)["_"] || "";
    if (splat) {
      throw redirect({
        to: "/$slug/product/$id",
        params: { slug: params.slug, id: splat },
      });
    }
    throw redirect({
      to: "/$slug",
      params: { slug: params.slug },
    });
  },
  component: () => null,
});
