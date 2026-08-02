import * as React from "react";
import { cn } from "@/lib/utils";

export interface OsToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  sticky?: boolean;
}

export const OsToolbar = React.forwardRef<HTMLDivElement, OsToolbarProps>(
  ({ sticky = false, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "os-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-[var(--os-border)] shadow-sm",
          sticky && "sticky top-4 z-30 shadow-md",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

OsToolbar.displayName = "OsToolbar";
