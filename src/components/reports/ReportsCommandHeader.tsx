import { Sparkles, ShieldCheck } from "lucide-react";

interface ReportsCommandHeaderProps {
  lang: "ar" | "en";
  title?: string;
  subtitle?: string;
}

export function ReportsCommandHeader({ lang, title, subtitle }: ReportsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-4 sm:p-5 shadow-sm">
      {/* Background Gradient Mesh */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/10 pointer-events-none" />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary tracking-wide">
            <Sparkles className="h-3 w-3 shrink-0" />
            <span>{isAr ? "رؤى الأعمال والتحليلات" : "BUSINESS INTELLIGENCE"}</span>
          </div>

          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
            {title || (isAr ? "التقارير والتحليلات" : "Reports & Analytics")}
          </h1>

          <p className="text-xs text-muted-foreground max-w-xl">
            {subtitle ||
              (isAr
                ? "تحليل شامل لبيانات متجرك حول المبيعات والأداء والمنتجات والعملاء."
                : "Real-time analytics and revenue reporting across sales, catalog velocity, and customers.")}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 shadow-2xs">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{isAr ? "بيانات آمنة ومحمية" : "Secure, Store-Scoped Data"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
