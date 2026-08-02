import { Link, useRouterState, useNavigate, useParams } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  Users,
  ReceiptText,
  Settings,
  LogOut,
  Languages,
  Menu,
  Wallet,
  Megaphone,
  Shield,
  Store,
  Crown,
  Plug,
  Tags,
  FileText,
  BadgePercent,
  Mail,
  Clock as ClockIcon,
  BarChart,
  Search,
} from "lucide-react";
import { SpotlightCommandPalette } from "@/components/spotlight-command-palette";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useProfile } from "@/lib/profile-context";
import { toast } from "sonner";

type BrandRow = { id: string; slug: string; name_en: string; is_active: boolean };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
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

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSpotlightOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const [hasImpersonationToken, setHasImpersonationToken] = useState(false);

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

  // Fallback: use the user's own brand slug when we're outside /b/:slug (e.g. on /brands)
  const activeSlug = urlSlug ?? profile?.brand?.slug ?? null;

  // close drawer when route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body viewport scrolling for premium native app panel feel
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

  // Super admin: load all brands for the switcher
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

  // Build brand-prefixed nav items. If no active slug, links go to /dashboard (redirector).
  const nav = useMemo(() => {
    const items: {
      to: string;
      params?: any;
      label: string;
      icon: typeof LayoutDashboard;
      permission?: string;
      adminOnly?: boolean;
      section: "overview" | "operations" | "growth_finance" | "storefront_settings";
    }[] = [];
    if (activeSlug) {
      if (isCourier) {
        items.push({
          to: "/admin/b/$slug/orders",
          params: { slug: activeSlug },
          label: t("nav.orders"),
          icon: ReceiptText,
          section: "operations",
        });
        return items;
      }

      // Group 1: OVERVIEW
      items.push(
        {
          to: "/admin/b/$slug/dashboard",
          params: { slug: activeSlug },
          label: t("nav.dashboard"),
          icon: LayoutDashboard,
          section: "overview",
        },
        {
          to: "/admin/b/$slug/reports",
          params: { slug: activeSlug },
          label: lang === "ar" ? "التقارير" : "Reports",
          icon: BarChart,
          permission: "manage_orders",
          section: "overview",
        },
      );

      // Group 2: OPERATIONS
      items.push(
        {
          to: "/admin/b/$slug/orders",
          params: { slug: activeSlug },
          label: lang === "ar" ? "الطلبات والفواتير" : "Orders & Invoices",
          icon: ReceiptText,
          permission: "manage_orders",
          section: "operations",
        },
        {
          to: "/admin/b/$slug/customers",
          params: { slug: activeSlug },
          label: t("nav.customers"),
          icon: Users,
          permission: "manage_customers",
          section: "operations",
        },
        {
          to: "/admin/b/$slug/inventory",
          params: { slug: activeSlug },
          label: t("nav.inventory"),
          icon: Package,
          permission: "manage_inventory",
          section: "operations",
        },
        {
          to: "/admin/b/$slug/categories",
          params: { slug: activeSlug },
          label: lang === "ar" ? "الأقسام" : "Categories",
          icon: Tags,
          permission: "manage_inventory",
          section: "operations",
        },
      );

      // Group 3: GROWTH & FINANCE
      items.push(
        {
          to: "/admin/b/$slug/campaigns",
          params: { slug: activeSlug },
          label: lang === "ar" ? "حملات الواتساب" : "WhatsApp Campaigns",
          icon: Megaphone,
          permission: "manage_orders",
          section: "growth_finance",
        },
        {
          to: "/admin/b/$slug/discounts",
          params: { slug: activeSlug },
          label: lang === "ar" ? "رموز الخصم" : "Discount Codes",
          icon: BadgePercent,
          permission: "manage_settings",
          section: "growth_finance",
        },
        {
          to: "/admin/b/$slug/expenses",
          params: { slug: activeSlug },
          label: t("nav.expenses"),
          icon: Wallet,
          permission: "view_financials",
          section: "growth_finance",
        },
      );

      // Group 4: STOREFRONT & SETTINGS
      if (isAdmin) {
        items.push({
          to: "/admin/b/$slug/integrations",
          params: { slug: activeSlug },
          label: t("nav.integrations"),
          icon: Plug,
          adminOnly: true,
          section: "storefront_settings",
        });
      }
      items.push(
        {
          to: "/admin/b/$slug/communications",
          params: { slug: activeSlug },
          label: lang === "ar" ? "الاتصالات" : "Communications",
          icon: Mail,
          permission: "manage_settings",
          section: "storefront_settings",
        },
        {
          to: "/admin/b/$slug/pages",
          params: { slug: activeSlug },
          label: lang === "ar" ? "الصفحات والسياسات" : "Pages & Policies",
          icon: FileText,
          permission: "manage_settings",
          section: "storefront_settings",
        },
      );
      if (isAdmin) {
        items.push({
          to: "/admin/b/$slug/team",
          params: { slug: activeSlug },
          label: lang === "ar" ? "إدارة الموظفين" : "Team Management",
          icon: Shield,
          adminOnly: true,
          section: "storefront_settings",
        });
      }
      items.push({
        to: "/admin/b/$slug/settings",
        params: { slug: activeSlug },
        label: t("nav.settings"),
        icon: Settings,
        permission: "manage_settings",
        section: "storefront_settings",
      });
    }

    return items.filter((item) => {
      if (item.adminOnly) return isAdmin;
      if (item.permission) return hasPermission(item.permission);
      return true;
    });
  }, [t, lang, isAdmin, isCourier, activeSlug, hasPermission]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const brandLabel =
    profile?.brand?.[lang === "ar" ? "name_ar" : "name_en"] ??
    profile?.brand?.name_en ??
    t("app.title");
  const currentPageLabel = nav.find((item) =>
    pathname.startsWith(item.to.replace("$slug", item.params?.slug ?? "")),
  )?.label;

  const SidebarContent = (
    <>
      <div className="p-6 border-b border-sidebar-border">
        <h1 className="text-2xl font-display text-sidebar-foreground leading-tight">
          {brandLabel}
        </h1>
        <p className="mt-1 text-xs text-sidebar-foreground/70">{t("app.subtitle")}</p>
      </div>

      {isSuperAdmin && (
        <div className="p-3 border-b border-sidebar-border space-y-2">
          <div className="flex items-center gap-2 px-1 text-xs uppercase tracking-wider text-sidebar-foreground/80">
            <Crown className="h-3.5 w-3.5" />
            {lang === "ar" ? "المدير الأعلى" : "Super Admin"}
          </div>
          <Select
            value={activeSlug ?? ""}
            onValueChange={(v) => navigate({ to: "/admin/b/$slug/dashboard", params: { slug: v } })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={lang === "ar" ? "اختر علامة" : "Select a brand"} />
            </SelectTrigger>
            <SelectContent>
              {(brandsQ.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.slug}>
                  {b.name_en}
                  {!b.is_active ? " (inactive)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link
            to="/admin/brands"
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors",
              pathname === "/admin/brands"
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Store className="h-3.5 w-3.5" />
            {lang === "ar" ? "إدارة العلامات" : "Manage brands"}
          </Link>
          <Link
            to="/admin/super/requests"
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors",
              pathname === "/admin/super/requests"
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <ClockIcon className="h-3.5 w-3.5" />
            {lang === "ar" ? "طلبات التسجيل" : "Tenant Requests"}
          </Link>
          <Link
            to="/admin/super/settings"
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors",
              pathname === "/admin/super/settings"
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Settings className="h-3.5 w-3.5" />
            {lang === "ar" ? "إعدادات المنصة" : "Platform Settings"}
          </Link>
        </div>
      )}

      {activeSlug && !isCourier && (
        <div className="px-3 pt-3">
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
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white/90 bg-white/5 border border-white/20 rounded-lg hover:bg-white/10 transition-all mb-4"
          >
            <Store className="h-4 w-4" />
            {lang === "ar" ? "عرض المتجر" : "View Storefront"}
          </a>
        </div>
      )}

      <nav className="flex-1 p-3 space-y-4 overflow-y-auto scrollbar-none">
        {[
          { id: "overview", header: lang === "ar" ? "نظرة عامة" : "OVERVIEW" },
          { id: "operations", header: lang === "ar" ? "العمليات" : "OPERATIONS" },
          { id: "growth_finance", header: lang === "ar" ? "النمو والمالية" : "GROWTH & FINANCE" },
          {
            id: "storefront_settings",
            header: lang === "ar" ? "المتجر والإعدادات" : "STOREFRONT & SETTINGS",
          },
        ].map((sec) => {
          const items = nav.filter((item) => item.section === sec.id);
          if (items.length === 0) return null;
          return (
            <div key={sec.id} className="space-y-1">
              <div className="text-[10px] font-bold tracking-wider text-white/40 uppercase px-3 mt-5 mb-1.5">
                {sec.header}
              </div>
              <div className="flex flex-col gap-1">
                {items.map((item) => {
                  const active = pathname.startsWith(
                    item.to.replace("$slug", item.params?.slug ?? ""),
                  );
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to as any}
                      params={item.params}
                      className={cn(
                        "flex items-center gap-3 py-2.5 min-h-[44px] text-sm transition-all",
                        active
                          ? cn(
                              "bg-white/15 text-white font-semibold transition-all",
                              lang === "ar"
                                ? "border-r-4 border-amber-400 pr-3 rounded-l-lg"
                                : "border-l-4 border-amber-400 pl-3 rounded-r-lg",
                            )
                          : "text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors px-3",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </>
  );

  // SECURITY: fail closed. If we're done loading and still have no profile,
  // the account has no confirmed role/brand — don't render the admin shell
  // or any of its data-fetching children.
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
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {isImpersonating && (
        <div className="no-print bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white px-6 py-2.5 text-center text-xs font-semibold flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-red-700/40 shrink-0 select-none shadow-md z-50 animate-in fade-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2.5">
            <Shield className="h-4.5 w-4.5 text-white animate-pulse" />
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
            className="bg-white hover:bg-white/90 text-rose-700 hover:text-rose-800 font-bold px-4 py-1.5 h-7.5 rounded text-[11px] shadow-sm uppercase tracking-wider shrink-0 transition-all border-none"
          >
            {lang === "ar" ? "الخروج من وضع المحاكاة" : "Exit Impersonation Mode"}
          </Button>
        </div>
      )}
      <div className="flex-1 flex bg-background overflow-hidden">
        <aside className="no-print hidden md:flex w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex-col shrink-0">
          {SidebarContent}
        </aside>

        <div className="md:hidden no-print fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between px-3 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={lang === "ar" ? "right" : "left"}
              className="w-72 border-0 p-0 flex flex-col bg-sidebar text-sidebar-foreground shadow-2xl"
            >
              <SheetTitle className="sr-only">{brandLabel}</SheetTitle>
              {SidebarContent}
            </SheetContent>
          </Sheet>
          <div className="min-w-0 text-center leading-tight flex-1 px-2">
            <h1 className="truncate text-base font-display text-sidebar-foreground">
              {brandLabel}
            </h1>
            {currentPageLabel && (
              <div className="truncate text-[10px] text-sidebar-foreground/70">
                {currentPageLabel}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 min-h-[44px] min-w-[44px] flex items-center justify-center text-sidebar-foreground/80 hover:text-sidebar-foreground"
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              aria-label="Toggle language"
            >
              <span className="text-[11px] font-bold uppercase">{lang === "en" ? "AR" : "EN"}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 min-h-[44px] min-w-[44px] flex items-center justify-center text-sidebar-foreground/80 hover:text-sidebar-foreground"
              onClick={signOut}
              aria-label={t("nav.signOut")}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <main className="flex-1 flex flex-col print-area pt-14 md:pt-0 bg-background/95 overflow-hidden">
          <header className="no-print hidden md:flex h-14 border-b border-border bg-card shrink-0 items-center justify-between px-8">
            <div className="flex items-center gap-4">
              <div className="font-display font-medium text-lg text-foreground">
                {currentPageLabel || ""}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSpotlightOpen(true)}
                className="h-8 px-3 gap-2 text-xs text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 border-border/60 rounded-lg transition-all"
              >
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden lg:inline">
                  {lang === "ar" ? "بحث سريع..." : "Quick search..."}
                </span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </Button>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Languages className="h-4 w-4 text-muted-foreground" />
                <Select value={lang} onValueChange={(v) => setLang(v as "en" | "ar")}>
                  <SelectTrigger className="h-8 text-xs w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ar">العربية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={signOut}
              >
                <LogOut className="h-3.5 w-3.5" /> {t("nav.signOut")}
              </Button>
            </div>
          </header>

          <div className="flex-1 overflow-auto min-h-0">{children}</div>
        </main>
      </div>
      <SpotlightCommandPalette open={spotlightOpen} onOpenChange={setSpotlightOpen} />
    </div>
  );
}
