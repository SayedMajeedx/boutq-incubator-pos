import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0, // Fetch fresh data on mount to ensure real-time accuracy and zero latency in data state
        gcTime: 1000 * 60 * 5, // Keep unused cache in memory for 5 minutes
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
    defaultPreload: false, // Disable hover preloading to free up CPU and network threads, restoring buttery-smooth scrolling
    defaultPreloadStaleTime: 0,
  });

  return router;
};
