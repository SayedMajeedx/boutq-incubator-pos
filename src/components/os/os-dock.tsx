import * as React from "react";
import { cn } from "@/lib/utils";

export interface OsDockProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
}

export const OsDock = React.forwardRef<HTMLDivElement, OsDockProps>(
  ({ glass = true, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-2 p-2 rounded-[var(--os-radius-dock)] border border-[var(--os-border)] shadow-[var(--os-dock-shadow)]",
          glass ? "os-glass-strong" : "bg-card/90",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

OsDock.displayName = "OsDock";
