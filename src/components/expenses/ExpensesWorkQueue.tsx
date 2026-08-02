import { Pencil, Trash2, Receipt, Store, Calendar, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Expense = {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  currency: string;
  expense_date: string;
  notes: string | null;
  store_name?: string | null;
  receipt_time?: string | null;
  tax_amount?: number | null;
  tax_rate?: number | null;
  receipt_url?: string | null;
};

interface ExpensesWorkQueueProps {
  lang: "ar" | "en";
  expenses: Expense[];
  currency: string;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
}

export function ExpensesWorkQueue({
  lang,
  expenses,
  currency,
  onEdit,
  onDelete,
}: ExpensesWorkQueueProps) {
  const isAr = lang === "ar";

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-start text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
              <th className="p-3 text-start">{isAr ? "التاريخ" : "Date"}</th>
              <th className="p-3 text-start">{isAr ? "التصنيف" : "Category"}</th>
              <th className="p-3 text-start">{isAr ? "المتجر / المورد" : "Store / Vendor"}</th>
              <th className="p-3 text-start">
                {isAr ? "الوصف والملاحظات" : "Description & Notes"}
              </th>
              <th className="p-3 text-center">{isAr ? "الفاتورة" : "Receipt"}</th>
              <th className="p-3 text-end">{isAr ? "المبلغ" : "Amount"}</th>
              <th className="p-3 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  {isAr
                    ? "لا توجد مصروفات مسجلة في هذه الفترة"
                    : "No expenses recorded for this period."}
                </td>
              </tr>
            ) : (
              expenses.map((e) => (
                <tr
                  key={e.id}
                  className="hover:bg-muted/30 transition-colors group cursor-pointer"
                  onClick={() => onEdit(e)}
                >
                  {/* Date */}
                  <td className="p-3 align-middle font-mono text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-foreground font-semibold">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>
                        {new Date(e.expense_date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </td>

                  {/* Category */}
                  <td className="p-3 align-middle font-medium">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                      <Receipt className="h-3 w-3 shrink-0" />
                      {e.category}
                    </span>
                  </td>

                  {/* Store / Vendor */}
                  <td className="p-3 align-middle text-foreground font-medium">
                    {e.store_name ? (
                      <div className="flex items-center gap-1.5 text-foreground">
                        <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>{e.store_name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>

                  {/* Description & Notes */}
                  <td className="p-3 align-middle text-muted-foreground">
                    <div className="flex flex-col gap-0.5 max-w-[240px]">
                      {e.description && (
                        <span className="font-semibold text-foreground truncate">
                          {e.description}
                        </span>
                      )}
                      {e.notes && (
                        <span className="text-[11px] truncate text-muted-foreground">
                          {e.notes}
                        </span>
                      )}
                      {!e.description && !e.notes && (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </div>
                  </td>

                  {/* Receipt Link */}
                  <td
                    className="p-3 align-middle text-center"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {e.receipt_url ? (
                      <a
                        href={e.receipt_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                        title={isAr ? "عرض الفاتورة" : "View Receipt"}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>{isAr ? "مرفق" : "Receipt"}</span>
                        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground/50 text-[10px]">—</span>
                    )}
                  </td>

                  {/* Amount */}
                  <td className="p-3 align-middle text-end font-mono font-extrabold text-sm text-foreground whitespace-nowrap">
                    {formatMoney(e.amount, e.currency || currency)}
                  </td>

                  {/* Actions */}
                  <td
                    className="p-3 align-middle text-end"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(e)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title={isAr ? "تعديل" : "Edit"}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(e.id)}
                        className="h-7 w-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title={isAr ? "حذف" : "Delete"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
