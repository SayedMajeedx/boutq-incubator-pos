import { Tag, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type DiscountStatusTab = "all" | "active" | "scheduled" | "expired";

interface DiscountsScopeSwitcherProps {
  lang: "ar" | "en";
  currentTab: DiscountStatusTab;
  onTabChange: (tab: DiscountStatusTab) => void;
  counts: {
    all: number;
    active: number;
    scheduled: number;
    expired: number;
  };
}

export function DiscountsScopeSwitcher({
  lang,
  currentTab,
  onTabChange,
  counts,
}: DiscountsScopeSwitcherProps) {
  const isAr = lang === "ar";

  const tabs = [
    {
      id: "all" as const,
      label: isAr ? "جميع الرموز" : "All Codes",
      count: counts.all,
      icon: Tag,
    },
    {
      id: "active" as const,
      label: isAr ? "النشطة" : "Active",
      count: counts.active,
      icon: CheckCircle2,
      accent: "text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "scheduled" as const,
      label: isAr ? "المجدولة" : "Scheduled",
      count: counts.scheduled,
      icon: Clock,
      accent: "text-blue-600 dark:text-blue-400",
    },
    {
      id: "expired" as const,
      label: isAr ? "المنتهية / المكتملة" : "Expired / Capped",
      count: counts.expired,
      icon: AlertCircle,
      accent: "text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border/60 bg-muted/40 p-1 sm:flex sm:items-center">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-all duration-200 cursor-pointer sm:whitespace-nowrap sm:px-3 sm:py-1.5",
              isActive
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
            )}
          >
            <Icon
              className={cn("h-3.5 w-3.5 shrink-0", !isActive && tab.accent ? tab.accent : "")}
            />
            <span className="truncate">{tab.label}</span>
            <span
              className={cn(
                "ms-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
