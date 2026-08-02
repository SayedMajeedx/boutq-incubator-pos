import { Link } from "@tanstack/react-router";
import { Store, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { OsBrandSwitcher, type BrandRow } from "./os-brand-switcher";
import { type AdminNavItemConfig } from "@/config/admin-navigation";

export interface OsAppDockRailProps {
  brandLabel: string;
  activeSlug: string | null;
  navItems: AdminNavItemConfig[];
  pathname: string;
  lang: "en" | "ar";
  isSuperAdmin: boolean;
  isCourier: boolean;
  brands: BrandRow[];
  onExpandSidebar?: () => void;
  className?: string;
}

export function OsAppDockRail({
  brandLabel,
  activeSlug,
  navItems,
  pathname,
  lang,
  isSuperAdmin,
  isCourier,
  brands,
  onExpandSidebar,
  className,
}: OsAppDockRailProps) {
  // Primary Rail Items (Top 6 Core Modules)
  const primaryRailIds = ["dashboard", "orders", "inventory", "customers", "reports", "settings"];
  const primaryItems = navItems.filter((i) => primaryRailIds.includes(i.id));

  return (
    <aside
      aria-label={lang === "ar" ? "شريط التطبيقات" : "Boutq OS App Dock"}
      className={cn(
        "no-print hidden md:flex flex-col items-center justify-between shrink-0 border border-[var(--os-border)] os-glass-strong shadow-[var(--os-dock-shadow)] transition-all duration-300 relative z-30 my-3 ms-3 py-3 w-16 rounded-[var(--os-radius-dock)] overflow-visible select-none",
        className,
      )}
    >
      {/* Top: Brand Identity / App Rail */}
      <div className="flex flex-col items-center gap-3 w-full">
        {/* Brand App Monogram + Sidebar Expand Toggle */}
        <div className="flex flex-col items-center gap-2">
          <div
            title={brandLabel}
            aria-label={brandLabel}
            className="h-9 w-9 rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-amber-700 text-primary-foreground font-bold font-heading text-xs flex items-center justify-center shadow-md border border-primary/20 hover:scale-105 transition-transform cursor-pointer"
            onClick={onExpandSidebar}
          >
            {brandLabel.slice(0, 2).toUpperCase()}
          </div>

          {onExpandSidebar && (
            <button
              type="button"
              onClick={onExpandSidebar}
              title={lang === "ar" ? "توسيع شريط القائمة" : "Expand Full Sidebar"}
              aria-label={lang === "ar" ? "توسيع شريط القائمة" : "Expand Full Sidebar"}
              className="h-7 w-7 rounded-xl bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all hover:scale-110 shadow-2xs border border-border/40"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="w-7 h-px bg-[var(--os-border)] my-0.5" />

        {/* Primary App Rail Icons */}
        <nav
          aria-label={lang === "ar" ? "التطبيقات الرئيسية" : "Primary Applications"}
          className="flex flex-col items-center gap-2.5 w-full px-2"
        >
          {primaryItems.map((item) => {
            const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
            const active = pathname.startsWith(targetPath);
            const label = lang === "ar" ? item.labelAr : item.labelEn;
            const Icon = item.icon;

            return (
              <Link
                key={item.id}
                to={item.to as any}
                params={item.params as any}
                title={label}
                aria-label={label}
                className="relative group block outline-none os-focus-ring"
              >
                <div
                  className={cn(
                    "h-10 w-10 rounded-2xl flex items-center justify-center border transition-all duration-200 hover:scale-110 active:scale-95 shadow-2xs",
                    active
                      ? "bg-primary/15 text-primary border-primary/30 ring-2 ring-primary/20"
                      : "bg-background/60 hover:bg-background/90 text-muted-foreground hover:text-foreground border-border/50",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4.5 w-4.5 transition-colors",
                      active ? "stroke-[2.2] text-primary" : "text-foreground/80",
                    )}
                  />
                </div>

                {/* Hover Tooltip Label */}
                <div className="absolute start-full top-1/2 -translate-y-1/2 ms-3 px-2.5 py-1 rounded-lg bg-popover text-popover-foreground text-xs font-semibold shadow-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 border border-border/60">
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom: Storefront Link & Super Admin Switcher */}
      <div className="flex flex-col items-center gap-2.5 w-full">
        {/* View Storefront Link */}
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
            title={lang === "ar" ? "عرض المتجر" : "View Storefront"}
            aria-label={lang === "ar" ? "عرض المتجر" : "View Storefront"}
            className="h-9 w-9 rounded-xl bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground border border-border/60 flex items-center justify-center transition-all hover:scale-105"
          >
            <Store className="h-4 w-4 text-primary" />
          </a>
        )}

        {/* Super Admin Switcher */}
        {isSuperAdmin && (
          <OsBrandSwitcher
            activeSlug={activeSlug}
            brands={brands}
            lang={lang}
            pathname={pathname}
            collapsed={true}
          />
        )}
      </div>
    </aside>
  );
}
