import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, dir, ...props }, ref) => (
  <SwitchPrimitives.Root
    // Keep the mechanical movement consistent in RTL layouts. Without an
    // explicit direction the thumb's transform can be mirrored outside the
    // track by Safari/Chromium when an Arabic ancestor sets direction: rtl.
    dir={dir ?? "ltr"}
    className={cn(
      // Always-visible border + distinct off-state so the control never blends into the surface.
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 shadow-sm transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      // Checked: primary accent fill + matching border for a clear ON signal.
      "data-[state=checked]:bg-primary data-[state=checked]:border-primary",
      // Unchecked: neutral gray fill with a stronger border so it stays visible on white or tinted cards.
      "data-[state=unchecked]:bg-muted data-[state=unchecked]:border-border",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 border border-border transition-transform duration-200",
        "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
