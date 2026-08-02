import * as React from "react";
import { cn } from "@/lib/utils";
import { OsSurface, type OsSurfaceProps } from "./os-surface";

export interface OsPanelProps extends OsSurfaceProps {
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export const OsPanel = React.forwardRef<HTMLDivElement, OsPanelProps>(
  (
    {
      header,
      footer,
      children,
      className,
      variant = "glassStrong",
      radius = "panel",
      border = true,
      ...props
    },
    ref,
  ) => {
    return (
      <OsSurface
        ref={ref}
        variant={variant}
        radius={radius}
        border={border}
        className={cn("flex flex-col overflow-hidden shadow-lg", className)}
        {...props}
      >
        {header && (
          <div className="border-b border-[var(--os-border)] px-5 py-4 bg-muted/20 backdrop-blur-sm">
            {header}
          </div>
        )}
        <div className="flex-1 p-5 sm:p-6">{children}</div>
        {footer && (
          <div className="border-t border-[var(--os-border)] px-5 py-3.5 bg-muted/10 backdrop-blur-sm">
            {footer}
          </div>
        )}
      </OsSurface>
    );
  },
);

OsPanel.displayName = "OsPanel";
