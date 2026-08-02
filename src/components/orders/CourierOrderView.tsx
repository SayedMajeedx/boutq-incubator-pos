import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { Truck, CheckCircle2 } from "lucide-react";
import { getOrderCustomerName, getOrderCustomerPhone } from "@/lib/order-customer-snapshot";
import { DeliveryAddressCard } from "@/components/delivery-address-card";

function normalizeWhatsAppNumber(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("973") ? digits : `973${digits.replace(/^0+/, "")}`;
}

function fillCourierMessage(template: string, order: any, brandName: string) {
  return template
    .replaceAll("{{customer_name}}", getOrderCustomerName(order) || "Customer")
    .replaceAll("{{invoice_number}}", String(order.invoice_number ?? ""))
    .replaceAll("{{brand_name}}", brandName)
    .replaceAll("{{total}}", formatMoney(Number(order.total ?? 0), order.currency || "BHD"))
    .replaceAll("{{customer_phone}}", getOrderCustomerPhone(order));
}

function resolvePaymentStatus(
  paymentStatus: string | null | undefined,
  status: string | null | undefined,
  total: number,
  advancePaid: number,
): "paid" | "partial" | "unpaid" {
  const ps = String(paymentStatus ?? "").toLowerCase();
  const st = String(status ?? "").toLowerCase();

  if (ps === "paid" || st === "paid" || (total > 0 && advancePaid >= total)) return "paid";
  if (ps === "partially_paid" || ps === "partial" || advancePaid > 0) return "partial";
  return "unpaid";
}

const PAYMENT_BADGE_CLASSES = {
  paid: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
  partial: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300",
  unpaid: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300",
} as const;

const PAYMENT_BADGE_LABEL = {
  paid: { ar: "مدفوع بالكامل", en: "Fully Paid" },
  partial: { ar: "مدفوع جزئياً", en: "Partially Paid" },
  unpaid: { ar: "غير مدفوع", en: "Unpaid / COD" },
} as const;

function getFulfillmentLabel(status: string | null | undefined, lang: "ar" | "en") {
  const s = String(status ?? "").toUpperCase();
  switch (s) {
    case "SHIPPED":
      return lang === "ar" ? "خرج للتوصيل" : "Out for Delivery";
    case "ASSIGNED":
      return lang === "ar" ? "مسند للمندوب" : "Assigned to Courier";
    case "COMPLETED":
    case "DELIVERED":
      return lang === "ar" ? "تم التسليم" : "Delivered";
    default:
      return lang === "ar" ? "في الانتظار" : "Pending";
  }
}

