import React from "react";
import { Star, Users, RefreshCw, UserPlus, AlertCircle, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type CustomerSegmentScope = "all" | "vip" | "repeat" | "new" | "churn";

interface CustomersScopeSwitcherProps {
  lang: "en" | "ar";
  currentScope: CustomerSegmentScope;
  onScopeChange: (scope: CustomerSegmentScope) => void;
  counts: Record<CustomerSegmentScope, number>;
}

export const CustomersScopeSwitcher: React.FC<CustomersScopeSwitcherProps> = ({
  lang,
  currentScope,
  onScopeChange,
  counts,
}) => {
  const isAr = lang === "ar";

  const scopes: Array<{
    id: CustomerSegmentScope;
    labelEn: string;
    labelAr: string;
    icon: React.ElementType;
    badgeStyle?: string;
  }> = [
    { id: "all", labelEn: "All Customers", labelAr: "جميع العملاء", icon: Users },
    {
      id: "vip",
      labelEn: "VIP Segment",
      labelAr: "المميزون VIP",
      icon: Star,
      badgeStyle: "text-amber-600 dark:text-amber-400",
    },
    {
      id: "repeat",
      labelEn: "Repeat Buyers",
      labelAr: "المتكررون",
      icon: RefreshCw,
      badgeStyle: "text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "new",
      labelEn: "New Buyers",
      labelAr: "العملاء الجدد",
      icon: UserPlus,
      badgeStyle: "text-blue-600 dark:text-blue-400",
    },
    {
      id: "churn",
      labelEn: "Churn Risk",
      labelAr: "العملاء الغائبون",
      icon: AlertCircle,
      badgeStyle: "text-rose-600 dark:text-rose-400",
    },
  ];

  const renderScope = (scope: (typeof scopes)[number], mobile = false) => {
    const Icon = scope.icon;
    const isActive = currentScope === scope.id;
    const count = counts[scope.id] || 0;

    return (
      <button
        key={scope.id}
        type="button"
        aria-pressed={isActive}
        onClick={() => onScopeChange(scope.id)}
        className={cn(
          "flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all cursor-pointer",
          mobile ? "min-w-0 flex-1" : "shrink-0",
          isActive
            ? "border border-border/80 bg-card text-foreground shadow-2xs"
            : "text-muted-foreground hover:bg-card/50 hover:text-foreground",
        )}
      >
        <Icon className={cn("h-3.5 w-3.5 shrink-0", scope.badgeStyle)} />
        <span className="truncate">{isAr ? scope.labelAr : scope.labelEn}</span>
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px] font-extrabold",
            isActive ? "bg-primary/10 text-primary" : "bg-muted",
          )}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="hidden items-center gap-1.5 overflow-x-auto rounded-xl border border-border/50 bg-muted/50 p-1 no-scrollbar sm:flex">
        {scopes.map((scope) => {
          return renderScope(scope);
        })}
      </div>
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))_44px] gap-1.5 rounded-2xl border border-border/60 bg-muted/35 p-1 sm:hidden">
        {scopes.slice(0, 2).map((scope) => renderScope(scope, true))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={isAr ? "المزيد من شرائح العملاء" : "More customer segments"}
              className={cn(
                "flex min-h-10 items-center justify-center rounded-xl border border-border/60 bg-card text-muted-foreground",
                ["repeat", "new", "churn"].includes(currentScope) &&
                  "border-primary/30 bg-primary/10 text-primary",
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isAr ? "start" : "end"} className="min-w-56">
            {scopes.slice(2).map((scope) => {
              const Icon = scope.icon;
              return (
                <DropdownMenuItem
                  key={scope.id}
                  onClick={() => onScopeChange(scope.id)}
                  className={cn("gap-2", currentScope === scope.id && "bg-primary/10 text-primary")}
                >
                  <Icon className={cn("h-4 w-4", scope.badgeStyle)} />
                  <span className="flex-1">{isAr ? scope.labelAr : scope.labelEn}</span>
                  <span className="rounded-full bg-muted px-2 text-[10px] font-bold">
                    {counts[scope.id] || 0}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
};
