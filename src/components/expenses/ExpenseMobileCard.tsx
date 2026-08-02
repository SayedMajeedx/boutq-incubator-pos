import { Pencil, Trash2, Receipt, Store, Calendar, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";

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

interface ExpenseMobileCardProps {
  lang: "ar" | "en";
  expense: Expense;
  currency: string;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
}

export function ExpenseMobileCard({
  lang,
  expense: e,
  currency,
  onEdit,
  onDelete,
}: ExpenseMobileCardProps) {
  const isAr = lang === "ar";

  return (
    <Card
      className="p-3.5 border border-border/60 shadow-sm rounded-xl bg-card/60 backdrop-blur-sm space-y-2.5 transition-all duration-200 hover:border-primary/40 cursor-pointer"
      onClick={() => onEdit(e)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
          <Receipt className="h-3 w-3 shrink-0" />
          {e.category}
        </span>

        <span className="font-mono font-extrabold text-sm text-foreground">
          {formatMoney(e.amount, e.currency || currency)}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span>
            {new Date(e.expense_date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
            })}
          </span>
        </div>

        {e.store_name && (
          <div className="flex items-center gap-1 text-foreground font-medium">
            <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate max-w-[130px]">{e.store_name}</span>
          </div>
        )}
      </div>

      {e.description && (
        <p className="text-xs text-muted-foreground line-clamp-1">{e.description}</p>
      )}

      <div
        className="flex items-center justify-between pt-2 border-t border-border/40"
        onClick={(event) => event.stopPropagation()}
      >
        {e.receipt_url ? (
          <a
            href={e.receipt_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>{isAr ? "الفاتورة" : "Receipt"}</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(e)}
            className="h-9 px-3 text-xs font-medium text-muted-foreground hover:text-foreground gap-1.5 touch-manipulation"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>{isAr ? "تعديل" : "Edit"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(e.id)}
            className="h-9 px-3 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1.5 touch-manipulation"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{isAr ? "حذف" : "Delete"}</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}
