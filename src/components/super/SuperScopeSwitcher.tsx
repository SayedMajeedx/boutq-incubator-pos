import { Clock, DollarSign, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export type SuperScope = "requests" | "pricing" | "settings";

interface SuperScopeSwitcherProps {
  lang: "ar" | "en";
  activeScope: SuperScope;
  onScopeChange: (scope: SuperScope) => void;
  pendingCount: number;
}

export function SuperScopeSwitcher({
  lang,
  activeScope,
  onScopeChange,
  pendingCount,
}: SuperScopeSwitcherProps) {
  const isAr = lang === "ar";

  const scopes: {
    id: SuperScope;
    icon: React.ElementType;
    labelAr: string;
    labelEn: string;
    badge?: number;
  }[] = [
    {
      id: "requests",
      icon: Clock,
      labelAr: "طلبات الانضمام المعلقة",
      labelEn: "Pending Requests",
      badge: pendingCount,
    },
    {
      id: "pricing",
      icon: DollarSign,
      labelAr: "تسعير الاشتراكات والعروض",
      labelEn: "Dynamic Pricing & Offers",
    },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-muted/40 border border-border/60 rounded-2xl scrollbar-none">
      {scopes.map((s) => {
        const Icon = s.icon;
        const isActive = activeScope === s.id;

        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onScopeChange(s.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer shrink-0",
              isActive
                ? "bg-amber-600 text-white shadow-sm scale-[1.01]"
                : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{isAr ? s.labelAr : s.labelEn}</span>
            {s.badge !== undefined && (
              <span
                className={cn(
                  "ms-1 px-1.5 py-0.2 text-[10px] font-extrabold rounded-full",
                  isActive
                    ? "bg-white text-amber-700"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
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
