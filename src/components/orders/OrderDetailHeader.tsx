import React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Printer, Copy, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";

interface OrderDetailHeaderProps {
  lang: "en" | "ar";
  slug: string;
  order: any;
  paymentBadge: { label: string; className: string } | null;
  fulfillmentBadge: { label: string; classes: string } | null;
  onCopyInvoiceLink: () => void;
  onPrintReceipt: () => void;
}

export const OrderDetailHeader: React.FC<OrderDetailHeaderProps> = ({
  lang,
  slug,
  order,
  paymentBadge,
  fulfillmentBadge,
  onCopyInvoiceLink,
  onPrintReceipt,
}) => {
  const isAr = lang === "ar";
  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-card border border-border/60 shadow-2xs">
      {/* Left Group: Back Button + Order ID + Badges */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 border-border/70 text-foreground shrink-0"
          asChild
        >
          <Link
            to="/admin/b/$slug/orders"
            params={{ slug }}
            aria-label={isAr ? "العودة للطلبات" : "Back to orders"}
          >
            <BackIcon className="h-4 w-4" />
          </Link>
        </Button>

        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display font-extrabold text-lg sm:text-xl text-foreground font-mono">
              #{order.invoice_number || order.id.slice(0, 8)}
            </h1>
            {paymentBadge && (
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${paymentBadge.className}`}
              >
                {paymentBadge.label}
              </span>
            )}
            {fulfillmentBadge && (
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${fulfillmentBadge.classes}`}
              >
                {fulfillmentBadge.label}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
            {formatDate(order.created_at, lang)}
          </p>
        </div>
      </div>

      {/* Right Group: Action Bar */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrintReceipt}
          className="h-9 gap-1.5 text-xs font-semibold"
        >
          <Printer className="h-3.5 w-3.5" />
          {isAr ? "طباعة الإيصال" : "Print Receipt"}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isAr ? "start" : "end"} className="w-48 text-xs">
            <DropdownMenuItem onClick={onCopyInvoiceLink}>
              <Copy className="h-3.5 w-3.5 me-2" />
              {isAr ? "نسخ رابط الفاتورة" : "Copy Public Invoice URL"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
