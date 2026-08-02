import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportAppError } from "../lib/error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n";
import { installNumericInputBehavior } from "@/lib/numeric-input-behavior";
import { ProfileProvider } from "@/lib/profile-context";
import { getEnvVariable } from "@/integrations/supabase/auth-middleware";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page couldn't be found.</p>
        <a
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Go home
        </a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportAppError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-display text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Try again or head back to the dashboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <a href="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Boutq — Boutique Management" },
      {
        name: "description",
        content:
          "A private portal to manage your boutique inventory, customers, orders, and custom invoices.",
      },
      { property: "og:title", content: "Boutq — Boutique Management" },
      {
        property: "og:description",
        content:
          "A private portal to manage your boutique inventory, customers, orders, and custom invoices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Boutq — Boutique Management" },
      {
        name: "twitter:description",
        content:
          "A private portal to manage your boutique inventory, customers, orders, and custom invoices.",
      },
      { property: "og:image", content: "https://boutq.store/og-placeholder.png" },
      { name: "twitter:image", content: "https://boutq.store/og-placeholder.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "preconnect", href: "https://media.boutq.store" },
      { rel: "dns-prefetch", href: "https://media.boutq.store" },
      { rel: "preconnect", href: "https://ik.imagekit.io", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://ik.imagekit.io" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const imageKitEndpoint = getEnvVariable("VITE_IMAGEKIT_URL_ENDPOINT") || "";

  return (
    <html lang="ar" dir="rtl" className="lang-ar" suppressHydrationWarning>
      <head>
        <HeadContent />
        {imageKitEndpoint && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__PUBLIC_ENV__ = { VITE_IMAGEKIT_URL_ENDPOINT: ${JSON.stringify(imageKitEndpoint)} };`,
            }}
          />
        )}
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    installNumericInputBehavior();
    // Enforce "Keep me logged in": if the user did not opt in and this is a
    // fresh browser session, drop the persisted Supabase session before any
    // protected route can hydrate.
    (async () => {
      const { shouldClearNonRememberedSession, markTabAlive } =
        await import("@/lib/session-persistence");
      if (shouldClearNonRememberedSession()) {
        const { supabase } = await import("@/integrations/supabase/client");
        await supabase.auth.signOut();
      }
      markTabAlive();
    })();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ProfileProvider>
          <Outlet />
          <Toaster />
        </ProfileProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
