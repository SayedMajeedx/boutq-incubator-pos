import { Link, useLocation } from "@tanstack/react-router";
import { BarChart3, TrendingUp, Package, Users, Download, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ReportsScopeSwitcherProps {
  lang: "ar" | "en";
  slug: string;
}

const navItems = [
  {
    id: "overview",
    path: "/admin/b/$slug/reports",
    icon: BarChart3,
    en: "Overview",
    ar: "نظرة عامة",
  },
  {
    id: "sales",
    path: "/admin/b/$slug/reports/sales",
    icon: TrendingUp,
    en: "Sales",
    ar: "المبيعات",
  },
  {
    id: "products",
    path: "/admin/b/$slug/reports/products",
    icon: Package,
    en: "Products",
    ar: "المنتجات",
  },
  {
    id: "customers",
    path: "/admin/b/$slug/reports/customers",
    icon: Users,
    en: "Customers",
    ar: "العملاء",
  },
  {
    id: "export",
    path: "/admin/b/$slug/reports/export",
    icon: Download,
    en: "Export",
    ar: "التصدير",
  },
] as const;

export function ReportsScopeSwitcher({ lang, slug }: ReportsScopeSwitcherProps) {
  const isAr = lang === "ar";
  const location = useLocation();

  const activeId =
    navItems.find((item) =>
      item.id === "overview"
        ? location.pathname.endsWith("/reports") || location.pathname.endsWith("/reports/")
        : location.pathname.includes(`/reports/${item.id}`),
    )?.id ?? "overview";

  return (
    <>
      <div className="hidden items-center gap-1.5 overflow-x-auto rounded-xl border border-border/60 bg-muted/40 p-1 scrollbar-none sm:flex">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeId === item.id;

          return (
            <Link
              key={item.id}
              to={item.path}
              params={{ slug }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200",
                isActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{isAr ? item.ar : item.en}</span>
            </Link>
          );
        })}
      </div>
      <nav
        aria-label={isAr ? "أقسام التقارير" : "Report sections"}
        className="grid grid-cols-[repeat(2,minmax(0,1fr))_44px] gap-1.5 rounded-2xl border border-border/60 bg-muted/35 p-1 sm:hidden"
      >
        {navItems.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const isActive = activeId === item.id;
          return (
            <Link
              key={item.id}
              to={item.path}
              params={{ slug }}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold",
                isActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "border border-border/60 bg-card text-muted-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{isAr ? item.ar : item.en}</span>
            </Link>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={isAr ? "المزيد من التقارير" : "More reports"}
              className={cn(
                "flex min-h-10 items-center justify-center rounded-xl border border-border/60 bg-card text-muted-foreground",
                !["overview", "sales"].includes(activeId) &&
                  "border-primary/30 bg-primary/10 text-primary",
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isAr ? "start" : "end"} className="min-w-56">
            {navItems.slice(2).map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.id}
                  asChild
                  className={cn(activeId === item.id && "bg-primary/10 text-primary")}
                >
                  <Link to={item.path} params={{ slug }} className="flex w-full items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span>{isAr ? item.ar : item.en}</span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </>
  );
}
