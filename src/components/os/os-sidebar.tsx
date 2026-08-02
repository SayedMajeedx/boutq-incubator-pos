import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Store, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { OsNavItem } from "./os-nav-item";
import { OsBrandSwitcher, type BrandRow } from "./os-brand-switcher";
import { type AdminNavItemConfig } from "@/config/admin-navigation";

export interface OsSidebarProps {
  brandLabel: string;
  brandSubtitle: string;
  activeSlug: string | null;
  navItems: AdminNavItemConfig[];
  pathname: string;
  lang: "en" | "ar";
  isSuperAdmin: boolean;
  isCourier: boolean;
  brands: BrandRow[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export function OsSidebar({
  brandLabel,
  brandSubtitle,
  activeSlug,
  navItems,
  pathname,
  lang,
  isSuperAdmin,
  isCourier,
  brands,
  collapsed,
  onToggleCollapse,
  className,
}: OsSidebarProps) {
  const sections = [
    { id: "overview", header: lang === "ar" ? "نظرة عامة" : "OVERVIEW" },
    { id: "operations", header: lang === "ar" ? "العمليات" : "OPERATIONS" },
    { id: "growth_finance", header: lang === "ar" ? "النمو والمالية" : "GROWTH & FINANCE" },
    {
      id: "storefront_settings",
      header: lang === "ar" ? "المتجر والإعدادات" : "STOREFRONT & SETTINGS",
    },
  ];

  return (
    <aside
      className={cn(
        "no-print hidden md:flex flex-col shrink-0 border border-[var(--os-border)] os-glass-strong shadow-xl transition-all duration-300 relative z-20 my-3 ms-3 rounded-[var(--os-radius-panel)] overflow-hidden",
        collapsed ? "w-20" : "w-64",
        className,
      )}
    >
      {/* Brand Header */}
      <div className="p-4 border-b border-[var(--os-border)] flex items-center justify-between gap-2 bg-card/30">
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <span className="text-xl font-bold font-heading text-foreground truncate leading-tight block">
              {brandLabel}
            </span>
            <p className="text-[11px] text-muted-foreground truncate">{brandSubtitle}</p>
          </div>
        ) : (
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold font-heading text-base shadow-sm">
            {brandLabel.slice(0, 2).toUpperCase()}
          </div>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          className="h-7 w-7 rounded-lg hover:bg-muted/80 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors shrink-0 outline-none os-focus-ring"
          title={
            collapsed
              ? lang === "ar"
                ? "توسيع الشريط"
                : "Expand sidebar"
              : lang === "ar"
                ? "طي الشريط"
                : "Collapse sidebar"
          }
        >
          {collapsed ? (
            lang === "ar" ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : lang === "ar" ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Super Admin Switcher */}
      {isSuperAdmin && (
        <OsBrandSwitcher
          activeSlug={activeSlug}
          brands={brands}
          lang={lang}
          pathname={pathname}
          collapsed={collapsed}
        />
      )}

      {/* View Storefront Quick Button */}
      {activeSlug && !isCourier && !collapsed && (
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
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-foreground/90 bg-muted/40 border border-[var(--os-border)] rounded-xl hover:bg-muted/80 transition-all shadow-2xs"
          >
            <Store className="h-3.5 w-3.5 text-primary" />
            <span>{lang === "ar" ? "عرض المتجر" : "View Storefront"}</span>
          </a>
        </div>
      )}

      {/* Nav List */}
      <nav className="flex-1 p-3 space-y-4 overflow-y-auto scrollbar-none">
        {sections.map((sec) => {
          const items = navItems.filter((item) => item.section === sec.id);
          if (items.length === 0) return null;

          return (
            <div key={sec.id} className="space-y-1">
              {!collapsed && (
                <div className="text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase px-3 mt-4 mb-1.5">
                  {sec.header}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {items.map((item) => {
                  const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
                  const active = pathname.startsWith(targetPath);
                  const label = lang === "ar" ? item.labelAr : item.labelEn;

                  return (
                    <Link
                      key={item.id}
                      to={item.to as any}
                      params={item.params as any}
                      preload="intent"
                      className="block"
                    >
                      <OsNavItem
                        icon={item.icon}
                        label={label}
                        active={active}
                        collapsed={collapsed}
                      />
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
