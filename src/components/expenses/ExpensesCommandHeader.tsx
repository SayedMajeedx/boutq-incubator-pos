import { Plus, Sparkles, Wallet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExpensesCommandHeaderProps {
  lang: "ar" | "en";
  expenseCount: number;
  scanning: boolean;
  onScanReceipt: () => void;
  onCreateNew: () => void;
}

export function ExpensesCommandHeader({
  lang,
  expenseCount,
  scanning,
  onScanReceipt,
  onCreateNew,
}: ExpensesCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-4 sm:p-5 shadow-sm">
      {/* Background Mesh */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/10 pointer-events-none" />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary tracking-wide">
            <Wallet className="h-3 w-3 shrink-0" />
            <span>{isAr ? "إدارة المصروفات والتكاليف" : "EXPENSE MANAGEMENT"}</span>
            <span className="ms-1 px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold">
              {expenseCount}
            </span>
          </div>

          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
            {isAr ? "سجل المصروفات والنفقات" : "Expenses & Operational Costs"}
          </h1>

          <p className="text-xs text-muted-foreground max-w-xl">
            {isAr
              ? "تتبع المصروفات التشغيلية، ومسح الفواتير بالذكاء الاصطناعي، وتحليل هامش الربح الصافي."
              : "Track operational expenses, scan receipts with AI, and evaluate net profit margins."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          <Button
            type="button"
            variant="outline"
            onClick={onScanReceipt}
            disabled={scanning}
            className="shadow-2xs transition-all duration-200 hover:scale-[1.01] active:scale-95 gap-2 text-xs font-bold border-primary/20 text-primary hover:bg-primary/5"
          >
            {scanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            )}
            <span>
              {scanning
                ? isAr
                  ? "جاري المسح الضوئي..."
                  : "Scanning Receipt…"
                : isAr
                  ? "مسح فاتورة بالذكاء الاصطناعي"
                  : "AI Receipt Scanner"}
            </span>
          </Button>

          <Button
            type="button"
            onClick={onCreateNew}
            className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-1.5 text-xs font-bold"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? "إضافة مصروف" : "Add Expense"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
