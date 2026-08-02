import * as React from "react";
import { type LucideIcon, PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { OsSurface } from "./os-surface";

export interface OsEmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function OsEmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
  className,
}: OsEmptyStateProps) {
  return (
    <OsSurface
      variant="glass"
      radius="panel"
      className={cn(
        "flex flex-col items-center justify-center p-8 sm:p-12 text-center max-w-md mx-auto my-6 border border-dashed border-border/80 shadow-xs",
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground mb-4 border border-border/50 shadow-inner">
        <Icon className="h-7 w-7 stroke-[1.5]" />
      </div>

      <h3 className="text-lg font-bold font-heading text-foreground mb-1">{title}</h3>

      {description && (
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-5 max-w-xs">
          {description}
        </p>
      )}

      {action && <div className="mt-1">{action}</div>}
    </OsSurface>
  );
}