export default function CourierOrderView({
  order,
  slug,
  onUpdated,
}: {
  order: any;
  slug: string;
  onUpdated: () => void | Promise<void>;
}) {
  const { lang } = useI18n();
  const [notes, setNotes] = useState(order.delivery_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [codConfirmed, setCodConfirmed] = useState(Boolean(order.cod_collected_at));
  const advancePaid = Math.max(0, Number(order.advance_paid || 0));
  const orderTotal = Number(order.total || 0);
  const amountDue = Math.max(0, orderTotal - advancePaid);
  const [codAmount, setCodAmount] = useState(amountDue.toFixed(3));
  const isCod = ["cod", "cash_on_delivery"].includes(
    String(order.payment_method ?? "").toLowerCase(),
  );
  const ffUpper = String(order.fulfillment_status ?? "").toUpperCase();
  const stUpper = String(order.status ?? "").toUpperCase();
  const deliveryComplete =
    ["COMPLETED", "DELIVERED", "PICKED_UP"].includes(ffUpper) ||
    ["COMPLETED", "DELIVERED"].includes(stUpper);
  const currency = order.currency || "BHD";

  const isCodOrHasDue = isCod || amountDue > 0;

  const payStatus = resolvePaymentStatus(
    order.payment_status,
    order.status,
    orderTotal,
    advancePaid,
  );
  const messageQ = useQuery({
    queryKey: ["courier-delivery-message", order.id],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_courier_delivery_message", {
        p_order_id: order.id,
      });
      if (error) throw error;
      return data as { brand_name?: string; message_en?: string; message_ar?: string };
    },
    staleTime: 300000,
  });
  const updateStatus = async (status: string) => {
    const phone =
      status === "out_for_delivery" ? normalizeWhatsAppNumber(getOrderCustomerPhone(order)) : "";
    const whatsappWindow = phone ? window.open("about:blank", "_blank") : null;
    setSaving(true);
    try {
      const { error: rpcErr } = await (supabase.rpc as any)("courier_update_delivery", {
        p_order_id: order.id,
        p_status: status,
        p_notes: notes || null,
        p_cod_collected: status === "delivered" && isCodOrHasDue ? codConfirmed || true : false,
        p_cod_amount:
          status === "delivered" && isCodOrHasDue ? Number(codAmount) || amountDue : null,
      });

      if (status === "delivered") {
        const collectedAmt = isCodOrHasDue ? Number(codAmount) || amountDue : 0;
        const newPaid = Math.max(orderTotal, advancePaid + collectedAmt);
        const newPaymentStatus =
          newPaid >= orderTotal
            ? "paid"
            : newPaid > 0
              ? "partially_paid"
              : order.payment_status || "unpaid";

        const { error: directErr } = await supabase
          .from("orders")
          .update({
            fulfillment_status: "COMPLETED",
            status: "completed",
            payment_status: newPaymentStatus,
            advance_paid: newPaid,
            cod_collected_amount: collectedAmt,
            cod_collected_at: new Date().toISOString(),
            delivered_at: new Date().toISOString(),
            delivery_notes: notes || order.delivery_notes || null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", order.id);

        if (rpcErr && directErr) throw directErr;
      } else if (rpcErr) {
        const targetFulfillment = status === "out_for_delivery" ? "SHIPPED" : status;
        const { error: directErr } = await supabase
          .from("orders")
          .update({
            fulfillment_status: targetFulfillment,
            delivery_notes: notes || order.delivery_notes || null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", order.id);

        if (directErr) throw directErr;
      }

      toast.success(lang === "ar" ? "تم تحديث حالة التوصيل والتسليم" : "Delivery status updated");
      await onUpdated();
      if (status === "out_for_delivery") {
        if (phone) {
          const settings = messageQ.data;
          const fallback =
            lang === "ar"
              ? "مرحباً {{customer_name}}، طلبك رقم {{invoice_number}} من {{brand_name}} خرج الآن للتوصيل."
              : "Hi {{customer_name}}, your order #{{invoice_number}} from {{brand_name}} is now out for delivery.";
          const template = lang === "ar" ? settings?.message_ar : settings?.message_en;
          const message = fillCourierMessage(
            template || fallback,
            order,
            settings?.brand_name || "Boutq Store",
          );
          const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
          if (whatsappWindow) {
            whatsappWindow.opener = null;
            whatsappWindow.location.href = url;
          } else {
            window.location.href = url;
          }
        }
      }
    } catch (error: any) {
      whatsappWindow?.close();
      const message = String(error?.message ?? "");
      if (message.includes("COD_CONFIRMATION_REQUIRED")) {
        toast.error(
          lang === "ar" ? "أكد استلام المبلغ النقدي أولاً" : "Confirm the cash collection first",
        );
      } else if (message.includes("COD_AMOUNT_MISMATCH")) {
        toast.error(
          lang === "ar"
            ? "المبلغ المستلم لا يطابق المبلغ المطلوب"
            : "The received amount does not match the amount due",
        );
      } else {
        toast.error(
          message || (lang === "ar" ? "تعذر تحديث حالة التوصيل" : "Unable to update delivery"),
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const liveAddress = Array.isArray(order.shipping_address)
    ? order.shipping_address[0]
    : order.shipping_address;
  const selectedAddress = order.delivery_address_snapshot ?? liveAddress;
  const address =
    selectedAddress?.formatted_address ||
    selectedAddress?.address ||
    order.customers?.address ||
    null;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      <Link to="/admin/b/$slug/orders" params={{ slug }} className="text-sm text-muted-foreground">
        ← {lang === "ar" ? "الطلبات المسندة" : "Assigned orders"}
      </Link>
      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">
              {lang === "ar" ? "طلب التوصيل" : "Delivery order"}
            </p>
            <h1 className="text-2xl font-display">#{order.invoice_number}</h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold tracking-wide border",
                deliveryComplete
                  ? "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300",
              )}
            >
              {deliveryComplete
                ? lang === "ar"
                  ? "تم التوصيل"
                  : "Delivered"
                : getFulfillmentLabel(order.fulfillment_status, lang)}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold tracking-wide ${PAYMENT_BADGE_CLASSES[payStatus]}`}
            >
              {lang === "ar"
                ? PAYMENT_BADGE_LABEL[payStatus].ar
                : PAYMENT_BADGE_LABEL[payStatus].en}
            </span>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 rounded-xl border p-4 [&>div:nth-child(3)]:hidden">
          <div>
            <p className="text-xs text-muted-foreground">{lang === "ar" ? "العميل" : "Customer"}</p>
            <p className="font-semibold">{getOrderCustomerName(order) || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{lang === "ar" ? "الهاتف" : "Phone"}</p>
            <a
              dir="ltr"
              className="font-semibold underline"
              href={`tel:${getOrderCustomerPhone(order)}`}
            >
              {getOrderCustomerPhone(order) || "—"}
            </a>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">
              {lang === "ar" ? "عنوان التوصيل" : "Delivery address"}
            </p>
            <p className="font-medium">
              {address || selectedAddress?.address || order.customers?.address || "—"}
            </p>
          </div>
          {isCodOrHasDue && (
            <div
              className={`sm:col-span-2 rounded-lg p-3 ${order.cod_collected_at ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}
            >
              <strong>
                {order.cod_collected_at
                  ? lang === "ar"
                    ? "تم استلام المبلغ"
                    : "Cash received"
                  : lang === "ar"
                    ? "تحصيل عند التسليم"
                    : "Collect on delivery"}
              </strong>
              :{" "}
              {formatMoney(
                order.cod_collected_at ? Number(order.cod_collected_amount || 0) : amountDue,
                currency,
              )}
            </div>
          )}
        </div>
        <DeliveryAddressCard address={selectedAddress ?? order.customers} lang={lang} compact />

        <div className="rounded-xl border p-4 space-y-1">
          <p className="mb-2 text-sm font-semibold">
            {lang === "ar" ? "تفاصيل الطلب والسعر" : "Order & price breakdown"}
          </p>
          {(order.order_items ?? []).map((item: any) => (
            <div key={item.id} className="flex justify-between border-b py-2 text-sm gap-2">
              <span className="flex-1 min-w-0">
                <span className="block font-medium">{item.description}</span>
                <span className="text-xs text-muted-foreground">
                  {item.quantity} × {formatMoney(Number(item.unit_price || 0), currency)}
                </span>
              </span>
              <span className="font-semibold tabular-nums shrink-0">
                {formatMoney(
                  Number(item.line_total || item.unit_price * item.quantity || 0),
                  currency,
                )}
              </span>
            </div>
          ))}
          {Number(order.shipping || 0) > 0 && (
            <div className="flex justify-between py-2 text-sm">
              <span className="text-muted-foreground">
                {lang === "ar" ? "رسوم التوصيل" : "Delivery fee"}
              </span>
              <span className="tabular-nums">{formatMoney(Number(order.shipping), currency)}</span>
            </div>
          )}
          {Number(order.discount || 0) > 0 && (
            <div className="flex justify-between py-2 text-sm">
              <span className="text-muted-foreground">{lang === "ar" ? "الخصم" : "Discount"}</span>
              <span className="tabular-nums text-emerald-700">
                − {formatMoney(Number(order.discount), currency)}
              </span>
            </div>
          )}
          {Number(order.tax_rate || 0) > 0 && (
            <div className="flex justify-between py-1.5 text-xs text-muted-foreground">
              <span>
                {lang === "ar"
                  ? `ضريبة القيمة المضافة (${order.tax_rate}%)`
                  : `VAT (${order.tax_rate}%)`}
              </span>
              <span className="tabular-nums">
                {formatMoney(Number(order.tax_amount || 0), currency)}
              </span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t font-bold text-sm">
            <span>{lang === "ar" ? "الإجمالي" : "Total"}</span>
            <span className="tabular-nums">{formatMoney(orderTotal, currency)}</span>
          </div>
          {payStatus === "partial" && advancePaid > 0 && (
            <>
              <div className="flex justify-between text-sm text-blue-700">
                <span>{lang === "ar" ? "مبلغ مدفوع مسبقاً" : "Advance paid"}</span>
                <span className="tabular-nums">− {formatMoney(advancePaid, currency)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-amber-800 border-t pt-2">
                <span>{lang === "ar" ? "المبلغ المتبقي" : "Remaining due"}</span>
                <span className="tabular-nums">{formatMoney(amountDue, currency)}</span>
              </div>
            </>
          )}
          {payStatus === "paid" && (
            <div className="flex justify-between text-sm font-semibold text-emerald-700 border-t pt-2">
              <span>{lang === "ar" ? "الحالة" : "Status"}</span>
              <span>{lang === "ar" ? "✓ تم الدفع بالكامل" : "✓ Fully paid"}</span>
            </div>
          )}
        </div>

        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={lang === "ar" ? "ملاحظات التوصيل" : "Delivery notes"}
        />
        {isCodOrHasDue && !order.cod_collected_at && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div>
              <p className="font-semibold text-amber-950">
                {lang === "ar" ? "تأكيد استلام الدفع النقدي" : "Confirm cash collection"}
              </p>
              <p className="text-sm text-amber-800">
                {lang === "ar"
                  ? "لا يمكن إكمال التسليم قبل تأكيد المبلغ المستلم."
                  : "Delivery cannot be completed until the received amount is confirmed."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="cod-confirmed"
                type="checkbox"
                className="h-5 w-5"
                checked={codConfirmed}
                onChange={(e) => setCodConfirmed(e.target.checked)}
              />
              <Label htmlFor="cod-confirmed">
                {lang === "ar" ? "استلمت المبلغ بالكامل" : "I received the full amount"}
              </Label>
            </div>
            <div>
              <Label>{lang === "ar" ? "المبلغ المستلم (د.ب)" : "Amount received (BHD)"}</Label>
              <Input
                dir="ltr"
                inputMode="decimal"
                value={codAmount}
                onChange={(e) => setCodAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                onBlur={() => setCodAmount((Number(codAmount) || 0).toFixed(3))}
              />
            </div>
          </div>
        )}
        {deliveryComplete ? (
          <div className="rounded-xl border border-emerald-300/80 bg-emerald-50/80 dark:bg-emerald-950/40 p-4 text-center space-y-1 text-emerald-900 dark:text-emerald-200 shadow-xs">
            <p className="font-bold flex items-center justify-center gap-1.5 text-sm sm:text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              {lang === "ar" ? "تم توصيل هذا الطلب وإتمامه بنجاح" : "Order Delivered & Completed"}
            </p>
            <p className="text-xs text-muted-foreground">
              {order.delivered_at
                ? `${lang === "ar" ? "تاريخ التسليم: " : "Delivered at: "}${new Date(order.delivered_at).toLocaleString()}`
                : lang === "ar"
                  ? "الطلب مسجل كـ تم التوصيل في النظام"
                  : "Order is marked as delivered in system"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={saving}
              variant={order.fulfillment_status === "ASSIGNED" ? "default" : "outline"}
              className={
                order.fulfillment_status === "ASSIGNED"
                  ? "col-span-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 text-sm shadow-md"
                  : ""
              }
              onClick={() => updateStatus("out_for_delivery")}
            >
              <Truck className="h-4 w-4 me-1.5" />
              {order.fulfillment_status === "ASSIGNED"
                ? lang === "ar"
                  ? "استلام الشحنة من المحل (بدء التوصيل وإشعار الواتساب)"
                  : "Pick Up Parcel from Store (Start Transit)"
                : lang === "ar"
                  ? "خرج للتوصيل وإرسال واتساب"
                  : "Out for delivery & WhatsApp"}
            </Button>
            <Button
              disabled={saving || (isCodOrHasDue && !order.cod_collected_at && !codConfirmed)}
              onClick={() => updateStatus("delivered")}
            >
              {lang === "ar" ? "تم التسليم" : "Delivered"}
            </Button>
            <Button
              disabled={saving}
              variant="destructive"
              onClick={() => updateStatus("delivery_failed")}
            >
              {lang === "ar" ? "تعذر التسليم" : "Delivery failed"}
            </Button>
            <Button disabled={saving} variant="outline" onClick={() => updateStatus("returned")}>
              {lang === "ar" ? "مرتجع" : "Returned"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
