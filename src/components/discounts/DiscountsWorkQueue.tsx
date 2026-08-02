import {
  Pencil,
  Trash2,
  Tag,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  Percent,
  DollarSign,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

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

interface DiscountsWorkQueueProps {
  lang: "ar" | "en";
  promos: Promo[];
  currency: string;
  analyticsData?: Record<string, { count: number; revenue: number }>;
  onEdit: (promo: Promo) => void;
  onToggleActive: (promo: Promo) => void;
  onDelete: (promo: Promo) => void;
}

export function DiscountsWorkQueue({
  lang,
  promos,
  currency,
  analyticsData,
  onEdit,
  onToggleActive,
  onDelete,
}: DiscountsWorkQueueProps) {
  const isAr = lang === "ar";
  const now = new Date();

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-start text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
              <th className="p-3 text-start">{isAr ? "رمز الخصم" : "Promo Code"}</th>
              <th className="p-3 text-start">{isAr ? "قيمة الخصم" : "Discount Value"}</th>
              <th className="p-3 text-start">
                {isAr ? "الشروط والأهلية" : "Eligibility & Conditions"}
              </th>
              <th className="p-3 text-start">{isAr ? "الجدولة" : "Schedule"}</th>
              <th className="p-3 text-center">
                {isAr ? "الاستخدام والإيرادات" : "Usage & Revenue"}
              </th>
              <th className="p-3 text-center">{isAr ? "الحالة" : "Status"}</th>
              <th className="p-3 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {promos.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  {isAr ? "لا توجد رموز خصم مطابقة" : "No discount codes found."}
                </td>
              </tr>
            ) : (
              promos.map((p) => {
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
                      {isAr ? "مكتمل الاستخدام" : "Cap Reached"}
                    </span>
                  );
                }

                return (
                  <tr
                    key={p.id}
                    className="hover:bg-muted/30 transition-colors group cursor-pointer"
                    onClick={() => onEdit(p)}
                  >
                    {/* Code Badge */}
                    <td className="p-3 align-middle font-mono">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 font-bold text-xs">
                        <Tag className="h-3.5 w-3.5 shrink-0" />
                        <span>{p.code}</span>
                      </div>
                    </td>

                    {/* Discount Value */}
                    <td className="p-3 align-middle font-bold text-foreground">
                      <div className="flex items-center gap-1">
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
                    </td>

                    {/* Eligibility & Conditions */}
                    <td className="p-3 align-middle text-muted-foreground">
                      <div className="flex flex-col gap-0.5 max-w-[220px]">
                        {p.minimum_order_amount && (
                          <span className="text-[11px]">
                            {isAr ? "الحد الأدنى:" : "Min order:"}{" "}
                            <b className="text-foreground">
                              {formatMoney(p.minimum_order_amount, currency)}
                            </b>
                          </span>
                        )}
                        {p.maximum_discount_amount && p.discount_type === "percentage" && (
                          <span className="text-[11px]">
                            {isAr ? "أقصى خصم:" : "Max cap:"}{" "}
                            <b className="text-foreground">
                              {formatMoney(p.maximum_discount_amount, currency)}
                            </b>
                          </span>
                        )}
                        {p.first_time_customers_only && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                            ✨ {isAr ? "للعملاء الجدد فقط" : "First-time buyers only"}
                          </span>
                        )}
                        {!p.minimum_order_amount &&
                          !p.maximum_discount_amount &&
                          !p.first_time_customers_only && (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                      </div>
                    </td>

                    {/* Schedule */}
                    <td className="p-3 align-middle text-muted-foreground font-mono text-[11px]">
                      <div className="flex flex-col gap-0.5">
                        {p.start_date && (
                          <span>
                            {isAr ? "من:" : "From:"}{" "}
                            <b className="text-foreground">
                              {new Date(p.start_date).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                              })}
                            </b>
                          </span>
                        )}
                        {p.end_date && (
                          <span>
                            {isAr ? "إلى:" : "To:"}{" "}
                            <b className="text-foreground">
                              {new Date(p.end_date).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                              })}
                            </b>
                          </span>
                        )}
                        {!p.start_date && !p.end_date && (
                          <span>{isAr ? "دائم" : "Always active"}</span>
                        )}
                      </div>
                    </td>

                    {/* Usage & Revenue */}
                    <td className="p-3 align-middle text-center font-mono">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-bold text-foreground text-xs">
                          {usage} {p.max_redemptions ? `/ ${p.max_redemptions}` : ""}{" "}
                          {isAr ? "استخدام" : "redemptions"}
                        </span>
                        {revenue > 0 && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                            {formatMoney(revenue, currency)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status Badge & Switch */}
                    <td
                      className="p-3 align-middle text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        {statusBadge}
                        <Switch
                          checked={p.is_active}
                          onCheckedChange={() => onToggleActive(p)}
                          className="scale-80"
                        />
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="p-3 align-middle text-end" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(p)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title={isAr ? "تعديل" : "Edit"}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(p)}
                          className="h-7 w-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title={isAr ? "حذف" : "Delete"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
