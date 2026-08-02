import * as React from "react";
import { cn } from "@/lib/utils";

export interface OsSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "card" | "avatar" | "button" | "panel";
}

export function OsSkeleton({ variant = "text", className, ...props }: OsSkeletonProps) {
  const variantClasses = {
    text: "h-4 w-full rounded-md",
    card: "h-32 w-full rounded-2xl",
    avatar: "h-10 w-10 rounded-full",
    button: "h-9 w-24 rounded-xl",
    panel: "h-64 w-full rounded-[var(--os-radius-panel)]",
  };

  return (
    <div
      className={cn(
        "animate-pulse bg-muted/60 dark:bg-muted/40 os-hairline",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
