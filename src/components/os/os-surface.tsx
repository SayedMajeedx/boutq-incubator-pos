import * as React from "react";
import { osSurface, type OsSurfaceVariant, type OsRadius } from "@/lib/boutq-os";

export interface OsSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: OsSurfaceVariant;
  radius?: OsRadius;
  border?: boolean;
  interactive?: boolean;
  asChild?: boolean;
}

export const OsSurface = React.forwardRef<HTMLDivElement, OsSurfaceProps>(
  (
    {
      variant = "glass",
      radius = "lg",
      border = true,
      interactive = false,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={osSurface({ variant, radius, border, interactive, className })}
        {...props}
      >
        {children}
      </div>
    );
  },
);

OsSurface.displayName = "OsSurface";
