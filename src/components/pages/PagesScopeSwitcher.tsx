import { Layout, Share2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type PagesScope = "pages" | "socials";

interface PagesScopeSwitcherProps {
  lang: "ar" | "en";
  activeScope: PagesScope;
  onScopeChange: (scope: PagesScope) => void;
  pageCount: number;
}

export function PagesScopeSwitcher({
  lang,
  activeScope,
  onScopeChange,
  pageCount,
}: PagesScopeSwitcherProps) {
  const isAr = lang === "ar";

  const scopes: {
    id: PagesScope;
    icon: React.ElementType;
    labelAr: string;
    labelEn: string;
    badge?: number;
  }[] = [
    {
      id: "pages",
      icon: Layout,
      labelAr: "صفحات المتجر والسياسات",
      labelEn: "Storefront Pages & Policies",
      badge: pageCount,
    },
    {
      id: "socials",
      icon: Share2,
      labelAr: "حسابات التواصل والواتساب",
      labelEn: "Social Links & WhatsApp Widget",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-border/60 bg-muted/40 p-1 sm:flex sm:items-center">
      {scopes.map((s) => {
        const Icon = s.icon;
        const isActive = activeScope === s.id;

        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onScopeChange(s.id)}
            className={cn(
              "flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition-all duration-200 cursor-pointer sm:justify-start sm:whitespace-nowrap sm:px-3",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm scale-[1.01]"
                : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{isAr ? s.labelAr : s.labelEn}</span>
            {s.badge !== undefined && (
              <span
                className={cn(
                  "ms-1 px-1.5 py-0.2 text-[10px] font-extrabold rounded-full",
                  isActive
                    ? "bg-primary-foreground text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {s.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
