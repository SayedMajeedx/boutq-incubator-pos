import * as React from "react";
import { cn } from "@/lib/utils";

export interface OsPageProps extends React.HTMLAttributes<HTMLDivElement> {
  fullWidth?: boolean;
}

export const OsPage = React.forwardRef<HTMLDivElement, OsPageProps>(
  ({ fullWidth = false, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "w-full space-y-6 pb-20 sm:pb-12 transition-all duration-200",
          !fullWidth && "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8",
          fullWidth && "px-4 sm:px-6",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

OsPage.displayName = "OsPage";
