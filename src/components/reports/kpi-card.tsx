import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
  accent?: "burgundy" | "emerald" | "amber" | "blue";
  trend?: { value: number; label: string; isPositive: boolean };
}

const accents = {
  burgundy: "bg-[#6b1d24]/8 text-[#6b1d24]",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-sky-50 text-sky-700",
};

export function KpiCard({
  title,
  value,
  description,
  icon,
  className,
  trend,
  accent = "burgundy",
}: KpiCardProps) {
  return (
    <article
      className={cn(
        "group rounded-2xl border border-black/[.07] bg-white p-5 shadow-[0_14px_38px_-30px_rgba(43,23,25,.5)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_45px_-28px_rgba(43,23,25,.5)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">
          {title}
        </p>
        {icon && (
          <div
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-xl [&>svg]:h-5 [&>svg]:w-5",
              accents[accent],
            )}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="mt-4 text-[1.75rem] font-semibold leading-none tracking-tight text-[#24191a] tabular-nums">
        {value}
      </div>
      <div className="mt-3 flex min-h-5 items-center gap-2">
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold",
              trend.isPositive ? "text-emerald-700" : "text-rose-700",
            )}
          >
            {trend.isPositive ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {Math.abs(trend.value)}%
          </span>
        )}
        {description && <p className="text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
    </article>
  );
}
