import React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, LucideIcon, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface InventoryScopeTab {
  id: string;
  label_en: string;
  label_ar: string;
  count: number;
  icon: LucideIcon;
}

interface InventoryScopeSwitcherProps {
  lang: "en" | "ar";
  tabs: readonly InventoryScopeTab[] | InventoryScopeTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const InventoryScopeSwitcher: React.FC<InventoryScopeSwitcherProps> = ({
  lang,
  tabs,
  activeTab,
  onTabChange,
}) => {
  const isAr = lang === "ar";
  const mobileTabs = tabs.slice(0, 2);
  const overflowTabs = tabs.slice(2);
  const activeOverflowTab = overflowTabs.find((tab) => tab.id === activeTab);

  const renderTab = (tab: InventoryScopeTab, mobile = false) => {
    const isActive = activeTab === tab.id;
    const label = isAr ? tab.label_ar : tab.label_en;
    const TabIcon = tab.icon;

    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => onTabChange(tab.id)}
        aria-pressed={isActive}
        className={cn(
          "group inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all touch-manipulation focus:outline-hidden focus:ring-2 focus:ring-primary/40",
          mobile ? "min-w-0 flex-1" : "shrink-0",
          isActive
            ? "bg-primary text-primary-foreground shadow-2xs"
            : "border border-border/60 bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <TabIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <span
          className={cn(
            "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold tabular-nums",
            isActive ? "bg-primary-foreground/20" : "bg-muted",
          )}
        >
          {tab.count}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="hidden items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar select-none sm:flex">
        {tabs.map((tab) => renderTab(tab))}
      </div>
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))_44px] gap-1.5 rounded-2xl border border-border/60 bg-muted/35 p-1 sm:hidden">
        {mobileTabs.map((tab) => renderTab(tab, true))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={isAr ? "المزيد من حالات المخزون" : "More inventory scopes"}
              className={cn(
                "flex min-h-10 items-center justify-center rounded-xl border border-border/60 bg-card text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40",
                activeOverflowTab && "border-primary/30 bg-primary/10 text-primary",
              )}
            >
              {activeOverflowTab ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isAr ? "start" : "end"} className="min-w-56">
            {overflowTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <DropdownMenuItem
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={cn("gap-2", activeTab === tab.id && "bg-primary/10 text-primary")}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{isAr ? tab.label_ar : tab.label_en}</span>
                  <span className="rounded-full bg-muted px-2 text-[10px] font-bold tabular-nums">
                    {tab.count}
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
