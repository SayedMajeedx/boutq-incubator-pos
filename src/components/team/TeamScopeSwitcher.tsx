import { Users, CheckCircle2, UserX } from "lucide-react";
import { cn } from "@/lib/utils";

export type TeamStatusScope = "all" | "active" | "inactive";

interface TeamScopeSwitcherProps {
  lang: "ar" | "en";
  activeScope: TeamStatusScope;
  onScopeChange: (scope: TeamStatusScope) => void;
  counts?: Record<TeamStatusScope, number>;
}

export function TeamScopeSwitcher({
  lang,
  activeScope,
  onScopeChange,
  counts,
}: TeamScopeSwitcherProps) {
  const isAr = lang === "ar";

  const scopes: {
    id: TeamStatusScope;
    icon: React.ElementType;
    labelAr: string;
    labelEn: string;
  }[] = [
    { id: "all", icon: Users, labelAr: "كافة الأعضاء", labelEn: "All Team Members" },
    { id: "active", icon: CheckCircle2, labelAr: "الأعضاء النشطون", labelEn: "Active Staff" },
    { id: "inactive", icon: UserX, labelAr: "الحسابات المعطلة", labelEn: "Inactive / Suspended" },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-muted/40 border border-border/60 rounded-2xl scrollbar-none">
      {scopes.map((s) => {
        const Icon = s.icon;
        const isActive = activeScope === s.id;
        const count = counts?.[s.id];

        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onScopeChange(s.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer shrink-0",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm scale-[1.01]"
                : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{isAr ? s.labelAr : s.labelEn}</span>
            {count !== undefined && (
              <span
                className={cn(
                  "ms-1 px-1.5 py-0.2 text-[10px] font-extrabold rounded-full",
                  isActive
                    ? "bg-primary-foreground text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
