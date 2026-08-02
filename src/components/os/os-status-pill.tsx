import * as React from "react";
import { cn } from "@/lib/utils";

export type OsStatusVariant =
  "default" | "success" | "warning" | "destructive" | "info" | "neutral";

export interface OsStatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: OsStatusVariant;
  icon?: React.ReactNode;
  dot?: boolean;
}

export function OsStatusPill({
  variant = "default",
  icon,
  dot = false,
  className,
  children,
  ...props
}: OsStatusPillProps) {
  const variantClasses: Record<OsStatusVariant, string> = {
    default: "bg-muted text-muted-foreground border-border/60",
    neutral: "bg-muted/80 text-muted-foreground border-border/50",
    success:
      "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80",
    warning:
      "bg-amber-50 text-amber-800 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80",
    destructive:
      "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/80",
    info: "bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/80",
  };

  const dotClasses: Record<OsStatusVariant, string> = {
    default: "bg-muted-foreground",
    neutral: "bg-muted-foreground",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    destructive: "bg-rose-500",
    info: "bg-sky-500",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border shadow-2xs transition-colors select-none shrink-0",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotClasses[variant])} />}
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </span>
  );
}
