import * as React from "react";
import { cn } from "@/lib/utils";

export interface OsSectionProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export const OsSection = React.forwardRef<HTMLElement, OsSectionProps>(
  ({ title, description, action, className, children, ...props }, ref) => {
    return (
      <section ref={ref} className={cn("space-y-4", className)} {...props}>
        {(title || description || action) && (
          <div className="flex flex-wrap items-end justify-between gap-2 px-1">
            <div>
              {title && (
                <h2 className="text-lg sm:text-xl font-bold font-heading text-foreground tracking-tight">
                  {title}
                </h2>
              )}
              {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        )}
        <div>{children}</div>
      </section>
    );
  },
);

OsSection.displayName = "OsSection";
