import { ExternalLink, ReceiptText, Calendar, User, CreditCard } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { formatMoney, formatDate, formatOrderStatus } from "@/lib/format";
import { getOrderCustomerName } from "@/lib/order-customer-snapshot";
import { OsStatusPill } from "@/components/os/os-status-pill";

interface RecentOrder {
  id: string;
  invoice_number: number | string;
  created_at: string;
  currency: string;
  total: number;
  status: string;
  payment_status: string;
  customer_name_snapshot?: string | null;
  customer_email_snapshot?: string | null;
  customer_phone_snapshot?: string | null;
  customers?: { name: string } | null;
  payment_method?: string | null;
}

interface DashboardActivityQueueProps {
  lang: "ar" | "en";
  slug: string;
  orders: RecentOrder[];
  currency: string;
  locale: string;
}

export function DashboardActivityQueue({
  lang,
  slug,
  orders,
  currency,
  locale,
}: DashboardActivityQueueProps) {
  const isAr = lang === "ar";

  if (orders.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground border-dashed rounded-2xl">
        <ReceiptText className="h-8 w-8 mx-auto mb-2 opacity-50 text-muted-foreground" />
        <p className="text-xs font-semibold">
          {isAr ? "لا توجد طلبات حديثة مسجلة" : "No recent orders logged yet"}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Desktop Work Queue Table */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <table className="w-full text-start text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground font-bold uppercase tracking-wider">
              <th className="py-3 px-4 text-start">{isAr ? "رقم الفاتورة" : "Invoice #"}</th>
              <th className="py-3 px-4 text-start">{isAr ? "التاريخ والوقت" : "Date & Time"}</th>
              <th className="py-3 px-4 text-start">{isAr ? "العميل" : "Customer"}</th>
              <th className="py-3 px-4 text-start">{isAr ? "الحالة" : "Status"}</th>
              <th className="py-3 px-4 text-end">{isAr ? "الإجمالي" : "Total"}</th>
              <th className="py-3 px-4 text-center">{isAr ? "عرض" : "Action"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {orders.map((o) => {
              const custName = getOrderCustomerName(o) || (isAr ? "عميل جديد" : "Guest Customer");

              return (
                <tr
                  key={o.id}
                  className="transition-colors hover:bg-muted/20 text-foreground font-medium"
                >
                  <td className="py-3 px-4 font-mono font-bold text-primary">
                    #{o.invoice_number}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground font-mono">
                    {formatDate(o.created_at, locale)}
                  </td>
                  <td className="py-3 px-4 font-semibold text-foreground">{custName}</td>
                  <td className="py-3 px-4">
                    <OsStatusPill
                      variant={
                        o.status === "completed" || o.status === "delivered"
                          ? "success"
                          : o.status === "confirmed" || o.status === "needs_packing"
                            ? "warning"
                            : "default"
                      }
                      dot
                    >
                      {formatOrderStatus(o.status, null, lang)}
                    </OsStatusPill>
                  </td>
                  <td className="py-3 px-4 text-end font-bold tabular-nums text-foreground">
                    {formatMoney(Number(o.total || 0), o.currency || currency, locale)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Link
                      to="/admin/b/$slug/orders/$id"
                      params={{ slug, id: o.id }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                    >
                      <span>{isAr ? "تفاصيل" : "View"}</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Touch Cards (375px Viewport) */}
      <div className="grid grid-cols-1 gap-2.5 md:hidden">
        {orders.map((o) => {
          const custName = getOrderCustomerName(o) || (isAr ? "عميل جديد" : "Guest Customer");

          return (
            <Card
              key={o.id}
              className="p-3.5 border border-border/60 bg-card rounded-2xl space-y-2 shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-xs text-primary">
                  #{o.invoice_number}
                </span>
                <OsStatusPill
                  variant={
                    o.status === "completed" || o.status === "delivered"
                      ? "success"
                      : o.status === "confirmed" || o.status === "needs_packing"
                        ? "warning"
                        : "default"
                  }
                  dot
                >
                  {formatOrderStatus(o.status, null, lang)}
                </OsStatusPill>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground flex items-center gap-1">
                    <User className="h-3 w-3 text-muted-foreground" /> {custName}
                  </p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                    <Calendar className="h-2.5 w-2.5" /> {formatDate(o.created_at, locale)}
                  </p>
                </div>

                <div className="text-end">
                  <p className="font-bold text-sm tabular-nums text-foreground">
                    {formatMoney(Number(o.total || 0), o.currency || currency, locale)}
                  </p>
                  <Link
                    to="/admin/b/$slug/orders/$id"
                    params={{ slug, id: o.id }}
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold text-primary hover:underline mt-0.5"
                  >
                    <span>{isAr ? "عرض الطلب" : "View"}</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
