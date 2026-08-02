import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Menu,
  LogOut,
  LayoutDashboard,
  ReceiptText,
  Package,
  Users,
  Grid,
  X,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { OsMobileTabBar, type OsMobileTabItem } from "./os-mobile-tab-bar";
import { type AdminNavItemConfig } from "@/config/admin-navigation";
import { cn } from "@/lib/utils";

export interface OsMobileNavigationProps {
  brandLabel: string;
  currentPageLabel?: string;
  activeSlug: string | null;
  navItems: AdminNavItemConfig[];
  pathname: string;
  lang: "en" | "ar";
  onSetLang: (lang: "en" | "ar") => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onOpenChangeMobile: (open: boolean) => void;
}

export function OsMobileNavigation({
  brandLabel,
  currentPageLabel,
  activeSlug,
  navItems,
  pathname,
  lang,
  onSetLang,
  onSignOut,
  mobileOpen,
  onOpenChangeMobile,
}: OsMobileNavigationProps) {
  const navigate = useNavigate();

  // Pick top 4 items for quick mobile tabs + "More" item
  const primaryTabItems: OsMobileTabItem[] = React.useMemo(() => {
    if (!activeSlug) return [];

    const homeItem = navItems.find((i) => i.id === "dashboard") ?? {
      id: "dashboard",
      icon: LayoutDashboard,
      label: lang === "ar" ? "الرئيسية" : "Home",
      target: `/admin/b/${activeSlug}/dashboard`,
    };

    const ordersItem = navItems.find((i) => i.id === "orders") ?? {
      id: "orders",
      icon: ReceiptText,
      label: lang === "ar" ? "الطلبات" : "Orders",
      target: `/admin/b/${activeSlug}/orders`,
    };

    const inventoryItem = navItems.find((i) => i.id === "inventory") ?? {
      id: "inventory",
      icon: Package,
      label: lang === "ar" ? "المخزون" : "Inventory",
      target: `/admin/b/${activeSlug}/inventory`,
    };

    const customersItem = navItems.find((i) => i.id === "customers") ?? {
      id: "customers",
      icon: Users,
      label: lang === "ar" ? "العملاء" : "Customers",
      target: `/admin/b/${activeSlug}/customers`,
    };

    const items: OsMobileTabItem[] = [
      {
        id: "home",
        icon: homeItem.icon ?? LayoutDashboard,
        label: lang === "ar" ? "الرئيسية" : "Home",
        active: pathname.includes("/dashboard"),
        onClick: () => navigate({ to: `/admin/b/$slug/dashboard`, params: { slug: activeSlug } }),
      },
      {
        id: "orders",
        icon: ordersItem.icon ?? ReceiptText,
        label: lang === "ar" ? "الطلبات" : "Orders",
        active: pathname.includes("/orders"),
        onClick: () => navigate({ to: `/admin/b/$slug/orders`, params: { slug: activeSlug } }),
      },
      {
        id: "inventory",
        icon: inventoryItem.icon ?? Package,
        label: lang === "ar" ? "المخزون" : "Inventory",
        active: pathname.includes("/inventory"),
        onClick: () => navigate({ to: `/admin/b/$slug/inventory`, params: { slug: activeSlug } }),
      },
      {
        id: "customers",
        icon: customersItem.icon ?? Users,
        label: lang === "ar" ? "العملاء" : "Customers",
        active: pathname.includes("/customers"),
        onClick: () => navigate({ to: `/admin/b/$slug/customers`, params: { slug: activeSlug } }),
      },
      {
        id: "more",
        icon: Grid,
        label: lang === "ar" ? "المزيد" : "More",
        active: mobileOpen,
        onClick: () => onOpenChangeMobile(!mobileOpen),
      },
    ];

    return items;
  }, [activeSlug, navItems, pathname, lang, navigate, mobileOpen, onOpenChangeMobile]);

  // Organize navigation items into iOS Control Center Groups
  const navGroups = React.useMemo(() => {
    const coreIds = new Set(["dashboard", "reports", "orders", "customers", "inventory"]);
    const growthIds = new Set(["categories", "campaigns", "discounts", "pages"]);

    const core = navItems.filter((i) => coreIds.has(i.id));
    const growth = navItems.filter((i) => growthIds.has(i.id));
    const ops = navItems.filter((i) => !coreIds.has(i.id) && !growthIds.has(i.id));

    return [
      {
        id: "core",
        title: lang === "ar" ? "المساحة الرئيسية" : "Core Workspace",
        items: core,
      },
      {
        id: "growth",
        title: lang === "ar" ? "المبيعات والكتالوج" : "Sales & Catalog",
        items: growth,
      },
      {
        id: "ops",
        title: lang === "ar" ? "العمليات والنظام" : "Operations & System",
        items: ops,
      },
    ];
  }, [navItems, lang]);

  return (
    <>
      {/* Mobile Top Header */}
      <div className="md:hidden no-print fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between px-3 border-b border-[var(--os-border)] os-glass-strong text-foreground shadow-sm backdrop-blur-xl">
        <Sheet open={mobileOpen} onOpenChange={onOpenChangeMobile}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-foreground hover:bg-muted/80"
              aria-label={lang === "ar" ? "القائمة الرئيسية" : "Menu"}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>

          {/* iOS Liquid Glass Control Center Sheet */}
          <SheetContent
            side={lang === "ar" ? "right" : "left"}
            hideDefaultClose
            className="w-[85vw] sm:w-80 max-w-xs border-s border-border/80 p-0 flex flex-col bg-card dark:bg-slate-950 text-foreground shadow-2xl overflow-hidden z-50"
          >
            {/* Ambient liquid background blur blobs */}
            <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/20 blur-3xl pointer-events-none animate-pulse" />
            <div className="absolute bottom-10 -left-16 w-48 h-48 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />

            <SheetTitle className="sr-only">{brandLabel}</SheetTitle>

            {/* iOS Style Sheet Header */}
            <div className="p-4 sm:p-5 border-b border-white/15 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary/30 via-primary/20 to-amber-500/20 border border-white/30 text-primary font-heading font-black text-lg flex items-center justify-center shadow-xs shrink-0">
                  {brandLabel.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold font-heading text-foreground truncate flex items-center gap-1.5">
                    <span className="truncate">{brandLabel}</span>
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 shrink-0">
                      OS
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground truncate">{currentPageLabel || ""}</p>
                </div>
              </div>

              {/* iOS Style Round Glass Close Button */}
              <SheetClose asChild>
                <button
                  type="button"
                  className="h-9 w-9 rounded-full bg-muted/80 hover:bg-muted text-foreground border border-border/60 flex items-center justify-center transition-transform active:scale-90 shadow-sm shrink-0"
                  aria-label={lang === "ar" ? "إغلاق" : "Close"}
                >
                  <X className="h-4 w-4" />
                </button>
              </SheetClose>
            </div>

            {/* Categorized iOS Control Center Navigation Menu */}
            <nav className="flex-1 p-3.5 space-y-4 overflow-y-auto relative z-10 os-scrollbar">
              {navGroups.map((group) => {
                if (group.items.length === 0) return null;
                return (
                  <div key={group.id} className="space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 px-2 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      <span>{group.title}</span>
                    </div>

                    <div className="space-y-1 bg-white/30 dark:bg-slate-900/30 backdrop-blur-md rounded-2xl p-1.5 border border-white/20 dark:border-white/10 shadow-2xs">
                      {group.items.map((item) => {
                        const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
                        const active = pathname.startsWith(targetPath);
                        const Icon = item.icon;
                        const label = lang === "ar" ? item.labelAr : item.labelEn;

                        return (
                          <Link
                            key={item.id}
                            to={item.to as any}
                            params={item.params as any}
                            onClick={() => onOpenChangeMobile(false)}
                            className={cn(
                              "flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 active:scale-[0.98]",
                              active
                                ? "bg-primary text-primary-foreground font-semibold shadow-md border border-primary/30"
                                : "text-foreground/90 hover:text-foreground hover:bg-white/40 dark:hover:bg-slate-800/40",
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={cn(
                                  "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-all",
                                  active
                                    ? "bg-white/20 text-primary-foreground shadow-2xs"
                                    : "bg-primary/10 text-primary border border-primary/20",
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </div>
                              <span className="truncate">{label}</span>
                            </div>
                            {active && (
                              <span className="h-2 w-2 rounded-full bg-primary-foreground shadow-2xs" />
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>

            {/* iOS Liquid Control Center Footer */}
            <div className="p-3.5 border-t border-white/15 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md space-y-2.5 relative z-10">
              {/* Language Segmented Pill Toggle */}
              <div className="flex items-center justify-between bg-muted/60 p-1 rounded-2xl border border-white/20 dark:border-white/10">
                <span className="text-xs font-semibold px-3 text-muted-foreground">
                  {lang === "ar" ? "اللغة" : "Language"}
                </span>
                <div className="inline-flex rounded-xl bg-background/80 p-0.5 border border-border/40 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => onSetLang("en")}
                    className={cn(
                      "px-3 py-1 text-xs font-bold rounded-lg transition-all",
                      lang === "en"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetLang("ar")}
                    className={cn(
                      "px-3 py-1 text-xs font-bold rounded-lg transition-all",
                      lang === "ar"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    العربية
                  </button>
                </div>
              </div>

              {/* Sign Out Action */}
              <Button
                variant="outline"
                className="w-full h-11 min-h-[44px] gap-2 text-xs font-semibold text-destructive hover:bg-destructive/15 border-destructive/30 bg-destructive/5 rounded-2xl transition-all"
                onClick={onSignOut}
              >
                <LogOut className="h-4 w-4" />
                <span>{lang === "ar" ? "تسجيل الخروج" : "Sign Out"}</span>
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <div className="min-w-0 text-center leading-tight flex-1 px-2">
          <div className="truncate text-base font-bold font-heading text-foreground">
            {brandLabel}
          </div>
          {currentPageLabel && (
            <div className="truncate text-[10px] text-muted-foreground font-medium">
              {currentPageLabel}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-xl"
            onClick={() => onSetLang(lang === "en" ? "ar" : "en")}
            aria-label={lang === "en" ? "تبديل إلى العربية" : "Switch to English"}
          >
            <span className="text-[11px] font-bold uppercase">{lang === "en" ? "AR" : "EN"}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-destructive rounded-xl"
            onClick={onSignOut}
            aria-label={lang === "ar" ? "تسجيل الخروج" : "Sign Out"}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mobile Bottom Tab Bar */}
      {activeSlug && <OsMobileTabBar items={primaryTabItems} />}
    </>
  );
}
