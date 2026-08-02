import * as React from "react";
import { type LucideIcon, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface OsAppWindowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: LucideIcon;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  pageKey?: string;
}

export const OsAppWindow = React.forwardRef<HTMLDivElement, OsAppWindowProps>(
  (
    {
      icon: Icon,
      title,
      subtitle,
      actions,
      badge,
      isFocusMode = false,
      onToggleFocusMode,
      pageKey,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "os-window-frame flex flex-col flex-1 min-w-0 overflow-hidden transition-all duration-300",
          className,
        )}
        {...props}
      >
        {/* Window Titlebar Region */}
        <div className="no-print h-11 px-4 border-b border-[var(--os-border)]/60 bg-gradient-to-r from-muted/30 via-background/80 to-muted/20 backdrop-blur-md flex items-center justify-between gap-3 shrink-0 select-none">
          {/* Left: App Identity */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Module Icon Container */}
            {Icon && (
              <div className="h-6 w-6 rounded-md bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 shadow-2xs">
                <Icon className="h-3.5 w-3.5" />
              </div>
            )}

            {/* Module Title & Subtitle */}
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-xs font-bold font-heading text-foreground truncate">
                {title}
              </span>
              {subtitle && (
                <span className="hidden md:inline text-[11px] text-muted-foreground truncate">
                  — {subtitle}
                </span>
              )}
              {badge}
            </div>
          </div>

          {/* Right: Window Actions & Focus Mode Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            {actions}

            {onToggleFocusMode && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleFocusMode}
                className="hidden md:inline-flex h-6 w-6 text-muted-foreground hover:text-foreground rounded-md p-0"
                title={
                  isFocusMode
                    ? "خروج من مساحة العمل المركزة / Exit Focus Workspace"
                    : "دخول مساحة العمل المركزة / Enter Focus Workspace"
                }
                aria-label={
                  isFocusMode
                    ? "خروج من مساحة العمل المركزة / Exit Focus Workspace"
                    : "دخول مساحة العمل المركزة / Enter Focus Workspace"
                }
              >
                {isFocusMode ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Opaque Readable Content Area with Butter-Smooth Page Transition */}
        <div
          key={pageKey}
          className="flex-1 overflow-auto os-scrollbar p-4 pb-28 sm:p-5 sm:pb-8 bg-card/95 text-card-foreground os-page-transition"
        >
          {children}
        </div>
      </div>
    );
  },
);

OsAppWindow.displayName = "OsAppWindow";
