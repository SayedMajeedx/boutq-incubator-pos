import { Pencil, Trash2, Tag, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";

type Promo = {
  id: string;
  brand_id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  minimum_order_amount: number | null;
  maximum_discount_amount: number | null;
  first_time_customers_only: boolean;
  exclude_sale_items: boolean;
  usage_limit_per_customer: number | null;
  is_active: boolean;
  created_at: string;
  exclude_low_margin: boolean;
  margin_threshold: number;
  start_date: string | null;
  end_date: string | null;
  max_redemptions: number | null;
};

interface DiscountMobileCardProps {
  lang: "ar" | "en";
  promo: Promo;
  currency: string;
  analyticsData?: Record<string, { count: number; revenue: number }>;
  onEdit: (promo: Promo) => void;
  onToggleActive: (promo: Promo) => void;
  onDelete: (promo: Promo) => void;
}

export function DiscountMobileCard({
  lang,
  promo: p,
  currency,
  analyticsData,
  onEdit,
  onToggleActive,
  onDelete,
}: DiscountMobileCardProps) {
  const isAr = lang === "ar";
  const now = new Date();

  const isStarted = !p.start_date || new Date(p.start_date) <= now;
  const isExpired = p.end_date && new Date(p.end_date) < now;
  const usage = analyticsData?.[p.id]?.count || 0;
  const revenue = analyticsData?.[p.id]?.revenue || 0;
  const isCapReached = p.max_redemptions != null && usage >= p.max_redemptions;

  let statusBadge = (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
      <CheckCircle2 className="h-3 w-3" />
      {isAr ? "نشط" : "Active"}
    </span>
  );

  if (!p.is_active) {
    statusBadge = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        {isAr ? "متوقف" : "Paused"}
      </span>
    );
  } else if (!isStarted) {
    statusBadge = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
        <Clock className="h-3 w-3" />
        {isAr ? "مجدول" : "Scheduled"}
      </span>
    );
  } else if (isExpired) {
    statusBadge = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
        <AlertCircle className="h-3 w-3" />
        {isAr ? "منتهي" : "Expired"}
      </span>
    );
  } else if (isCapReached) {
    statusBadge = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        <AlertCircle className="h-3 w-3" />
        {isAr ? "مكتمل" : "Cap Reached"}
      </span>
    );
  }

  return (
    <Card
      className="p-3.5 border border-border/60 shadow-sm rounded-xl bg-card/60 backdrop-blur-sm space-y-2.5 transition-all duration-200 hover:border-primary/40 cursor-pointer"
      onClick={() => onEdit(p)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 font-mono font-bold text-xs">
          <Tag className="h-3.5 w-3.5 shrink-0" />
          <span>{p.code}</span>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {statusBadge}
          <Switch
            checked={p.is_active}
            onCheckedChange={() => onToggleActive(p)}
            className="scale-80"
          />
        </div>
      </div>

      <div className="flex items-baseline justify-between text-xs pt-1 border-t border-border/40">
        <span className="text-muted-foreground">{isAr ? "قيمة الخصم:" : "Discount:"}</span>
        {p.discount_type === "percentage" ? (
          <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">
            %{p.discount_value}
          </span>
        ) : (
          <span className="text-primary font-extrabold text-sm">
            {formatMoney(p.discount_value, currency)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{isAr ? "الاستخدام الإجمالي:" : "Total Redemptions:"}</span>
        <span className="font-mono font-bold text-foreground">
          {usage} {p.max_redemptions ? `/ ${p.max_redemptions}` : ""}
        </span>
      </div>

      <div
        className="flex items-center justify-end gap-1 pt-2 border-t border-border/40"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(p)}
          className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1"
        >
          <Pencil className="h-3.5 w-3.5" />
          <span>{isAr ? "تعديل" : "Edit"}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(p)}
          className="h-7 px-2.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>{isAr ? "حذف" : "Delete"}</span>
        </Button>
      </div>
    </Card>
  );
}
