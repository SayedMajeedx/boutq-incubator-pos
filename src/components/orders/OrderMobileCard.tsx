import React from "react";
import { Link } from "@tanstack/react-router";
import { formatMoney } from "@/lib/format";
import { getOrderCustomerContact } from "@/lib/order-customer-snapshot";
import { UserX, Phone, ExternalLink } from "lucide-react";

interface OrderMobileCardProps {
  lang: "en" | "ar";
  slug: string;
  order: any;
  paymentBadge: { label: string; className: string } | null;
  fulfillmentBadge: { label: string; classes: string } | null;
  renderPrimaryAction: (order: any) => React.ReactNode;
}

export const OrderMobileCard: React.FC<OrderMobileCardProps> = ({
  lang,
  slug,
  order,
  paymentBadge,
  fulfillmentBadge,
  renderPrimaryAction,
}) => {
  const isAr = lang === "ar";
  const contact = getOrderCustomerContact(order);
  const customerName = contact.name;
  const customerPhone = contact.phone;
  const isGuest = !customerName;

  return (
    <div className="p-3.5 rounded-xl bg-card border border-border/60 shadow-2xs space-y-2.5">
      {/* Top Row: Invoice # + Amount */}
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/admin/b/$slug/orders/$id"
          params={{ slug, id: order.id }}
          className="font-mono text-xs font-bold text-primary hover:underline flex items-center gap-1"
        >
          #{order.invoice_number || order.id.slice(0, 8)}
          <ExternalLink className="h-3 w-3 opacity-60" />
        </Link>
        <span className="font-mono text-sm font-extrabold text-foreground">
          {formatMoney(
            order.total ?? order.total_amount ?? order.total_price ?? 0,
            order.currency || "BHD",
            lang,
          )}
        </span>
      </div>

      {/* Customer Info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 min-w-0">
          {isGuest ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground/80 bg-muted/50 px-2 py-0.5 rounded-md">
              <UserX className="h-3 w-3 text-muted-foreground" />
              {isAr ? "عميل زائر" : "Guest Customer"}
            </span>
          ) : (
            <span className="font-semibold text-foreground truncate max-w-[180px]">
              {customerName}
            </span>
          )}
        </div>
        {customerPhone && (
          <a
            href={`tel:${customerPhone}`}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline shrink-0 font-mono"
          >
            <Phone className="h-3 w-3" />
            {customerPhone}
          </a>
        )}
      </div>

      {/* Badges Row */}
      <div className="flex items-center gap-1.5 flex-wrap">
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

      {/* Primary Action Button Bar */}
      <div className="pt-1 flex items-center justify-end gap-2 border-t border-border/40">
        <div className="w-full sm:w-auto">{renderPrimaryAction(order)}</div>
      </div>
    </div>
  );
};
