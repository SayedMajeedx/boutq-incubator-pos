import { CalendarDays, TrendingUp, ShieldAlert, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardViewScope = "financials" | "diagnostics" | "sales_series";

interface DashboardScopeSwitcherProps {
  lang: "ar" | "en";
  activeScope: DashboardViewScope;
  onScopeChange: (scope: DashboardViewScope) => void;
  lowStockCount: number;
}

export function DashboardScopeSwitcher({
  lang,
  activeScope,
  onScopeChange,
  lowStockCount,
}: DashboardScopeSwitcherProps) {
  const isAr = lang === "ar";

  const scopes: {
    id: DashboardViewScope;
    icon: React.ElementType;
    labelAr: string;
    labelEn: string;
    badge?: number;
  }[] = [
    {
      id: "financials",
      icon: TrendingUp,
      labelAr: "المؤشرات المالية (30 يومًا)",
      labelEn: "Financial Telemetry (30 Days)",
    },
    {
      id: "sales_series",
      icon: CalendarDays,
      labelAr: "مخطط المبيعات اليومية",
      labelEn: "Daily Sales Chart",
    },
    {
      id: "diagnostics",
      icon: ShieldAlert,
      labelAr: "تشخيص المخزون والعملاء",
      labelEn: "Stock & CRM Diagnostics",
      badge: lowStockCount > 0 ? lowStockCount : undefined,
    },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-muted/40 border border-border/60 rounded-2xl scrollbar-none">
      {scopes.map((scope) => {
        const Icon = scope.icon;
        const isActive = activeScope === scope.id;

        return (
          <button
            key={scope.id}
            type="button"
            onClick={() => onScopeChange(scope.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer shrink-0",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm scale-[1.01]"
                : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{isAr ? scope.labelAr : scope.labelEn}</span>
            {scope.badge !== undefined && (
              <span
                className={cn(
                  "ms-1 px-1.5 py-0.2 text-[10px] font-extrabold rounded-full",
                  isActive
                    ? "bg-primary-foreground text-primary"
                    : "bg-amber-500/20 text-amber-700 dark:text-amber-400",
                )}
              >
                {scope.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
