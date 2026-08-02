import * as React from "react";
import { cn } from "@/lib/utils";

export interface OsPageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function OsPageHeader({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryActions,
  badge,
  className,
}: OsPageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between py-2 border-b border-[var(--os-border)]/40 pb-4 mb-4",
        className,
      )}
    >
      <div className="space-y-1 min-w-0">
        {eyebrow && (
          <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
            {eyebrow}
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-heading text-foreground">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">{description}</p>
        )}
      </div>

      {(primaryAction || secondaryActions) && (
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </div>
  );
}
