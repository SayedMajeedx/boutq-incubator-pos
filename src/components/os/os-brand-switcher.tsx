import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Crown, Store, Clock as ClockIcon, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface BrandRow {
  id: string;
  slug: string;
  name_en: string;
  is_active: boolean;
}

export interface OsBrandSwitcherProps {
  activeSlug: string | null;
  brands: BrandRow[];
  lang: "en" | "ar";
  pathname: string;
  collapsed?: boolean;
}

export function OsBrandSwitcher({
  activeSlug,
  brands,
  lang,
  pathname,
  collapsed = false,
}: OsBrandSwitcherProps) {
  const navigate = useNavigate();

  if (collapsed) {
    return (
      <div className="p-2 border-b border-[var(--os-border)] flex justify-center">
        <div
          title={lang === "ar" ? "المدير الأعلى" : "Super Admin"}
          className="h-8 w-8 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30"
        >
          <Crown className="h-4 w-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 border-b border-[var(--os-border)] space-y-2 bg-muted/20 backdrop-blur-xs rounded-xl mx-2 my-1">
      <div className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <Crown className="h-3.5 w-3.5 text-amber-500" />
        {lang === "ar" ? "المدير الأعلى" : "Super Admin"}
      </div>

      <Select
        value={activeSlug ?? ""}
        onValueChange={(v) => navigate({ to: "/admin/b/$slug/dashboard", params: { slug: v } })}
      >
        <SelectTrigger className="h-8 text-xs bg-background/80">
          <SelectValue placeholder={lang === "ar" ? "اختر علامة" : "Select a brand"} />
        </SelectTrigger>
        <SelectContent>
          {brands.map((b) => (
            <SelectItem key={b.id} value={b.slug}>
              {b.name_en}
              {!b.is_active ? " (inactive)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="grid grid-cols-1 gap-1 pt-1">
        <Link
          to="/admin/brands"
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            pathname === "/admin/brands"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "hover:bg-muted/80 text-muted-foreground hover:text-foreground",
          )}
        >
          <Store className="h-3.5 w-3.5" />
          {lang === "ar" ? "إدارة العلامات" : "Manage brands"}
        </Link>
        <Link
          to="/admin/super/requests"
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            pathname === "/admin/super/requests"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "hover:bg-muted/80 text-muted-foreground hover:text-foreground",
          )}
        >
          <ClockIcon className="h-3.5 w-3.5" />
          {lang === "ar" ? "طلبات التسجيل" : "Tenant Requests"}
        </Link>
        <Link
          to="/admin/super/settings"
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            pathname === "/admin/super/settings"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "hover:bg-muted/80 text-muted-foreground hover:text-foreground",
          )}
        >
          <Settings className="h-3.5 w-3.5" />
          {lang === "ar" ? "إعدادات المنصة" : "Platform Settings"}
        </Link>
      </div>
    </div>
  );
}
