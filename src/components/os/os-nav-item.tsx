import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OsNavItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  badge?: string | number;
  href?: string;
}

export const OsNavItem = React.forwardRef<HTMLAnchorElement, OsNavItemProps>(
  ({ icon: Icon, label, active = false, collapsed = false, badge, className, ...props }, ref) => {
    return (
      <a
        ref={ref}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 outline-none os-focus-ring select-none",
          active
            ? "bg-primary text-primary-foreground shadow-md font-semibold"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          collapsed && "justify-center px-2 py-2.5",
          className,
        )}
        title={collapsed ? label : undefined}
        {...props}
      >
        <Icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110")} />

        {!collapsed && <span className="truncate flex-1">{label}</span>}

        {badge !== undefined && (
          <span
            className={cn(
              "ms-auto rounded-full px-2 py-0.5 text-[10px] font-bold tracking-tight shrink-0",
              active
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground",
              collapsed && "absolute -top-1 -end-1 px-1 py-0 text-[9px]",
            )}
          >
            {badge}
          </span>
        )}
      </a>
    );
  },
);

OsNavItem.displayName = "OsNavItem";
