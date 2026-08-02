import { Crown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SuperCommandHeaderProps {
  lang: "ar" | "en";
  pendingCount: number;
  onRefresh: () => void;
}

export function SuperCommandHeader({ lang, pendingCount, onRefresh }: SuperCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-card p-4 sm:p-5 shadow-sm">
      {/* Background Mesh */}
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-amber-500/5 pointer-events-none" />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300 tracking-wide">
            <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
              {isAr ? "لوحة تحكم المشرف العام منصة BOUTQ OS" : "SUPER ADMIN PLATFORM CONTROL"}
            </span>
          </div>

          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl flex items-center gap-2">
            <span>
              {isAr ? "طلبات الانضمام وأسعار المنصة" : "Tenant Requests & Platform Override"}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 rounded-full">
              {pendingCount} {isAr ? "طلبات معلقة" : "pending requests"}
            </span>
          </h1>

          <p className="text-xs text-muted-foreground max-w-xl">
            {isAr
              ? "مراجعة واعتماد طلبات المتاجر الجديدة، تفعيل المساحات، ومعاينة إيصالات تحويلات بينفت باي."
              : "Review and deploy new merchant store requests, verify BenefitPay transfer receipts, and override platform pricing."}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-1.5 text-xs font-bold border-amber-500/30 hover:border-amber-500/50 self-start sm:self-center"
        >
          <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
          <span>{isAr ? "تحديث القائمة" : "Refresh Requests"}</span>
        </Button>
      </div>
    </div>
  );
}
