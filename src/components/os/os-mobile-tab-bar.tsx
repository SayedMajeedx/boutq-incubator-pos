import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OsMobileTabItem {
  id: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
  badge?: string | number;
}

export interface OsMobileTabBarProps {
  items: OsMobileTabItem[];
  className?: string;
}

export function OsMobileTabBar({ items, className }: OsMobileTabBarProps) {
  return (
    <nav
      className={cn(
        "no-print fixed bottom-0 inset-x-0 z-40 lg:hidden flex items-center justify-around px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] border-t border-[var(--os-border)] os-glass-strong shadow-2xl backdrop-blur-xl",
        className,
      )}
      aria-label="Mobile Navigation"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 min-w-[56px] min-h-[44px] py-1 px-2 rounded-xl transition-all duration-200 outline-none select-none",
              item.active
                ? "text-primary font-bold scale-105"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <div className="relative">
              <Icon className="h-5 w-5 stroke-[1.75]" />
              {item.badge !== undefined && (
                <span className="absolute -top-1.5 -end-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium tracking-tight truncate max-w-[64px]">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
