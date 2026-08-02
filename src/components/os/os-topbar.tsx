import * as React from "react";
import { Search, Languages, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface OsTopbarProps {
  currentPageLabel?: string;
  lang: "en" | "ar";
  onSetLang: (lang: "en" | "ar") => void;
  onOpenSpotlight: () => void;
  onSignOut: () => void;
  className?: string;
}

export function OsTopbar({
  currentPageLabel,
  lang,
  onSetLang,
  onOpenSpotlight,
  onSignOut,
  className,
}: OsTopbarProps) {
  return (
    <header
      className={cn(
        "no-print hidden md:flex h-14 border border-[var(--os-border)] os-glass shadow-xs shrink-0 items-center justify-between px-6 my-3 me-3 rounded-[var(--os-radius-panel)] transition-all",
        className,
      )}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="font-heading font-bold text-lg text-foreground truncate">
          {currentPageLabel || ""}
        </div>

        {/* Command Center Spotlight Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSpotlight}
          className="h-8 px-3 gap-2 text-xs text-muted-foreground hover:text-foreground bg-background/60 hover:bg-background/90 border-[var(--os-border)] rounded-xl transition-all shadow-2xs"
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="hidden lg:inline font-medium">
            {lang === "ar" ? "البحث السريع..." : "Quick search..."}
          </span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded-md border bg-muted/80 px-1.5 font-mono text-[10px] font-semibold text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
      </div>

      <div className="flex items-center gap-4">
        {/* Language Switcher */}
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-muted-foreground" />
          <Select value={lang} onValueChange={(v) => onSetLang(v as "en" | "ar")}>
            <SelectTrigger className="h-8 text-xs w-28 bg-background/60 border-[var(--os-border)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sign Out Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2 text-xs font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
          onClick={onSignOut}
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>{lang === "ar" ? "تسجيل الخروج" : "Sign Out"}</span>
        </Button>
      </div>
    </header>
  );
}
