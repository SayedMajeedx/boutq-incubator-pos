import React from "react";
import { Link } from "@tanstack/react-router";
import { formatMoney, formatDate } from "@/lib/format";
import { getOrderCustomerContact } from "@/lib/order-customer-snapshot";
import {
  UserX,
  Phone,
  ExternalLink,
  MoreVertical,
  Copy,
  Printer,
  MessageSquare,
  AlertCircle,
  Truck,
  CreditCard,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OrdersWorkQueueProps {
  lang: "en" | "ar";
  slug: string;
  orders: any[];
  couriers?: any[];
  isLoading: boolean;
  isError: boolean;
  getPaymentBadge: (order: any) => { label: string; className: string } | null;
  getFulfillmentBadge: (order: any) => { label: string; classes: string } | null;
  renderPrimaryAction: (order: any) => React.ReactNode;
  onCopyInvoice: (orderId: string) => void;
  onPrintThermal: (order: any) => void;
  onWhatsAppCustomer: (order: any) => void;
  onWhatsAppCourier?: (order: any, courier: any) => void;
  onAssignCourier?: (orderId: string, courierId: string) => void;
  onQuickViewOrder: (order: any) => void;
}

export const OrdersWorkQueue: React.FC<OrdersWorkQueueProps> = ({
  lang,
  slug,
  orders,
  couriers = [],
  isLoading,
  isError,
  getPaymentBadge,
  getFulfillmentBadge,
  renderPrimaryAction,
  onCopyInvoice,
  onPrintThermal,
  onWhatsAppCustomer,
  onWhatsAppCourier,
  onAssignCourier,
  onQuickViewOrder,
}) => {
  const isAr = lang === "ar";

  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border/60">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
        <p>{isAr ? "جاري تحميل الطلبات..." : "Loading orders work queue..."}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center text-xs text-destructive bg-card rounded-xl border border-destructive/20">
        <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-80" />
        <p className="font-bold">{isAr ? "تعذر تحميل الطلبات" : "Failed to load orders"}</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border/60 space-y-2">
        <p className="font-bold text-sm text-foreground">
          {isAr ? "لا توجد طلبات مطابقة" : "No orders found"}
        </p>
        <p>
          {isAr
            ? "جرب تغيير كلمات البحث أو مسح عوامل التصفية"
            : "Try adjusting search or clearing active filters."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-2xs select-text">
      <div className="overflow-x-auto">
        <table className="w-full text-start text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
              <th className="p-3 text-start">{isAr ? "رقم الفاتورة والتاريخ" : "Order & Date"}</th>
              <th className="p-3 text-start">{isAr ? "العميل والتواصل" : "Customer / Contact"}</th>
              <th className="p-3 text-start">{isAr ? "طريقة وحالة الدفع" : "Payment & Type"}</th>
              <th className="p-3 text-start">
                {isAr ? "حالة التنفيذ والمندوب" : "Fulfillment & Courier"}
              </th>
              <th className="p-3 text-end">{isAr ? "الإجمالي" : "Total"}</th>
              <th className="p-3 text-center">{isAr ? "الإجراء التالي" : "Next Action"}</th>
              <th className="p-3 text-center w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {orders.map((order) => {
              const paymentBadge = getPaymentBadge(order);
              const fulfillmentBadge = getFulfillmentBadge(order);
              const contact = getOrderCustomerContact(order);
              const customerName = contact.name;
              const customerPhone = contact.phone;
              const isGuest = !customerName;

              const assignedCourier = couriers.find(
                (c) => c.id === order.assigned_to || c.user_id === order.assigned_to,
              );

              const paymentMethodLabel =
                order.payment_method === "benefit_pay" || order.payment_method === "benefit"
                  ? "💳 BenefitPay"
                  : order.payment_method === "cod" || order.is_cod
                    ? "💵 COD"
                    : order.payment_method === "tap" || order.payment_method === "card"
                      ? "💳 Card"
                      : order.payment_method
                        ? `💳 ${order.payment_method}`
                        : "💳 Online";

              return (
                <tr
                  key={order.id}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (
                      target.closest(
                        "button, a, select, [role='menuitem'], [data-radix-collection-item]",
                      )
                    )
                      return;
                    onQuickViewOrder(order);
                  }}
                  className="hover:bg-muted/80 [&:hover>td]:bg-muted/80 focus-within:bg-muted/80 transition-colors cursor-pointer group"
                  title={
                    isAr ? "انقر هنا لعرض معاينة الطلب السريعة" : "Click row to quick view order"
                  }
                >
                  {/* Order # & Date */}
                  <td className="p-3 align-middle font-medium">
                    <Link
                      to="/admin/b/$slug/orders/$id"
                      params={{ slug, id: order.id }}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono font-extrabold text-primary hover:underline inline-flex items-center gap-1"
                    >
                      #{order.invoice_number || order.id.slice(0, 8)}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {formatDate(order.created_at, lang)}
                    </div>
                  </td>

                  {/* Customer / PII Snapshot */}
                  <td className="p-3 align-middle">
                    {isGuest ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground/80 bg-muted/50 px-2 py-0.5 rounded-md">
                        <UserX className="h-3.5 w-3.5 text-muted-foreground" />
                        {isAr ? "عميل زائر" : "Guest Customer"}
                      </span>
                    ) : (
                      <div>
                        <div className="font-bold text-foreground truncate max-w-[180px]">
                          {customerName}
                        </div>
                        {customerPhone && (
                          <a
                            href={`tel:${customerPhone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-primary mt-0.5"
                          >
                            <Phone className="h-2.5 w-2.5" />
                            {customerPhone}
                          </a>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Payment Status & Type Badge */}
                  <td className="p-3 align-middle space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {paymentBadge && (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${paymentBadge.className}`}
                        >
                          {paymentBadge.label}
                        </span>
                      )}
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted/80 text-[10px] font-mono text-muted-foreground font-semibold border border-border/50">
                        {paymentMethodLabel}
                      </span>
                    </div>
                  </td>

                  {/* Fulfillment Status & Assigned Courier */}
                  <td className="p-3 align-middle space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {fulfillmentBadge && (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${fulfillmentBadge.classes}`}
                        >
                          {fulfillmentBadge.label}
                        </span>
                      )}
                    </div>

                    {/* Assigned Courier Badge / Quick Assign */}
                    <div
                      className="flex items-center gap-1 mt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {assignedCourier ? (
                        <div className="inline-flex items-center gap-1 text-[10px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                          <Truck className="h-3 w-3 shrink-0 text-indigo-500" />
                          <span className="truncate max-w-[110px]">
                            {assignedCourier.name || assignedCourier.email}
                          </span>
                          {onWhatsAppCourier && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onWhatsAppCourier(order, assignedCourier);
                              }}
                              className="ms-0.5 text-emerald-600 hover:text-emerald-700"
                              title={isAr ? "إشعار المندوب بالواتساب" : "WhatsApp Courier"}
                            >
                              <MessageSquare className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ) : onAssignCourier && couriers.length > 0 ? (
                        <Select
                          onValueChange={(val) => onAssignCourier(order.id, val)}
                          defaultValue=""
                        >
                          <SelectTrigger className="h-6 text-[10px] font-semibold w-28 bg-background/80 border-border/60">
                            <SelectValue
                              placeholder={isAr ? "+ تعيين مندوب" : "+ Assign Courier"}
                            />
                          </SelectTrigger>
                          <SelectContent align="start">
                            {couriers.map((c) => (
                              <SelectItem key={c.id} value={c.id} className="text-xs">
                                🛵 {c.name || c.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  </td>

                  {/* Total Amount */}
                  <td className="p-3 align-middle text-end font-mono font-extrabold text-foreground">
                    {formatMoney(
                      order.total ?? order.total_amount ?? order.total_price ?? 0,
                      order.currency || "BHD",
                      lang,
                    )}
                  </td>

                  {/* Primary Next Action */}
                  <td className="p-3 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                    {renderPrimaryAction(order)}
                  </td>

                  {/* Secondary Actions Menu */}
                  <td className="p-3 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          aria-label={isAr ? "خيارات الطلب" : "Order Options"}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={isAr ? "start" : "end"} className="w-48 text-xs">
                        <DropdownMenuItem onClick={() => onQuickViewOrder(order)}>
                          <Eye className="h-3.5 w-3.5 me-2 text-primary" />
                          {isAr ? "معاينة الطلب السريعة" : "Quick View Order"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onCopyInvoice(order.id)}>
                          <Copy className="h-3.5 w-3.5 me-2" />
                          {isAr ? "نسخ رابط الفاتورة" : "Copy Invoice Link"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onPrintThermal(order)}>
                          <Printer className="h-3.5 w-3.5 me-2" />
                          {isAr ? "طباعة إيصال الحراري" : "Print Receipt"}
                        </DropdownMenuItem>
                        {customerPhone && (
                          <DropdownMenuItem onClick={() => onWhatsAppCustomer(order)}>
                            <MessageSquare className="h-3.5 w-3.5 me-2 text-emerald-500" />
                            {isAr ? "واتساب العميل" : "WhatsApp Customer"}
                          </DropdownMenuItem>
                        )}
                        {assignedCourier && onWhatsAppCourier && (
                          <DropdownMenuItem
                            onClick={() => onWhatsAppCourier(order, assignedCourier)}
                          >
                            <Truck className="h-3.5 w-3.5 me-2 text-indigo-500" />
                            {isAr ? "واتساب المندوب" : "WhatsApp Courier"}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
