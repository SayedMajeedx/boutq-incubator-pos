import React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface ScopeTab {
  id: string;
  label_en: string;
  label_ar: string;
  count: number;
  icon: LucideIcon;
}

interface OrdersScopeSwitcherProps {
  lang: "en" | "ar";
  tabs: readonly ScopeTab[] | ScopeTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const OrdersScopeSwitcher: React.FC<OrdersScopeSwitcherProps> = ({
  lang,
  tabs,
  activeTab,
  onTabChange,
}) => {
  const isAr = lang === "ar";

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar select-none">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const label = isAr ? tab.label_ar : tab.label_en;
        const TabIcon = tab.icon;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "group inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all shrink-0 touch-manipulation focus:outline-hidden focus:ring-2 focus:ring-primary/40",
              isActive
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            <TabIcon
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isActive
                  ? "text-primary-foreground"
                  : "text-muted-foreground group-hover:text-primary",
              )}
            />
            <span className="whitespace-nowrap">{label}</span>
            <span
              className={cn(
                "inline-flex items-center px-1.5 py-0.2 text-[10px] font-extrabold rounded-full font-mono tabular-nums",
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground group-hover:bg-muted/80",
              )}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
};
