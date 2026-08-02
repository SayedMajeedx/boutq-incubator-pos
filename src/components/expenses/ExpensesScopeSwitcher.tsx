import { TrendingUp, PackageCheck, Wallet, Receipt, ChevronDown } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ExpensesScopeSwitcherProps {
  lang: "ar" | "en";
  currency: string;
  totalRevenue: number;
  totalCogs: number;
  manualOpex: number;
  processingFees: number;
  netProfit: number;
  marginPercentage: number;
}

export function ExpensesScopeSwitcher({
  lang,
  currency,
  totalRevenue,
  totalCogs,
  manualOpex,
  processingFees,
  netProfit,
  marginPercentage,
}: ExpensesScopeSwitcherProps) {
  const isAr = lang === "ar";
  const totalOpex = manualOpex + processingFees;
  const isProfitable = netProfit >= 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/30 p-1.5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        {/* 1. Total Revenue */}
        <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-card border border-border/50 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>{isAr ? "إجمالي الإيرادات" : "Total Revenue"}</span>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="font-extrabold text-sm text-foreground font-mono">
            {formatMoney(totalRevenue, currency)}
          </span>
        </div>

        {/* 2. COGS */}
        <div className="hidden flex-col gap-0.5 p-3 rounded-xl bg-card border border-border/50 shadow-2xs sm:flex">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>{isAr ? "تكلفة البضاعة (COGS)" : "COGS"}</span>
            <PackageCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="font-extrabold text-sm text-foreground font-mono">
            {formatMoney(totalCogs, currency)}
          </span>
        </div>

        {/* 3. Operating Expenses */}
        <div className="hidden flex-col gap-0.5 p-3 rounded-xl bg-card border border-border/50 shadow-2xs sm:flex">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>{isAr ? "المصروفات التشغيلية" : "Operating Opex"}</span>
            <Wallet className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="font-extrabold text-sm text-foreground font-mono">
            {formatMoney(totalOpex, currency)}
          </span>
        </div>

        {/* 4. Payment Fees */}
        <div className="hidden flex-col gap-0.5 p-3 rounded-xl bg-card border border-border/50 shadow-2xs sm:flex">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>{isAr ? "رسوم بوابة الدفع" : "Gateway Fees"}</span>
            <Receipt className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
          </div>
          <span className="font-extrabold text-sm text-foreground font-mono">
            {formatMoney(processingFees, currency)}
          </span>
        </div>

        {/* 5. Net Profit & Margin */}
        <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-card border border-border/50 shadow-2xs sm:col-span-4 lg:col-span-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>{isAr ? "صافي الربح والهامش" : "Net Profit / Margin"}</span>
            <span
              className={cn(
                "px-1.5 py-0.2 rounded-md text-[10px] font-extrabold",
                isProfitable
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
              )}
            >
              {marginPercentage.toFixed(1)}%
            </span>
          </div>
          <span
            className={cn(
              "font-extrabold text-sm font-mono",
              isProfitable
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400",
            )}
          >
            {formatMoney(netProfit, currency)}
          </span>
        </div>
      </div>
      <details className="group mt-1.5 sm:hidden">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-xl border border-border/50 bg-card px-3 text-xs font-bold text-muted-foreground">
          <span>{isAr ? "تفاصيل التكاليف والمصروفات" : "Cost and expense details"}</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 grid gap-2">
          <MetricRow
            label={isAr ? "تكلفة البضاعة" : "COGS"}
            value={formatMoney(totalCogs, currency)}
            icon={<PackageCheck className="h-4 w-4 text-blue-600" />}
          />
          <MetricRow
            label={isAr ? "المصروفات التشغيلية" : "Operating expenses"}
            value={formatMoney(totalOpex, currency)}
            icon={<Wallet className="h-4 w-4 text-amber-600" />}
          />
          <MetricRow
            label={isAr ? "رسوم بوابة الدفع" : "Gateway fees"}
            value={formatMoney(processingFees, currency)}
            icon={<Receipt className="h-4 w-4 text-purple-600" />}
          />
        </div>
      </details>
    </div>
  );
}

function MetricRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border/50 bg-card px-3">
      <span>{icon}</span>
      <span className="flex-1 text-xs font-semibold text-muted-foreground">{label}</span>
      <strong className="font-mono text-xs">{value}</strong>
    </div>
  );
}
