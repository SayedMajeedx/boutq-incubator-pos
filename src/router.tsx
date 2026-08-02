import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 30, // 30s stale time for instant cached transitions
        gcTime: 1000 * 60 * 10, // 10 minutes cache retention
        refetchOnWindowFocus: false, // Prevent aggressive and redundant database refetches when switching browser tabs
        refetchOnReconnect: "always",
        retry: 1, // Fail fast on bad networks rather than hanging the UI
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent", // Preload route chunks & beforeLoad on hover/touch for instantaneous transitions
    defaultPreloadStaleTime: 1000 * 30,
    defaultPendingMs: 120, // Render pending component if transition exceeds 120ms to prevent stale content visibility
    defaultPendingMinMs: 150, // Avoid flicker on fast transitions
  });

  return router;
};
