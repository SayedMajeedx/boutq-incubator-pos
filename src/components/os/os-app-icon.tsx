import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OsAppIconProps {
  icon: LucideIcon;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  badge?: string | number;
  className?: string;
}

export function OsAppIcon({
  icon: Icon,
  size = "md",
  selected = false,
  badge,
  className,
}: OsAppIconProps) {
  const sizeClasses = {
    sm: "h-8 w-8 rounded-lg text-xs",
    md: "h-10 w-10 rounded-xl text-sm",
    lg: "h-12 w-12 rounded-2xl text-base",
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <div
        className={cn(
          "flex items-center justify-center font-medium transition-all duration-200 border shadow-sm",
          sizeClasses[size],
          selected
            ? "bg-primary text-primary-foreground border-primary/20 shadow-md scale-105"
            : "bg-muted/50 text-foreground border-border/60 hover:bg-muted/80 hover:border-border",
          className,
        )}
      >
        <Icon className={iconSizes[size]} />
      </div>

      {badge !== undefined && (
        <span className="absolute -top-1 -end-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground shadow-sm">
          {badge}
        </span>
      )}
    </div>
  );
}
