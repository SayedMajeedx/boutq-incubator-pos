import { useRouterState, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { LogOut, Shield, Store, Search } from "lucide-react";
import { SpotlightCommandPalette } from "@/components/spotlight-command-palette";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";
import { toast } from "sonner";
import { getAdminNavItems } from "@/config/admin-navigation";
import { OsAppDockRail } from "@/components/os/os-app-dock-rail";
import { OsSidebar } from "@/components/os/os-sidebar";
import { OsMenuBar } from "@/components/os/os-menu-bar";
import { OsAppWindow } from "@/components/os/os-app-window";
import { OsMobileNavigation } from "@/components/os/os-mobile-navigation";
import { OsRecentHistoryBar } from "@/components/os/os-recent-history-bar";
import { cn } from "@/lib/utils";

type BrandRow = { id: string; slug: string; name_en: string; is_active: boolean };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const router = useRouter();
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("boutq_os_sidebar_expanded") === "true";
    }
    return false;
  });

  const toggleSidebarExpanded = () => {
    setSidebarExpanded((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("boutq_os_sidebar_expanded", String(next));
      }
      return next;
    });
  };

  const {
    profile,
    isAdmin,
    isSuperAdmin,
    isCourier,
    isLoading,
    profileError,
    signOutAndRedirect,
    hasPermission,
  } = useProfile();

  // Extract slug from current URL when inside /b/:slug/*
  const routeParams = useParams({ strict: false }) as { slug?: string };
  const urlSlug = routeParams?.slug ?? null;

  const [spotlightOpen, setSpotlightOpen] = useState(false);

  // Global Command Center keyboard listener (Cmd/Ctrl+K and Esc for focus mode)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSpotlightOpen((open) => !open);
      }
      if (e.key === "Escape" && isFocusMode) {
        setIsFocusMode(false);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isFocusMode]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768 && isFocusMode) {
        setIsFocusMode(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isFocusMode]);

  const [hasImpersonationToken, setHasImpersonationToken] = useState<boolean>(() => {
    if (typeof document !== "undefined") {
      return document.cookie.includes("boutq_impersonation_token=");
    }
    return false;
  });

  useEffect(() => {
    if (typeof document !== "undefined") {
      setHasImpersonationToken(document.cookie.includes("boutq_impersonation_token="));
    }
  }, [pathname]);

  const handleExitImpersonation = async () => {
    try {
      const { stopImpersonationSession } = await import("@/lib/impersonation.functions");
      await stopImpersonationSession();
      if (typeof document !== "undefined") {
        document.cookie =
          "boutq_impersonation_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      }
      toast.success(
        lang === "ar"
          ? "تم الخروج من وضع المحاكاة بنجاح"
          : "Successfully exited impersonation mode.",
      );
      window.location.href = "/admin/brands";
    } catch (err: any) {
      toast.error(err.message || "Failed to exit impersonation mode.");
    }
  };

  // Fallback: use the user's own brand slug when outside /b/:slug
  const activeSlug = urlSlug ?? profile?.brand?.slug ?? null;

  // Warm the four primary applications once authentication and the active
  // brand are known. This keeps the OS-like app switch fast even before a
  // pointer happens to hover a dock item.
  useEffect(() => {
    if (!activeSlug || isLoading || !profile) return;

    const preloadPrimaryApps = () => {
      const destinations = [
        "/admin/b/$slug/dashboard",
        "/admin/b/$slug/orders",
        "/admin/b/$slug/inventory",
        "/admin/b/$slug/customers",
      ] as const;

      for (const to of destinations) {
        void router.preloadRoute({ to, params: { slug: activeSlug } }).catch(() => undefined);
      }
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(preloadPrimaryApps, { timeout: 750 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(preloadPrimaryApps, 100);
    return () => globalThis.clearTimeout(timeoutId);
  }, [activeSlug, isLoading, profile, router]);

  // Close drawer when route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body viewport scrolling for clean OS workspace feel
  useEffect(() => {
    const origHtmlOverflow = document.documentElement.style.overflow;
    const origHtmlHeight = document.documentElement.style.height;
    const origBodyOverflow = document.body.style.overflow;
    const origBodyHeight = document.body.style.height;

    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.height = "100%";
    document.body.style.overflow = "hidden";
    document.body.style.height = "100%";

    return () => {
      document.documentElement.style.overflow = origHtmlOverflow;
      document.documentElement.style.height = origHtmlHeight;
      document.body.style.overflow = origBodyOverflow;
      document.body.style.height = origBodyHeight;
    };
  }, []);

  // Force-logout only if profile exists and is explicitly inactive
  useEffect(() => {
    if (isLoading) return;
    if (profile && profile.status === "inactive") {
      (async () => {
        await signOutAndRedirect();
      })();
    }
  }, [isLoading, profile, signOutAndRedirect]);

  // Super admin: load all brands for switcher
  const brandsQ = useQuery({
    queryKey: ["brands-switcher"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, slug, name_en, is_active")
        .order("name_en");
      if (error) throw error;
      return (data ?? []) as BrandRow[];
    },
    enabled: isSuperAdmin,
  });

  // Build navigation items
  const navItems = useMemo(() => {
    return getAdminNavItems({
      activeSlug,
      isCourier,
      isAdmin,
      hasPermission,
      t,
      lang,
    });
  }, [activeSlug, isCourier, isAdmin, hasPermission, t, lang]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const brandLabel =
    profile?.brand?.[lang === "ar" ? "name_ar" : "name_en"] ??
    profile?.brand?.name_en ??
    t("app.title");

  const activeNavItem = navItems.find((item) => {
    const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
    return pathname.startsWith(targetPath);
  });

  const currentPageLabel = activeNavItem?.[lang === "ar" ? "labelAr" : "labelEn"];

  // SECURITY: fail closed.
  if (!isLoading && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center space-y-3">
          <h1 className="text-xl font-display text-primary">
            {lang === "ar" ? "الحساب بانتظار الإعداد" : "Account pending setup"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === "ar"
              ? "لم يتم العثور على صلاحيات لحسابك بعد. يرجى التواصل مع المسؤول العام لإعداد حسابك."
              : "We couldn't confirm your access role yet. Please contact the super admin to finish setting up your account."}
          </p>
          {profileError && (
            <p className="text-xs text-muted-foreground/70">
              {lang === "ar"
                ? "حدث خطأ أثناء التحقق."
                : "There was an error verifying your account."}
            </p>
          )}
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> {t("nav.signOut")}
          </Button>
        </div>
      </div>
    );
  }

  const isImpersonating = isSuperAdmin && urlSlug !== null && hasImpersonationToken;

  return (
    <div className="h-screen flex flex-col os-canvas overflow-hidden select-none">
      {/* Impersonation Warning Banner */}
      {isImpersonating && (
        <div className="no-print bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white px-6 py-2 text-center text-xs font-semibold flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-red-700/40 shrink-0 shadow-md z-50 animate-in fade-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2.5">
            <Shield className="h-4 w-4 text-white animate-pulse" />
            <span className="leading-relaxed">
              {lang === "ar"
                ? "⚠️ وضع المحاكاة: استعراض المتجر بصفة مسؤول خارق. جميع الإجراءات مسجلة."
                : "⚠️ IMPERSONATION MODE: Viewing store as Superadmin. All actions are audited."}
            </span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleExitImpersonation}
            className="bg-white hover:bg-white/90 text-rose-700 hover:text-rose-800 font-bold px-3 py-1 h-7 rounded text-[11px] shadow-sm uppercase tracking-wider shrink-0 transition-all border-none"
          >
            {lang === "ar" ? "الخروج من وضع المحاكاة" : "Exit Impersonation Mode"}
          </Button>
        </div>
      )}

      {/* Main Boutq OS Workspace Frame */}
      <div className="flex-1 flex overflow-hidden">
        {/* Level 1: Collapsible Navigation (Full Sidebar vs Compact Dock Rail) */}
        {!isFocusMode &&
          (sidebarExpanded ? (
            <OsSidebar
              brandLabel={brandLabel}
              brandSubtitle={activeSlug ? `@${activeSlug}` : "Boutq OS"}
              activeSlug={activeSlug}
              navItems={navItems}
              pathname={pathname}
              lang={lang}
              isSuperAdmin={isSuperAdmin}
              isCourier={isCourier}
              brands={brandsQ.data ?? []}
              collapsed={false}
              onToggleCollapse={toggleSidebarExpanded}
            />
          ) : (
            <OsAppDockRail
              brandLabel={brandLabel}
              activeSlug={activeSlug}
              navItems={navItems}
              pathname={pathname}
              lang={lang}
              isSuperAdmin={isSuperAdmin}
              isCourier={isCourier}
              brands={brandsQ.data ?? []}
              onExpandSidebar={toggleSidebarExpanded}
            />
          ))}

        {/* Mobile Navigation Header & Bottom Dock */}
        <OsMobileNavigation
          brandLabel={brandLabel}
          currentPageLabel={currentPageLabel}
          activeSlug={activeSlug}
          navItems={navItems}
          pathname={pathname}
          lang={lang}
          onSetLang={setLang}
          onSignOut={signOut}
          mobileOpen={mobileOpen}
          onOpenChangeMobile={setMobileOpen}
        />

        {/* Level 2: Active Application Window Frame */}
        <div
          className={cn(
            "flex-1 flex flex-col min-w-0 print-area pt-14 md:pt-0 overflow-hidden transition-all duration-300",
            isFocusMode && "ps-3 pt-3",
          )}
        >
          {/* Level 1: Top System OS Menu Bar */}
          {!isFocusMode && (
            <OsMenuBar
              brandLabel={brandLabel}
              lang={lang}
              onSetLang={setLang}
              onOpenSpotlight={() => setSpotlightOpen(true)}
              onSignOut={signOut}
              userEmail={profile?.email}
            />
          )}

          {/* Level 2: Active Application Window */}
          <main className="relative flex-1 flex flex-col min-h-0 mx-0 md:mx-3 md:mb-3 overflow-hidden select-text">
            <OsAppWindow
              icon={activeNavItem?.icon}
              title={currentPageLabel || brandLabel}
              subtitle={undefined}
              isFocusMode={isFocusMode}
              onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
              pageKey={pathname}
              badge={
                activeSlug && (
                  <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                    {activeSlug.toUpperCase()}
                  </span>
                )
              }
              actions={
                <div className="flex items-center gap-1.5">
                  {activeSlug && !isCourier && (
                    <a
                      href={
                        typeof window !== "undefined" &&
                        window.location.hostname.toLowerCase() !== "localhost" &&
                        window.location.hostname.toLowerCase() !== "127.0.0.1"
                          ? `https://${activeSlug}.boutq.store`
                          : `/${activeSlug}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 h-6.5 px-2 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-md transition-colors"
                      title={lang === "ar" ? "عرض المتجر الإلكتروني" : "View Live Storefront"}
                    >
                      <Store className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline text-[11px]">
                        {lang === "ar" ? "المتجر" : "Storefront"}
                      </span>
                    </a>
                  )}
                </div>
              }
            >
              {children}
            </OsAppWindow>
          </main>
        </div>
      </div>

      {/* Level 3: Spotlight Command Palette */}
      <SpotlightCommandPalette open={spotlightOpen} onOpenChange={setSpotlightOpen} />
    </div>
  );
}
