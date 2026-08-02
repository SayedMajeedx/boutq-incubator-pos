import { useEffect, useState } from "react";
import { Link, useRouterState, useParams } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getRecentModules,
  recordVisitedModule,
  resolveRouteTitles,
  type RecentModule,
} from "@/lib/os-productivity";
import { OsPinnedActions } from "./os-pinned-actions";

interface OsRecentHistoryBarProps {
  lang: "ar" | "en";
  currentPageTitle?: string;
}

export function OsRecentHistoryBar({ lang, currentPageTitle }: OsRecentHistoryBarProps) {
  const isAr = lang === "ar";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const params = useParams({ strict: false }) as { slug?: string };
  const activeSlug = params?.slug ?? null;
  const [recents, setRecents] = useState<RecentModule[]>([]);

  useEffect(() => {
    if (pathname) {
      recordVisitedModule({
        path: pathname,
        titleEn: currentPageTitle || "Workspace",
        titleAr: currentPageTitle || "مساحة العمل",
      });
      setRecents(getRecentModules());
    }
  }, [pathname, currentPageTitle]);

  return (
    <div className="hidden lg:flex items-center justify-between gap-3 px-3 py-1 bg-muted/30 border-b border-border/40 text-xs shrink-0 select-none">
      {/* Left: Recently Visited Modules */}
      <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground me-1 shrink-0">
          <Clock className="h-3 w-3 text-primary" />
          <span>{isAr ? "الزيارات الأخيرة:" : "Recent Visits:"}</span>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
          {recents.map((item) => {
            const isActive = pathname === item.path;
            const titles = resolveRouteTitles(item.path, isAr ? item.titleAr : item.titleEn);
            const label = isAr ? titles.ar : titles.en;

            return (
              <Link
                key={item.path}
                to={item.path as any}
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium transition-all duration-150 whitespace-nowrap",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/20 font-bold"
                    : "bg-background/60 text-muted-foreground hover:bg-background hover:text-foreground border border-border/40 shadow-2xs",
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Right: Pinned Quick Actions */}
      <OsPinnedActions lang={lang} activeSlug={activeSlug} />
    </div>
  );
}
