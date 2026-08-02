import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { formatMoney, formatDate } from "@/lib/format";
import { getOrderCustomerContact } from "@/lib/order-customer-snapshot";
import { OsStatusPill } from "@/components/os/os-status-pill";
import {
  ExternalLink,
  User,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Truck,
  Printer,
  Copy,
  MessageSquare,
  Package,
} from "lucide-react";

interface OrderQuickViewModalProps {
  lang: "ar" | "en";
  slug: string;
  order: any | null;
  couriers?: any[];
  onClose: () => void;
  onCopyInvoice: (orderId: string) => void;
  onPrintThermal: (order: any) => void;
  onWhatsAppCustomer: (order: any) => void;
  onWhatsAppCourier?: (order: any, courier: any) => void;
  onAssignCourier?: (orderId: string, courierId: string) => void;
}

export function OrderQuickViewModal({
  lang,
  slug,
  order,
  couriers = [],
  onClose,
  onCopyInvoice,
  onPrintThermal,
  onWhatsAppCustomer,
  onWhatsAppCourier,
  onAssignCourier,
}: OrderQuickViewModalProps) {
  if (!order) return null;

  const isAr = lang === "ar";
  const contact = getOrderCustomerContact(order);
  const items = order.order_items || [];
  const totalAmount = Number(order.total ?? order.total_amount ?? order.total_price ?? 0);
  const currency = order.currency || "BHD";

  const assignedCourier = couriers.find(
    (c) => c.id === order.assigned_to || c.user_id === order.assigned_to,
  );

  const paymentMethodLabel =
    order.payment_method === "benefit_pay" || order.payment_method === "benefit"
      ? isAr
        ? "بنفت باي (BenefitPay)"
        : "BenefitPay"
      : order.payment_method === "cod" || order.is_cod
        ? isAr
          ? "الدفع نقداً عند الاستلام (COD)"
          : "Cash on Delivery (COD)"
        : order.payment_method === "tap" || order.payment_method === "card"
          ? isAr
            ? "بطاقة ائتمان / Tap"
            : "Credit Card / Tap"
          : order.payment_method || (isAr ? "الدفع الإلكتروني" : "Online Payment");

  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto os-glass-card rounded-2xl p-6 border border-border/80 shadow-2xl">
        <DialogHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-xl font-mono font-extrabold text-primary flex items-center gap-2">
                #{order.invoice_number || order.id.slice(0, 8)}
              </DialogTitle>
              <OsStatusPill
                variant={
                  order.status === "completed" || order.status === "delivered"
                    ? "success"
                    : order.status === "confirmed"
                      ? "warning"
                      : "default"
                }
                dot
              >
                {order.status}
              </OsStatusPill>
            </div>

            <Link
              to="/admin/b/$slug/orders/$id"
              params={{ slug, id: order.id }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
            >
              <span>{isAr ? "فتح تفاصيل الطلب الكاملة" : "Open Full Order"}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {isAr ? "تاريخ الطلب: " : "Created: "}
            {formatDate(order.created_at, lang)}
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Customer & Address Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 font-bold text-foreground">
                <User className="h-4 w-4 text-primary shrink-0" />
                <span>{contact.name || (isAr ? "عميل زائر" : "Guest Customer")}</span>
              </div>
              {contact.phone && (
                <div className="flex items-center gap-2 text-muted-foreground font-mono">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <a href={`tel:${contact.phone}`} className="hover:text-primary">
                    {contact.phone}
                  </a>
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-2 text-muted-foreground font-mono">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>{contact.email}</span>
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 font-bold text-foreground">
                <MapPin className="h-4 w-4 text-amber-500 shrink-0" />
                <span>{isAr ? "عنوان التوصيل:" : "Delivery Address:"}</span>
              </div>
              <p className="text-muted-foreground leading-snug">
                {order.shipping_address ||
                  order.address ||
                  (isAr ? "استلام من الفرع / بدون عنوان" : "Pickup / No address")}
              </p>
            </div>
          </div>

          {/* Payment & Courier Metadata Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-1 text-xs">
              <div className="flex items-center gap-2 font-bold text-foreground">
                <CreditCard className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{isAr ? "طريقة وحالة الدفع:" : "Payment Method:"}</span>
              </div>
              <p className="font-semibold text-primary">{paymentMethodLabel}</p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {isAr ? "حالة الدفع: " : "Status: "}
                {order.payment_status || "pending"}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-1 text-xs">
              <div className="flex items-center gap-2 font-bold text-foreground">
                <Truck className="h-4 w-4 text-indigo-500 shrink-0" />
                <span>{isAr ? "مندوب التوصيل المعتمد:" : "Assigned Courier:"}</span>
              </div>
              {assignedCourier ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-foreground">
                    {assignedCourier.name || assignedCourier.email}
                  </span>
                  {onWhatsAppCourier && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="h-6 gap-1 text-[10px] text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                      onClick={() => onWhatsAppCourier(order, assignedCourier)}
                    >
                      <MessageSquare className="h-3 w-3" />
                      <span>{isAr ? "واتساب المندوب" : "WA Courier"}</span>
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground font-semibold">
                  {isAr ? "لم يتم تعيين مندوب بعد" : "Unassigned"}
                </p>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-foreground">
              <span className="flex items-center gap-1.5">
                <Package className="h-4 w-4 text-primary" />
                {isAr ? "المنتجات والأصناف المطلوب توصيلها:" : "Ordered Products:"}
              </span>
              <span className="font-mono font-extrabold text-sm text-primary">
                {formatMoney(totalAmount, currency, lang)}
              </span>
            </div>

            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <table className="w-full text-xs text-start">
                <thead className="bg-muted/50 border-b border-border/60 text-muted-foreground font-bold">
                  <tr>
                    <th className="p-2.5 text-start">{isAr ? "المنتج" : "Item"}</th>
                    <th className="p-2.5 text-center">{isAr ? "الكمية" : "Qty"}</th>
                    <th className="p-2.5 text-end">{isAr ? "السعر" : "Price"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-muted-foreground text-xs">
                        {isAr ? "لا توجد عناصر مسجلة في الفاتورة" : "No items logged in order"}
                      </td>
                    </tr>
                  ) : (
                    items.map((it: any, idx: number) => {
                      const itemTitle =
                        it.product_name ||
                        it.product_title ||
                        (isAr
                          ? it.product_name_ar || it.name_ar
                          : it.product_name_en || it.name_en) ||
                        it.item_title ||
                        it.title ||
                        it.name ||
                        it.products?.name ||
                        it.products?.name_ar ||
                        it.products?.name_en ||
                        (isAr ? "منتج" : "Product");

                      const variantTitle =
                        it.variant_title ||
                        it.variant_name ||
                        [it.size, it.color].filter(Boolean).join(" / ") ||
                        it.variants?.title ||
                        "";

                      const qty = it.quantity || it.qty || 1;
                      const unitPrice = Number(it.unit_price || it.price || 0);
                      const lineTotal = Number(
                        it.line_total || it.total_price || it.total || qty * unitPrice,
                      );

                      return (
                        <tr key={it.id || it.product_id || idx} className="hover:bg-muted/20">
                          <td className="p-2.5 font-semibold text-foreground">
                            <div>{itemTitle}</div>
                            {variantTitle && (
                              <span className="text-[10px] text-muted-foreground block font-mono">
                                {variantTitle}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-center font-bold">{qty}</td>
                          <td className="p-2.5 text-end font-mono font-bold">
                            {formatMoney(lineTotal, currency, lang)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed Financial Price Breakdown */}
          {(() => {
            const itemsSum = items.reduce((acc: number, it: any) => {
              const qty = it.quantity || it.qty || 1;
              const unitPrice = Number(it.unit_price || it.price || 0);
              const lineTotal = Number(it.line_total || it.total_price || qty * unitPrice);
              return acc + lineTotal;
            }, 0);

            const subtotal = Number(order.subtotal ?? (itemsSum > 0 ? itemsSum : totalAmount));
            const discount = Number(order.discount ?? order.discount_amount ?? 0);
            let shipping = Number(
              order.shipping ??
                order.shipping_amount ??
                order.delivery_fee ??
                order.shipping_fee ??
                0,
            );
            const tax = Number(order.tax_amount ?? order.vat ?? order.tax ?? 0);
            const advancePaid = Number(order.advance_paid ?? order.paid_amount ?? 0);
            const netTotal = Number(
              order.total ?? order.total_amount ?? subtotal + shipping + tax - discount,
            );

            const calculatedDiff = netTotal - (subtotal + tax - discount);
            if (shipping === 0 && calculatedDiff > 0) {
              shipping = calculatedDiff;
            }

            const codRemaining = Math.max(0, netTotal - advancePaid);

            return (
              <div className="rounded-xl border border-border/60 p-4 space-y-2 bg-card/80 text-xs shadow-2xs">
                <h4 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground border-b border-border/40 pb-2">
                  {isAr ? "تفاصيل الحساب المالي للفاتورة" : "Financial Price Breakdown"}
                </h4>

                <div className="space-y-1.5 font-mono text-muted-foreground">
                  <div className="flex justify-between items-center">
                    <span>{isAr ? "مجموع المنتجات (Subtotal):" : "Items Subtotal:"}</span>
                    <span className="font-bold text-foreground">
                      {formatMoney(subtotal, currency, lang)}
                    </span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                      <span>{isAr ? "الخصم المستقطع (Discount):" : "Discount Applied:"}</span>
                      <span className="font-bold">-{formatMoney(discount, currency, lang)}</span>
                    </div>
                  )}

                  {shipping > 0 && (
                    <div className="flex justify-between items-center text-indigo-600 dark:text-indigo-400">
                      <span>
                        {isAr ? "رسوم الشحن والتوصيل (Delivery Fee):" : "Shipping & Delivery Fee:"}
                      </span>
                      <span className="font-bold">+{formatMoney(shipping, currency, lang)}</span>
                    </div>
                  )}

                  {tax > 0 && (
                    <div className="flex justify-between items-center text-amber-600 dark:text-amber-400">
                      <span>{isAr ? "ضريبة القيمة المضافة (VAT):" : "VAT / Tax:"}</span>
                      <span className="font-bold">+{formatMoney(tax, currency, lang)}</span>
                    </div>
                  )}

                  {advancePaid > 0 && (
                    <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 pt-1 border-t border-border/40">
                      <span>
                        {isAr ? "الدفعة المقدمة (Deposit Paid):" : "Advance Paid / Deposit:"}
                      </span>
                      <span className="font-bold">-{formatMoney(advancePaid, currency, lang)}</span>
                    </div>
                  )}

                  {advancePaid > 0 && codRemaining > 0 && (
                    <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20">
                      <span>
                        {isAr
                          ? "المتبقي للتحصيل عند التسليم (COD Balance):"
                          : "Remaining COD Balance:"}
                      </span>
                      <span>{formatMoney(codRemaining, currency, lang)}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center text-sm font-extrabold pt-2 border-t border-border/60 text-foreground">
                  <span>{isAr ? "إجمالي الفاتورة النهائي:" : "Final Net Total:"}</span>
                  <span className="text-base text-primary font-mono font-extrabold">
                    {formatMoney(netTotal, currency, lang)}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Quick Action Footer Buttons */}
          <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => onCopyInvoice(order.id)}
              >
                <Copy className="h-3.5 w-3.5" />
                <span>{isAr ? "نسخ رابط الفاتورة" : "Copy Link"}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => onPrintThermal(order)}
              >
                <Printer className="h-3.5 w-3.5" />
                <span>{isAr ? "طباعة الإيصال" : "Print Receipt"}</span>
              </Button>
            </div>

            {contact.phone && (
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                onClick={() => onWhatsAppCustomer(order)}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>{isAr ? "مراسلة العميل بالواتساب" : "WhatsApp Customer"}</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
