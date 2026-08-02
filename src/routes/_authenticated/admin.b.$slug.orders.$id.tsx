import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Copy,
  Printer,
  Save,
  Send,
  Search,
  Receipt,
  Link as LinkIcon,
  ScanLine,
  Mail,
  Loader2,
  Lock,
  Unlock,
  X,
  Tag,
  CheckCircle2,
  ImageIcon,
  Truck,
  UserPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  generateCourierWhatsAppUrl,
  formatNotifiedTimeAgo,
  recordCourierNotified,
} from "@/lib/courier-whatsapp";
import { CourierWhatsAppModal } from "@/components/courier/CourierWhatsAppModal";
import { formatDate, formatMoney, formatOrderStatus } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import {
  getOrderCustomerEmail,
  getOrderCustomerName,
  getOrderCustomerPhone,
} from "@/lib/order-customer-snapshot";
import {
  regionLabel,
  formatAddressLine,
  formatAddressDetailed,
  type StructuredAddress,
} from "@/lib/bahrain-regions";
import { printThermalReceipt } from "@/lib/thermal-print";
import { cn } from "@/lib/utils";
import {
  resolvePaymentStatus,
  PAYMENT_BADGE_CLASSES,
  PAYMENT_BADGE_LABEL,
  PAYMENT_BADGE_VALUES,
  type PaymentBadge,
} from "@/lib/payment-status";
import { logActivityBatch } from "@/lib/activity-log";
import { ActivityLogList } from "@/components/activity-log-list";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { PhoneInput } from "@/components/phone-input";
import { useBrand } from "@/lib/brand-context";
import { useProfile } from "@/lib/profile-context";
import { getBenefitReceiptViewUrl, rejectBenefitReceipt } from "@/lib/benefit-receipt.functions";
import { DeliveryAddressCard } from "@/components/delivery-address-card";
import { getOrderWorkflow } from "@/lib/order-workflow";
import {
  getFulfillmentLabel,
  getOrderStatusLabel,
  getFulfillmentMethodLabel,
  FULFILLMENT_STATUS_MAP,
} from "@/lib/status-labels";

function formatDeliveryAddress(
  c:
    | {
        region?: string | null;
        road?: string | null;
        house?: string | null;
        flat?: string | null;
        address?: string | null;
        city?: string | null;
      }
    | null
    | undefined,
  lang: "en" | "ar",
): string[] {
  if (!c) return [];
  const region = regionLabel(c.region, lang) || c.city || "";
  const road = c.road?.trim() || "";
  const house = c.house?.trim() || "";
  const flat = c.flat?.trim() || "";
  const parts =
    lang === "ar"
      ? [region, road, house, flat] // المنطقة، طريق، منزل، شقة
      : [flat, house, road, region]; // Flat, House, Road, Region
  const filtered = parts.filter((p) => p && p.length > 0);
  if (filtered.length === 0 && c.address) return c.address.split(/\r?\n/).filter(Boolean);
  const sep = lang === "ar" ? "، " : ", ";
  return filtered.length ? [filtered.join(sep)] : [];
}

type SavedAddress = {
  id: string;
  customer_id: string;
  label: string | null;
  region: string | null;
  block: string | null;
  road: string | null;
  house: string | null;
  flat: string | null;
  floor: string | null;
  landmark: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  delivery_notes: string | null;
  is_default: boolean;
};

export const Route = createFileRoute("/_authenticated/admin/b/$slug/orders/$id")({
  component: OrderDetail,
  errorComponent: OrderErrorBoundary,
  notFoundComponent: () => <OrderErrorBoundary />,
});

function OrderErrorBoundary({ error }: { error?: Error }) {
  const { slug } = Route.useParams();
  return (
    <div className="p-8 max-w-lg mx-auto">
      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-8 text-center space-y-3">
        <h2 className="text-xl font-display">Order</h2>
        <p className="text-muted-foreground">
          {error?.message || "This order could not be loaded. It may have been deleted."}
        </p>
        <Link to="/admin/b/$slug/orders" params={{ slug }} className="text-primary underline">
          ← Back to orders
        </Link>
      </Card>
    </div>
  );
}

type Order = any;
type Item = {
  id?: string;
  product_id?: string | null;
  variant_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  original_price?: number | null;
  customizations: { name: string; price_delta: number }[];
  customization_total: number;
  line_total: number;
  location: "main" | "incubator";
  selected_variant?: { size?: string | null; color?: string | null; fabric?: string | null } | null;
  custom_field_values?: Array<{
    key: string;
    label_ar: string | null;
    label_en: string | null;
    value: string;
  }>;
};

function BhdFeeInput({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [display, setDisplay] = useState(Number(value || 0).toFixed(3));
  useEffect(() => setDisplay(Number(value || 0).toFixed(3)), [value]);
  const commit = () => {
    const parsed = Math.max(0, Number(display) || 0);
    setDisplay(parsed.toFixed(3));
    onChange(parsed);
  };
  return (
    <Input
      inputMode="decimal"
      value={display}
      disabled={disabled}
      onChange={(event) => setDisplay(event.target.value.replace(/[^0-9.]/g, ""))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}

function normalizeCustomFieldValues(value: unknown): Item["custom_field_values"] {
  if (Array.isArray(value)) return value as Item["custom_field_values"];
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, fieldValue]) => ({
      key,
      label_ar: null,
      label_en: key,
      value: String(fieldValue ?? ""),
    }));
  }
  return [];
}

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

function CourierOrderView({
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
    // Open synchronously from the click gesture so Safari/iOS and other mobile
    // browsers do not treat the WhatsApp handoff as a blocked popup.
    const whatsappWindow = phone ? window.open("about:blank", "_blank") : null;
    setSaving(true);
    try {
      // 1. Try RPC update
      const { error: rpcErr } = await (supabase.rpc as any)("courier_update_delivery", {
        p_order_id: order.id,
        p_status: status,
        p_notes: notes || null,
        p_cod_collected: status === "delivered" && isCodOrHasDue ? codConfirmed || true : false,
        p_cod_amount:
          status === "delivered" && isCodOrHasDue ? Number(codAmount) || amountDue : null,
      });

      // 2. Always ensure fulfillment_status and payment_status align with system standards
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
  // The delivery destination belongs to the order, not necessarily to the
  // customer's legacy profile fields. A shopper can choose any saved address
  // at checkout, so couriers must always see the address referenced by the
  // order's shipping_address_id.
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
            {/* Payment status badge */}
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

        {/* Price breakdown */}
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
          {/* Partial payment detail */}
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
                : (lang === "ar" ? "الطلب مسجل كـ تم التوصيل في النظام" : "Order is marked as delivered in system")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={saving}
              variant={order.fulfillment_status === "ASSIGNED" ? "default" : "outline"}
              className={order.fulfillment_status === "ASSIGNED" ? "col-span-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 text-sm shadow-md" : ""}
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
              disabled={
                saving ||
                (isCodOrHasDue && !order.cod_collected_at && !codConfirmed)
              }
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
            <Button
              disabled={saving}
              variant="outline"
              onClick={() => updateStatus("returned")}
            >
              {lang === "ar" ? "مرتجع" : "Returned"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function OrderDetail() {
  const t = useT();
  const { lang } = useI18n();
  const { id, slug } = Route.useParams();
  const qc = useQueryClient();
  const brand = useBrand();
  const { isAdmin, isCourier } = useProfile();
  const brandId = brand.id;
  const [approvingBenefit, setApprovingBenefit] = useState(false);
  const [rejectingBenefit, setRejectingBenefit] = useState(false);
  const [rejectReasonOpen, setRejectReasonOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const orderQ = useQuery({
    queryKey: ["order", id, isCourier ? "assigned-courier" : "office"],
    // A courier can be working from a phone with an intermittent realtime
    // socket. Keep both courier and office views synchronized regardless.
    refetchInterval: isCourier ? 10_000 : 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(
          "*, customers(*), order_items(*), shipping_address:customer_addresses!orders_shipping_address_id_fkey(*)",
        )
        .eq("id", id);
      if (isCourier) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        query = (query as any).eq("assigned_to", user.id).eq("fulfillment_method", "delivery");
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Order not found. It may have been deleted.");
      return data as Order;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`order-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["order", id] });
          void qc.invalidateQueries({ queryKey: ["orders"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs", filter: `order_id=eq.${id}` },
        () => void qc.invalidateQueries({ queryKey: ["activity_logs"] }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, qc]);

  const productsQ = useQuery({
    queryKey: ["products", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (await supabase.from("products").select("*").eq("brand_id", brandId)).data ?? [],
  });
  const variantsQ = useQuery({
    queryKey: ["variants", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (await supabase.from("product_variants").select("*").eq("brand_id", brandId)).data ?? [],
  });
  const customersQ = useQuery({
    queryKey: ["customers", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (await supabase.from("customers").select("*").eq("brand_id", brandId).order("name")).data ??
      [],
  });
  const couriersQ = useQuery({
    queryKey: ["couriers", brandId],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase.from("profiles") as any)
        .select("id, name, email, phone")
        .eq("brand_id", brandId)
        .eq("role", "courier")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
  const [waModalOpen, setWaModalOpen] = useState(false);

  const assignCourier = async (courierId: string) => {
    const { error } = await (supabase.rpc as any)("assign_order_courier", {
      p_order_id: id,
      p_courier_id: courierId === "unassigned" ? null : courierId,
    });
    if (error) return toast.error(error.message);
    toast.success(lang === "ar" ? "تم تحديث مندوب التوصيل" : "Courier assignment updated");
    await orderQ.refetch();

    if (courierId !== "unassigned") {
      setWaModalOpen(true);
    }
  };
  const addressesQ = useQuery({
    queryKey: ["customer_addresses", brandId],
    enabled: !isCourier,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("brand_id", brandId);
      if (error) throw error;
      return (data ?? []) as SavedAddress[];
    },
  });

  const receiptViewQ = useQuery({
    queryKey: ["benefit-receipt-view", id, orderQ.data?.benefit_receipt_key],
    enabled:
      !isCourier &&
      Boolean(orderQ.data?.payment_method === "benefit" && orderQ.data?.benefit_receipt_key),
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
    queryFn: async () => getBenefitReceiptViewUrl({ data: { orderId: id } }),
    retry: false,
  });

  const approveBenefitPayment = async () => {
    setApprovingBenefit(true);
    try {
      const { error } = await supabase.rpc("approve_benefit_payment" as any, { p_order_id: id });
      if (error) throw error;

      await orderQ.refetch();
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success(
        lang === "ar" ? "تم التحقق من الدفع واعتماده" : "Payment verified and approved",
      );
    } catch (error: any) {
      toast.error(
        error?.message ?? (lang === "ar" ? "تعذر اعتماد الدفع" : "Could not approve payment"),
      );
    } finally {
      setApprovingBenefit(false);
    }
  };

  const rejectBenefitPayment = async () => {
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      toast.error(
        lang === "ar"
          ? "يرجى إدخال سبب الرفض ليظهر للعميل"
          : "Enter a rejection reason for the customer",
      );
      return;
    }
    setRejectingBenefit(true);
    try {
      await rejectBenefitReceipt({ data: { orderId: id, reason } });
      toast.success(
        lang === "ar" ? "تم رفض الإيصال وحذف الصورة" : "Receipt rejected and image deleted",
      );
      await orderQ.refetch();
      qc.removeQueries({ queryKey: ["benefit-receipt-view", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      setRejectReasonOpen(false);
      setRejectReason("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "ar"
            ? "تعذر رفض الإيصال"
            : "Unable to reject receipt",
      );
    } finally {
      setRejectingBenefit(false);
    }
  };
  const branchesQ = useQuery({
    queryKey: ["branches", brandId],
    enabled: !isCourier,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name_ar, name_en, location_ar, location_en")
        .eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const customQ = useQuery({
    queryKey: ["customizations", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (
        await supabase
          .from("customization_options")
          .select("*")
          .eq("brand_id", brandId)
          .order("name")
      ).data ?? [],
  });
  const settingsQ = useQuery({
    queryKey: ["business-settings", brandId],
    enabled: !isCourier,
    queryFn: async () => {
      const { data } = await supabase
        .from("business_settings")
        .select("*")
        .eq("brand_id", brandId)
        .maybeSingle();
      return data;
    },
  });

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [editingUnlocked, setEditingUnlocked] = useState(false);
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adminOverrideChecked, setAdminOverrideChecked] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [activeSection, setActiveSection] = useState<string>("sec-overview");

  useEffect(() => {
    if (!order?.id) return;
    const sectionIds = ["sec-overview", "sec-items", "sec-invoice", "sec-activity"];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-80px 0px -50% 0px", threshold: 0.1 },
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [order?.id]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const initialSnapshotRef = useRef<{ order: any; items: Item[] } | null>(null);

  const isDirty = useMemo(() => {
    if (!initialSnapshotRef.current || !order) return false;
    const snap = initialSnapshotRef.current;

    const currentOrderMin = {
      notes: order.notes ?? "",
      delivery_notes: order.delivery_notes ?? "",
      customer_id: order.customer_id ?? null,
      shipping_address_id: order.shipping_address_id ?? null,
      payment_status: order.payment_status,
      fulfillment_status: order.fulfillment_status,
      status: order.status,
      payment_method: order.payment_method ?? null,
      discount: Number(order.discount ?? 0),
      shipping: Number(order.shipping ?? 0),
      tax_rate: Number(order.tax_rate ?? 0),
      advance_paid: Number(order.advance_paid ?? 0),
      order_date: order.order_date,
    };

    const orderChanged = JSON.stringify(currentOrderMin) !== JSON.stringify(snap.order);

    const simplifyItem = (it: Item) => ({
      id: it.id,
      product_id: it.product_id,
      variant_id: it.variant_id,
      quantity: it.quantity,
      unit_price: Number(it.unit_price),
      line_total: Number(it.line_total),
      customizations: it.customizations ?? [],
    });

    const itemsChanged =
      JSON.stringify(items.map(simplifyItem)) !== JSON.stringify(snap.items.map(simplifyItem));

    return orderChanged || itemsChanged;
  }, [items, order]);

  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    id: string;
    amount: number;
  } | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [discountMode, setDiscountMode] = useState<"fixed" | "percent">("fixed");
  const [discountPercentInput, setDiscountPercentInput] = useState<string>("");
  const [lastNonZeroTaxRate, setLastNonZeroTaxRate] = useState<number>(10);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustRegion, setNewCustRegion] = useState("");
  const [newCustBlock, setNewCustBlock] = useState("");
  const [newCustRoad, setNewCustRoad] = useState("");
  const [newCustHouse, setNewCustHouse] = useState("");
  const [newCustFlat, setNewCustFlat] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const promoContextRef = useRef<string | null>(null);

  const handleCreateInlineCustomer = async () => {
    if (!newCustName.trim()) {
      return toast.error(lang === "ar" ? "أدخل اسم العميل" : "Customer name is required");
    }
    setCreatingCustomer(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const brandId = (settingsQ.data as any)?.brand_id || (brand as any)?.id;

      // 1. Insert customer
      const { data: cust, error: custErr } = await (supabase.from("customers") as any)
        .insert({
          user_id: user.id,
          brand_id: brandId,
          name: newCustName.trim(),
          phone: newCustPhone.trim() || null,
          email: newCustEmail.trim().toLowerCase() || null,
          region: newCustRegion.trim() || null,
          block: newCustBlock.trim() || null,
          road: newCustRoad.trim() || null,
          house: newCustHouse.trim() || null,
          flat: newCustFlat.trim() || null,
        })
        .select()
        .single();

      if (custErr) throw custErr;

      // 2. Insert default address if address details provided
      let addressId: string | null = null;
      if (newCustRegion || newCustBlock || newCustRoad || newCustHouse) {
        const { data: addr, error: addrErr } = await (supabase.from("customer_addresses") as any)
          .insert({
            user_id: user.id,
            brand_id: brandId,
            customer_id: cust.id,
            label: "Home",
            region: newCustRegion.trim() || null,
            block: newCustBlock.trim() || null,
            road: newCustRoad.trim() || null,
            house: newCustHouse.trim() || null,
            flat: newCustFlat.trim() || null,
            is_default: true,
          })
          .select()
          .single();

        if (!addrErr && addr) {
          addressId = addr.id;
        }
      }

      toast.success(
        lang === "ar"
          ? `تم إضافة العميل "${cust.name}" بنجاح!`
          : `Customer "${cust.name}" created successfully!`,
      );

      // Auto-assign to current order!
      setOrder({
        ...order,
        customer_id: cust.id,
        shipping_address_id: addressId,
      });

      // Refetch queries
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer_addresses"] });

      // Reset form & close modal
      setNewCustName("");
      setNewCustPhone("");
      setNewCustEmail("");
      setNewCustRegion("");
      setNewCustBlock("");
      setNewCustRoad("");
      setNewCustHouse("");
      setNewCustFlat("");
      setNewCustomerOpen(false);
    } catch (err: any) {
      toast.error(err.message || (lang === "ar" ? "تعذر إنشاء العميل" : "Failed to create customer"));
    } finally {
      setCreatingCustomer(false);
    }
  };

  const filteredVariantsForSearch = useMemo(() => {
    if (!productSearchQuery.trim()) return (variantsQ.data ?? []).slice(0, 25);
    const tokens = productSearchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const products = productsQ.data ?? [];
    return (variantsQ.data ?? [])
      .filter((v: any) => {
        const p = products.find((x: any) => x.id === v.product_id);
        const title = String((p as any)?.name ?? "").toLowerCase();
        const titleAr = String((p as any)?.name_ar ?? "").toLowerCase();
        const titleEn = String((p as any)?.name_en ?? "").toLowerCase();
        const sku = String(v.sku ?? (p as any)?.sku ?? "").toLowerCase();
        const barcode = String(v.barcode ?? "").toLowerCase();
        const size = String(v.size ?? "").toLowerCase();
        const color = String(v.color ?? "").toLowerCase();
        const fabric = String(v.fabric ?? "").toLowerCase();

        const fullSearchableBlob = `${title} ${titleAr} ${titleEn} ${sku} ${barcode} ${size} ${color} ${fabric}`;
        return tokens.every((token) => fullSearchableBlob.includes(token));
      })
      .slice(0, 35);
  }, [productSearchQuery, variantsQ.data, productsQ.data]);

  const handleSelectVariantFromModal = (variant: any) => {
    const p = (productsQ.data ?? []).find((x: any) => x.id === variant.product_id);
    const isAr = lang === "ar";
    const sizeLabel = isAr ? "المقاس" : "Size";
    const colorLabel = isAr ? "اللون" : "Color";
    const variantTitle = [p ? (p as any).name : "", variant.size ? `${sizeLabel}: ${variant.size}` : "", variant.color ? `${colorLabel}: ${variant.color}` : ""].filter(Boolean).join(" — ");
    const price = Number(
      variant.selling_price ??
        variant.price_override ??
        variant.price ??
        (p as any)?.selling_price ??
        (p as any)?.base_price ??
        (p as any)?.price ??
        0,
    );
    const preferredLoc: "main" | "incubator" =
      (variant.stock_main ?? 0) > 0 ? "main" : "incubator";

    setItems((prev) => [
      ...prev,
      {
        product_id: variant.product_id,
        variant_id: variant.id,
        description: variantTitle || "Custom Item",
        quantity: 1,
        unit_price: price,
        original_price: price,
        customizations: [],
        customization_total: 0,
        line_total: price,
        location: preferredLoc,
        selected_variant: variant,
      },
    ]);
    toast.success(
      isAr ? `تمت إضافة "${variantTitle}" إلى الطلب!` : `Added "${variantTitle}" to order!`,
    );
    setProductSearchOpen(false);
    setProductSearchQuery("");
  };

  const serverOrder = orderQ.data as any;
  const isBlankDraft =
    id === "new" ||
    (serverOrder?.status === "draft" &&
      !serverOrder?.customer_id &&
      !serverOrder?.payment_method &&
      (serverOrder?.order_items?.length ?? 0) === 0);

  useEffect(() => {
    if (orderQ.data) {
      // Prevent background query revalidations from overwriting unsaved local edits
      if (initialSnapshotRef.current && isDirty) return;

      setOrder(orderQ.data);
      const loadedItems = (orderQ.data.order_items ?? []).map((i: any) => ({
        id: i.id,
        product_id: i.product_id,
        variant_id: i.variant_id,
        description: i.description,
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
        original_price: i.original_price == null ? null : Number(i.original_price),
        customizations: i.customizations ?? [],
        customization_total: Number(i.customization_total),
        line_total: Number(i.line_total),
        location: (i.location === "incubator" ? "incubator" : "main") as "main" | "incubator",
        selected_variant: i.selected_variant ?? null,
        custom_field_values: normalizeCustomFieldValues(i.custom_field_values),
      }));

      // Check localStorage for uncommitted draft backup
      const cacheKey = `boutq_draft_${brandId}_${id}`;
      try {
        const cachedStr = localStorage.getItem(cacheKey);
        if (cachedStr && (id === "new" || isBlankDraft)) {
          const cached = JSON.parse(cachedStr);
          if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
            setItems(cached.items);
            if (cached.order) setOrder((prev: any) => ({ ...prev, ...cached.order }));
            toast.info(
              lang === "ar"
                ? "تم استعادة مسودتك الأخيرة تلقائياً!"
                : "Restored your unsaved draft!",
            );
            return;
          }
        }
      } catch (e) {
        // ignore cache read errors
      }

      setItems(loadedItems);

      initialSnapshotRef.current = {
        order: {
          notes: orderQ.data.notes ?? "",
          delivery_notes: orderQ.data.delivery_notes ?? "",
          customer_id: orderQ.data.customer_id ?? null,
          shipping_address_id: orderQ.data.shipping_address_id ?? null,
          payment_status: orderQ.data.payment_status,
          fulfillment_status: orderQ.data.fulfillment_status,
          status: orderQ.data.status,
          payment_method: orderQ.data.payment_method ?? null,
          discount: Number(orderQ.data.discount ?? 0),
          shipping: Number(orderQ.data.shipping ?? 0),
          tax_rate: Number(orderQ.data.tax_rate ?? 0),
          advance_paid: Number(orderQ.data.advance_paid ?? 0),
          order_date: orderQ.data.order_date,
        },
        items: loadedItems,
      };

      promoContextRef.current = JSON.stringify({
        customer: (orderQ.data as any).customer_id ?? null,
        items: loadedItems.map((item: Item) => [
          item.variant_id ?? null,
          item.quantity,
          Number(item.line_total).toFixed(3),
        ]),
      });
      setEditingUnlocked(false);
      const savedPromo = (orderQ.data as any).promo_code;
      setPromoInput(savedPromo ?? "");
      setAppliedPromo(
        savedPromo
          ? {
              code: savedPromo,
              id: (orderQ.data as any).promo_code_id ?? "",
              amount: Number((orderQ.data as any).discount ?? 0),
            }
          : null,
      );
    }
  }, [orderQ.data]);

  useEffect(() => {
    setHasSavedDraft(false);
  }, [id]);

  // Auto-save unsaved draft state to localStorage
  useEffect(() => {
    if (id === "new" || isBlankDraft) {
      const cacheKey = `boutq_draft_${brandId}_${id}`;
      if (items.length > 0 || order?.customer_id) {
        localStorage.setItem(cacheKey, JSON.stringify({ order, items, updatedAt: Date.now() }));
      }
    }
  }, [items, order, brandId, id, isBlankDraft]);

  // Backfill the tenant's flat delivery fee for untouched draft orders that
  // were created before the list-page initializer loaded the setting.
  useEffect(() => {
    if (
      !order ||
      !settingsQ.data ||
      order.fulfillment_method !== "delivery" ||
      Number(order.shipping ?? 0) !== 0
    )
      return;
    const source = orderQ.data as any;
    const untouchedDraft =
      source?.status === "draft" &&
      !source?.customer_id &&
      !source?.payment_method &&
      (source?.order_items?.length ?? 0) === 0;
    const configuredFee = Number((settingsQ.data as any).delivery_fee ?? 0);
    if (untouchedDraft && configuredFee > 0)
      setOrder((current: any) => (current ? { ...current, shipping: configuredFee } : current));
  }, [order?.id, order?.fulfillment_method, order?.shipping, orderQ.data, settingsQ.data]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, i) => s + i.line_total, 0);
    const discount = Number(order?.discount ?? 0);
    const shipping = Number(order?.shipping ?? 0);
    const taxable = Math.max(0, subtotal - discount);
    const isInclusive = Boolean((settingsQ.data as any)?.vat_inclusive);
    const taxRate = Number(order?.tax_rate ?? 0);
    let taxAmount = 0;
    let total = 0;
    if (isInclusive) {
      taxAmount = taxable - taxable / (1 + taxRate / 100);
      total = taxable + shipping;
    } else {
      taxAmount = (taxable * taxRate) / 100;
      total = taxable + taxAmount + shipping;
    }
    const advancePaid = Math.max(0, Number(order?.advance_paid ?? 0));
    const remaining = Math.max(0, total - advancePaid);
    return { subtotal, discount, shipping, taxAmount, total, advancePaid, remaining };
  }, [
    items,
    order?.discount,
    order?.shipping,
    order?.tax_rate,
    order?.advance_paid,
    settingsQ.data,
  ]);

  useEffect(() => {
    const signature = JSON.stringify({
      customer: order?.customer_id ?? null,
      items: items.map((item) => [
        item.variant_id ?? null,
        item.quantity,
        Number(item.line_total).toFixed(3),
      ]),
    });
    if (promoContextRef.current === null) {
      promoContextRef.current = signature;
      return;
    }
    if (promoContextRef.current !== signature) {
      promoContextRef.current = signature;
      if (appliedPromo) {
        setAppliedPromo(null);
        setPromoInput("");
        setOrder((current: any) =>
          current ? { ...current, discount: 0, promo_code: null, promo_code_id: null } : current,
        );
        toast.info(
          lang === "ar"
            ? "تمت إزالة رمز الخصم بعد تغيير العميل أو المنتجات."
            : "Promo code removed after the customer or items changed.",
        );
      }
    }
  }, [items, order?.customer_id, appliedPromo, lang]);

  const promoFailureMessage = (result: any) => {
    switch (result?.reason) {
      case "FIRST_ORDER_ONLY":
        return lang === "ar"
          ? "رمز الخصم هذا مخصص للعملاء الجدد فقط."
          : "This promo code is restricted to first-time customers only.";
      case "MINIMUM_NOT_MET":
        return lang === "ar"
          ? `يتطلب رمز الخصم هذا حداً أدنى للشراء بقيمة ${formatMoney(Number(result.minimum_order_amount), "BHD")}.`
          : `This promo code requires a minimum purchase value of ${formatMoney(Number(result.minimum_order_amount), "BHD")}.`;
      case "NO_ELIGIBLE_ITEMS":
        return lang === "ar"
          ? "لا يمكن تطبيق رمز الخصم هذا على المنتجات المخفضة مسبقاً."
          : "This promo code cannot be applied to items already on discount/sale.";
      case "CODE_INACTIVE":
        return lang === "ar"
          ? "رمز الخصم هذا لم يعد نشطاً."
          : "This promotional code is no longer active.";
      case "USAGE_LIMIT_REACHED":
        return lang === "ar"
          ? "وصل هذا العميل إلى الحد المسموح لاستخدام الرمز."
          : "This customer has reached the usage limit for this promo code.";
      case "CUSTOMER_REQUIRED":
        return lang === "ar"
          ? "اختر عميلاً قبل تطبيق رمز الخصم."
          : "Select a customer before applying this promo code.";
      case "CODE_NOT_FOUND":
        return lang === "ar"
          ? "رمز الخصم غير موجود لهذا المتجر."
          : "This promo code does not exist for this brand.";
      default:
        return lang === "ar"
          ? "تعذر تطبيق رمز الخصم. تحقق من شروط الرمز."
          : "This promo code could not be applied. Check its eligibility rules.";
    }
  };

  const applyAdminPromo = async () => {
    if (!order) return;
    const code = promoInput.trim().toUpperCase();
    if (!code) return toast.error(lang === "ar" ? "أدخل رمز الخصم." : "Enter a promo code.");
    if (!items.length || totals.subtotal <= 0)
      return toast.error(
        lang === "ar" ? "أضف منتجات إلى الطلب أولاً." : "Add products to the order first.",
      );
    setCheckingPromo(true);
    const { data, error } = await supabase.rpc("validate_promo_code" as any, {
      p_brand_slug: brand.slug,
      p_code: code,
      p_subtotal: totals.subtotal,
      p_items: items.map((item) => ({
        variant_id: item.variant_id,
        line_total: Number(item.line_total.toFixed(3)),
      })),
      p_customer_id: order.customer_id ?? null,
    });
    setCheckingPromo(false);
    if (error)
      return toast.error(
        error.message ||
          (lang === "ar" ? "تعذر التحقق من الرمز." : "Could not validate this promo code."),
      );
    const result = data as any;
    if (!result?.valid) return toast.error(promoFailureMessage(result));
    const amount = Number(result.discount_amount ?? 0);
    const active = { code: String(result.code), id: String(result.promo_code_id), amount };
    setPromoInput(active.code);
    setAppliedPromo(active);
    setOrder({ ...order, discount: amount, promo_code: active.code, promo_code_id: active.id });
    toast.success(lang === "ar" ? "تم تطبيق رمز الخصم." : "Promo code applied.");
  };

  const removeAdminPromo = () => {
    if (!order) return;
    setAppliedPromo(null);
    setPromoInput("");
    setOrder({ ...order, discount: 0, promo_code: null, promo_code_id: null });
  };

  const paymentBadge: PaymentBadge = useMemo(
    () =>
      resolvePaymentStatus(order?.payment_status, order?.status, totals.total, totals.advancePaid),
    [order?.payment_status, order?.status, totals.total, totals.advancePaid],
  );

  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraStreamPromise, setCameraStreamPromise] = useState<Promise<MediaStream> | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  if (orderQ.isError) {
    const rawErr = orderQ.error instanceof Error ? orderQ.error.message : String(orderQ.error ?? "");
    const localizedErr =
      rawErr.includes("Cannot read properties of null") || rawErr.includes("customer_id")
        ? lang === "ar"
          ? "جاري إعداد بيانات الطلب..."
          : "Loading order details..."
        : lang === "ar"
          ? "تأكد من وجود الطلب ثم حاول مرة أخرى."
          : "Please confirm this order exists and try again.";

    return (
      <div className="mx-auto max-w-2xl p-6 sm:p-8">
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
          <h1 className="text-xl font-semibold">
            {lang === "ar" ? "تعذر فتح الطلب" : "Unable to open this order"}
          </h1>
          <p className="text-sm text-muted-foreground">{localizedErr}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void orderQ.refetch()}>
              {lang === "ar" ? "إعادة المحاولة" : "Try again"}
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/b/$slug/orders" params={{ slug }}>
                {lang === "ar" ? "العودة إلى الطلبات" : "Back to orders"}
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!order) return <div className="p-8 text-center text-sm font-medium text-muted-foreground">{lang === "ar" ? "جاري التحميل..." : "Loading..."}</div>;

  // Courier access is intentionally limited by RLS. Their focused delivery
  // view must not wait for office-only settings, catalogue, or CRM queries.
  if (isCourier) {
    return (
      <CourierOrderView
        order={orderQ.data}
        slug={slug}
        onUpdated={async () => {
          await Promise.all([
            orderQ.refetch(),
            qc.invalidateQueries({ queryKey: ["orders"] }),
            qc.invalidateQueries({ queryKey: ["activity_logs"] }),
          ]);
        }}
      />
    );
  }

  if (settingsQ.isPending || !settingsQ.data) return <div className="p-8">Loading…</div>;

  const currency = order.currency ?? "BHD";
  const isClosedOrder = serverOrder?.status === "completed" || serverOrder?.status === "paid";
  const isReadOnly = isClosedOrder && !editingUnlocked;
  const isCreationMode = isBlankDraft && !hasSavedDraft;

  const addItem = () => {
    setItems([
      ...items,
      {
        description: "",
        quantity: 1,
        unit_price: 0,
        original_price: null,
        customizations: [],
        customization_total: 0,
        line_total: 0,
        location: "main",
      },
    ]);
  };

  const openBarcodeScanner = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    /* The scanner component owns camera acquisition. Avoid opening a competing
       warm-up stream here; it prevents autofocus on several mobile browsers. */
    setCameraStreamPromise(null);
    setScannerOpen(true);
  };

  const handleScanned = (code: string) => {
    const normalizeScan = (value: unknown) =>
      String(value ?? "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .toUpperCase();
    const trimmed = normalizeScan(code);
    if (!trimmed) return;
    const variants = variantsQ.data ?? [];
    const products = productsQ.data ?? [];
    const v =
      variants.find((x: any) => normalizeScan(x.barcode) === trimmed) ??
      variants.find((x: any) => normalizeScan(x.sku) === trimmed);
    if (!v) {
      toast.error(
        lang === "ar" ? `لم يتم العثور على الباركود: ${trimmed}` : `Barcode not found: ${trimmed}`,
      );
      return;
    }
    const p = products.find((x: any) => x.id === v.product_id);
    const isAr = lang === "ar";
    const sizeLabel = isAr ? "المقاس" : "Size";
    const colorLabel = isAr ? "اللون" : "Color";
    const fabricLabel = isAr ? "القماش" : "Fabric";
    const lines = [p?.name ?? ""];
    if (v.size) lines.push(`${sizeLabel}: ${v.size}`);
    if (v.color) lines.push(`${colorLabel}: ${v.color}`);
    if (v.fabric) lines.push(`${fabricLabel}: ${v.fabric}`);
    // Default to whichever location has stock; prefer main.
    const preferred: "main" | "incubator" =
      (v.stock_main ?? 0) > 0 ? "main" : (v.stock_incubator ?? 0) > 0 ? "incubator" : "main";
    const newItem: Item = {
      product_id: v.product_id,
      variant_id: v.id,
      description: lines.filter(Boolean).join("\n"),
      quantity: 1,
      unit_price: Number(v.selling_price ?? 0),
      original_price: (v as any).original_price == null ? null : Number((v as any).original_price),
      customizations: [],
      customization_total: 0,
      line_total: Number(v.selling_price ?? 0),
      location: preferred,
    };
    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.variant_id === v.id && item.location === preferred && !item.customizations?.length,
      );
      if (existingIndex < 0) return [...prev, newItem];
      return prev.map((item, index) =>
        index === existingIndex ? recalc({ ...item, quantity: Number(item.quantity) + 1 }) : item,
      );
    });
    toast.success(isAr ? "تمت إضافة القطعة" : "Item added");
  };

  const recalc = (i: Item): Item => {
    const custTotal = i.customizations.reduce((s, c) => s + Number(c.price_delta), 0);
    const line = (Number(i.unit_price) + custTotal) * Number(i.quantity);
    return { ...i, customization_total: custTotal, line_total: line };
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems(items.map((it, i) => (i === idx ? recalc({ ...it, ...patch }) : it)));
  };

  const pickVariant = (idx: number, variantId: string) => {
    const v = variantsQ.data?.find((x: any) => x.id === variantId);
    const p = productsQ.data?.find((x: any) => x.id === v?.product_id);
    if (!v || !p) return;
    const isAr = lang === "ar";
    const sizeLabel = isAr ? "المقاس" : "Size";
    const colorLabel = isAr ? "اللون" : "Color";
    const fabricLabel = isAr ? "القماش" : "Fabric";
    const lines = [p.name];
    if (v.size) lines.push(`${sizeLabel}: ${v.size}`);
    if (v.color) lines.push(`${colorLabel}: ${v.color}`);
    if (v.fabric) lines.push(`${fabricLabel}: ${v.fabric}`);
    updateItem(idx, {
      product_id: p.id,
      variant_id: v.id,
      description: lines.join("\n"),
      unit_price: Number(v.selling_price),
      original_price: (v as any).original_price == null ? null : Number((v as any).original_price),
    });
  };

  const toggleCustom = (idx: number, c: { name: string; price_delta: number }) => {
    const it = items[idx];
    const exists = it.customizations.find((x) => x.name === c.name);
    const newCust = exists
      ? it.customizations.filter((x) => x.name !== c.name)
      : [...it.customizations, c];
    updateItem(idx, { customizations: newCust });
  };

  const DEDUCTING = new Set(["confirmed", "paid", "shipped", "completed"]);

  const save = async () => {
    if (isReadOnly) return;
    const fulfillmentMethod = order.fulfillment_method ?? "delivery";
    if (fulfillmentMethod === "pickup" && !order.branch_id) {
      return toast.error(lang === "ar" ? "اختر فرع الاستلام" : "Select a pickup branch");
    }
    if (fulfillmentMethod === "delivery" && !order.shipping_address_id) {
      return toast.error(lang === "ar" ? "اختر عنوان التوصيل" : "Select a delivery address");
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    // Stock precheck when order will be in a deducting state.
    if (DEDUCTING.has(order.status)) {
      const variants = variantsQ.data ?? [];
      const wasDeducted = !!(orderQ.data as any)?.stock_deducted;
      const priorItems = wasDeducted ? ((orderQ.data as any)?.order_items ?? []) : [];
      const prevByVariant = new Map<string, number>();
      for (const p of priorItems as any[]) {
        if (!p.variant_id) continue;
        prevByVariant.set(
          p.variant_id,
          (prevByVariant.get(p.variant_id) ?? 0) + Number(p.quantity),
        );
      }
      const wantByVariant = new Map<string, number>();
      for (const it of items) {
        if (!it.variant_id) continue;
        wantByVariant.set(
          it.variant_id,
          (wantByVariant.get(it.variant_id) ?? 0) + Number(it.quantity),
        );
      }
      for (const [vid, want] of wantByVariant) {
        const v = variants.find((x: any) => x.id === vid);
        if (!v) continue;
        const available = Number(v.stock) + (prevByVariant.get(vid) ?? 0);
        if (want > available) {
          setSaving(false);
          return toast.error(t("orderDetail.insufficientStock"));
        }
      }
    }

    const { error: oe } = await supabase
      .from("orders")
      .update({
        customer_id: order.customer_id,
        status: order.status,
        notes: order.notes,
        fulfillment_method: fulfillmentMethod,
        branch_id: fulfillmentMethod === "pickup" ? (order.branch_id ?? null) : null,
        shipping_address_id:
          fulfillmentMethod === "delivery" ? (order.shipping_address_id ?? null) : null,
        digital_delivery_channel:
          fulfillmentMethod === "digital" ? order.digital_delivery_channel : null,
        digital_delivery_contact:
          fulfillmentMethod === "digital" ? order.digital_delivery_contact : null,
        payment_method: order.payment_method ?? null,
        payment_status: order.payment_status ?? "unpaid",
        fulfillment_status: order.fulfillment_status ?? "ON_HOLD",
        discount: totals.discount,
        tax_rate: order.tax_rate,
        tax_amount: totals.taxAmount,
        promo_code: appliedPromo?.code ?? null,
        promo_code_id: appliedPromo?.id || null,
        shipping: totals.shipping,
        subtotal: totals.subtotal,
        total: totals.total,
        advance_paid: totals.advancePaid,
        currency,
        order_date: order.order_date,
      } as any)
      .eq("id", order.id);
    if (oe) {
      setSaving(false);
      return toast.error(oe.message);
    }

    // ── Activity log: detect changes vs saved state
    const prev = (orderQ.data ?? {}) as any;
    const prevStatus = prev.status;
    const newStatus = order.status;
    const statusChanged = prevStatus !== newStatus;

    const logs: Array<{ action: string; en: string; ar: string; order_id: string }> = [];
    if (statusChanged) {
      logs.push({
        action: "status_change",
        order_id: order.id,
        en: `Order status changed from "${prev.status ?? "—"}" to "${order.status}"`,
        ar: `تم تغيير حالة الطلب من "${prev.status ?? "—"}" إلى "${order.status}"`,
      });
    }
    const prevPay = prev.payment_status ?? "unpaid";
    const nextPay = order.payment_status ?? "unpaid";
    if (prevPay !== nextPay) {
      logs.push({
        action: "payment_change",
        order_id: order.id,
        en: `Payment status manually changed from "${prevPay}" to "${nextPay}"`,
        ar: `تم تغيير حالة الدفع يدوياً من "${prevPay}" إلى "${nextPay}"`,
      });
    }
    const prevAdvance = Number(prev.advance_paid ?? 0);
    const nextAdvance = totals.advancePaid;
    if (prevAdvance !== nextAdvance) {
      logs.push({
        action: "advance_change",
        order_id: order.id,
        en: `Advance payment updated from ${prevAdvance} to ${nextAdvance} ${currency}`,
        ar: `تم تحديث المبلغ المقدم من ${prevAdvance} إلى ${nextAdvance} ${currency}`,
      });
    }

    // Only update order_items if they actually changed
    const originalItems = (orderQ.data?.order_items ?? []) as any[];
    let itemsModified = originalItems.length !== items.length;
    if (!itemsModified) {
      for (const item of items) {
        const orig = originalItems.find((o) => o.id === item.id);
        if (
          !orig ||
          orig.product_id !== item.product_id ||
          orig.variant_id !== item.variant_id ||
          Number(orig.quantity) !== Number(item.quantity) ||
          Number(orig.unit_price) !== Number(item.unit_price) ||
          orig.description !== item.description ||
          (orig.location === "incubator" ? "incubator" : "main") !== item.location ||
          JSON.stringify(orig.customizations ?? []) !== JSON.stringify(item.customizations ?? [])
        ) {
          itemsModified = true;
          break;
        }
      }
    }

    if (itemsModified) {
      await supabase.from("order_items").delete().eq("order_id", order.id);
      if (items.length > 0) {
        const { error: ie } = await (supabase.from("order_items") as any).insert(
          items.map((i) => ({
            user_id: user.id,
            order_id: order.id,
            product_id: i.product_id ?? null,
            variant_id: i.variant_id ?? null,
            description: i.description,
            quantity: i.quantity,
            unit_price: i.unit_price,
            original_price: i.original_price ?? null,
            customizations: i.customizations,
            customization_total: i.customization_total,
            line_total: i.line_total,
            location: i.location ?? "main",
          })),
        );
        if (ie) {
          setSaving(false);
          return toast.error(ie.message);
        }
      }
    }

    // Sync inventory (deduct or restore based on status).
    const { error: se } = await supabase.rpc("sync_order_stock", { p_order_id: order.id });
    if (se) {
      if (se.message?.includes("INSUFFICIENT_STOCK")) {
        toast.error(t("orderDetail.insufficientStock"));
      } else {
        console.warn("[sync_order_stock]", se.message);
        toast.error(se.message);
      }
    }

    // Stock deltas: compare prior deducted items vs current, log per-variant changes
    if (!se) {
      const variants = variantsQ.data ?? [];
      const wasDeducted = !!(orderQ.data as any)?.stock_deducted;
      const priorItems = wasDeducted ? ((orderQ.data as any)?.order_items ?? []) : [];
      const nowDeducting = DEDUCTING.has(order.status);
      const prevByV = new Map<string, number>();
      for (const p of priorItems as any[]) {
        if (!p.variant_id) continue;
        prevByV.set(p.variant_id, (prevByV.get(p.variant_id) ?? 0) + Number(p.quantity));
      }
      const wantByV = new Map<string, number>();
      if (nowDeducting) {
        for (const it of items) {
          if (!it.variant_id) continue;
          wantByV.set(it.variant_id, (wantByV.get(it.variant_id) ?? 0) + Number(it.quantity));
        }
      }
      const vids = new Set<string>([...prevByV.keys(), ...wantByV.keys()]);
      for (const vid of vids) {
        const delta = (wantByV.get(vid) ?? 0) - (prevByV.get(vid) ?? 0);
        if (delta === 0) continue;
        const v = variants.find((x: any) => x.id === vid) as any;
        const p = v ? (productsQ.data ?? []).find((x: any) => x.id === v.product_id) : null;
        const vLabel = v
          ? `${(p as any)?.name ?? ""}${v.size ? ` · ${v.size}` : ""}${v.color ? ` · ${v.color}` : ""}`
          : vid;
        const before = Number(v?.stock ?? 0) + (prevByV.get(vid) ?? 0);
        const after = before - (wantByV.get(vid) ?? 0);
        const inv = order.invoice_number ?? "";
        if (delta > 0) {
          logs.push({
            action: "stock_change",
            order_id: order.id,
            en: `Stock decreased from ${before} to ${after} for ${vLabel} due to Order #${inv}`,
            ar: `انخفض المخزون من ${before} إلى ${after} لـ ${vLabel} بسبب الطلب رقم ${inv}`,
          } as any);
        } else {
          logs.push({
            action: "stock_change",
            order_id: order.id,
            en: `Stock restored from ${before} to ${after} for ${vLabel} due to Order #${inv}`,
            ar: `استُعيد المخزون من ${before} إلى ${after} لـ ${vLabel} بسبب الطلب رقم ${inv}`,
          } as any);
        }
      }
    }

    if (logs.length > 0) await logActivityBatch(logs);

    toast.success(lang === "ar" ? "تم الحفظ بنجاح" : "Saved successfully");
    try {
      localStorage.removeItem(`boutq_draft_${brandId}_${id}`);
      localStorage.removeItem(`boutq_draft_${brandId}_new`);
    } catch (e) {}
    setHasSavedDraft(true);
    setEditingUnlocked(false);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["order", id] });
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["variants"] });
    qc.invalidateQueries({ queryKey: ["activity_logs"] });
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/invoice/${order.public_invoice_token}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success(t("orders.linkCopied"));
    } catch {
      toast.error(t("orders.linkFailed"));
    }
  };

  const printReceipt = () => {
    const settings: any = settingsQ.data ?? {};
    const LEGACY = new Set(["Abaya Atelier", "أباية أتيليه"]);
    const rawBrand = (settings.business_name ?? "").trim();
    const brand = !rawBrand || LEGACY.has(rawBrand) ? (lang === "ar" ? "بوتك" : "Boutq") : rawBrand;

    const paymentLabel = order.payment_method ? t(`payment.${order.payment_method}`) : "";
    const statusLabel = formatOrderStatus(order.status, order.fulfillment_method, lang);

    const ok = printThermalReceipt({
      brand,
      invoiceNumber: order.invoice_number,
      orderDate: order.order_date,
      status: statusLabel,
      customerName: getOrderCustomerName(order) || null,
      customerPhone: getOrderCustomerPhone(order) || null,
      paymentMethod: paymentLabel || null,
      items: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        customization_total: i.customization_total,
        line_total: i.line_total,
        customizations: i.customizations,
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxRate: Number(order.tax_rate ?? 0),
      taxAmount: totals.taxAmount,
      shipping: totals.shipping,
      total: totals.total,
      currency,
      lang,
      labels: {
        receipt: t("orders.printReceipt"),
        invoiceNumber: t("orders.invoice") + " #",
        date: t("orders.date"),
        status: t("orders.status"),
        payment: t("orderDetail.paymentMethod"),
        customer: t("orderDetail.customer"),
        item: t("orderDetail.description"),
        qty: t("orderDetail.qty"),
        price: t("orderDetail.unitPrice"),
        total: t("orderDetail.total"),
        subtotal: t("orderDetail.subtotal"),
        discount: t("orderDetail.discount"),
        vat: t("orderDetail.vat"),
        shipping: t("orderDetail.shipping"),
        grandTotal: t("orderDetail.grandTotal"),
        thankYou:
          settings.footer_note?.trim() ||
          (lang === "ar" ? "شكراً لتسوّقكم معنا" : "Thank you for your order"),
      },
      footerNote: null,
    });
    if (!ok) toast.error(t("orders.popupBlocked"));
  };

  const method = String(order?.payment_method || "").toLowerCase();
  const isCod = ["cash", "cod"].includes(method);
  const isUnpaid = (order?.payment_status ?? "unpaid") === "unpaid";
  const isPickup = String(order?.fulfillment_method || "").toLowerCase() === "pickup";

  const renderTopPrimaryAction = () => {
    if (isCreationMode || !order) return null;
    const workflow = getOrderWorkflow(order);

    if (workflow.nextAction === "pack_and_ship") {
      return (
        <Button
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({ fulfillment_status: "ASSIGNED", updated_at: new Date().toISOString() } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(lang === "ar" ? "تم جاهزية الطلب وتعيينه للمندوب" : "Packed & Assigned to Courier");
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"));
            }
          }}
        >
          <Truck className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تجهيز وتعيين المندوب" : "Pack & Assign"}
        </Button>
      );
    }

    if (workflow.nextAction === "confirm_pickup") {
      return (
        <Button
          className="bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({ fulfillment_status: "SHIPPED", updated_at: new Date().toISOString() } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(lang === "ar" ? "تم استلام الشحنة من المندوب وخرجت للتوصيل" : "Courier picked up parcel - Out for Delivery");
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"));
            }
          }}
        >
          <Truck className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تأكيد استلام المندوب (خرج للتوصيل)" : "Confirm Pickup (Start Transit)"}
        </Button>
      );
    }

    if (workflow.nextAction === "validate_payment") {
      return (
        <Button
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          disabled={approvingBenefit}
          onClick={approveBenefitPayment}
        >
          {approvingBenefit ? (
            <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
          ) : (
            <Receipt className="h-4 w-4 me-1.5" />
          )}
          {lang === "ar" ? "اعتماد دفع البنفت" : "Approve Benefit Payment"}
        </Button>
      );
    }

    if (workflow.nextAction === "mark_delivered" || workflow.nextAction === "collect_and_deliver") {
      return (
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  fulfillment_status: "COMPLETED",
                  status: "completed",
                  delivered_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(lang === "ar" ? "تم تسجيل تسليم الطلب وإتمامه" : "Order delivered & completed");
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(err?.message || (lang === "ar" ? "تعذر إكمال التسليم" : "Unable to complete delivery"));
            }
          }}
        >
          <CheckCircle2 className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تسليم الطلب" : "Mark Delivered"}
        </Button>
      );
    }

    if (workflow.nextAction === "prepare_pickup") {
      return (
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({ fulfillment_status: "READY_FOR_PICKUP", updated_at: new Date().toISOString() } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(lang === "ar" ? "تم تجهيز الطلب للاستلام" : "Ready for pickup");
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"));
            }
          }}
        >
          <CheckCircle2 className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تجهيز للاستلام" : "Prepare for Pickup"}
        </Button>
      );
    }

    if (workflow.nextAction === "hand_over_pickup" || workflow.nextAction === "collect_and_hand_over") {
      return (
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  fulfillment_status: "COMPLETED",
                  status: "completed",
                  delivered_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(lang === "ar" ? "تم تسليم الطلب للعميل" : "Handed over to customer");
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(err?.message || (lang === "ar" ? "تعذر إكمال التسليم" : "Unable to complete handover"));
            }
          }}
        >
          <CheckCircle2 className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تسليم العميل" : "Hand Over"}
        </Button>
      );
    }

    return null;
  };

  return (
    <div
      className="mx-auto max-w-[1500px] p-4 pb-24 sm:p-6 lg:p-8 animate-fade-in"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/b/$slug/orders"
          params={{ slug }}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> {t("orderDetail.back")}
        </Link>
        <div className={cn("flex flex-wrap gap-2", !isReadOnly && "hidden sm:flex")}>
          {!isCreationMode && (
            <>
              {renderTopPrimaryAction()}
              <SendInvoiceDialog
                order={order}
                totals={totals}
                settings={settingsQ.data}
                currency={currency}
              />
              <ResendConfirmationEmailButton
                order={order}
                lang={lang}
                onDone={() => qc.invalidateQueries({ queryKey: ["order", id] })}
              />
              <Button
                variant="outline"
                onClick={copyLink}
                className="shadow-xs transition-all hover:bg-accent"
              >
                <LinkIcon className="h-4 w-4 me-1.5 text-muted-foreground" /> {t("orders.copyLink")}
              </Button>
              <Button
                variant="outline"
                onClick={printReceipt}
                className="shadow-xs transition-all hover:bg-accent"
              >
                <Receipt className="h-4 w-4 me-1.5 text-muted-foreground" /> {t("orders.printReceipt")}
              </Button>
              <Button
                variant="outline"
                className="shadow-xs transition-all hover:bg-accent"
                onClick={async () => {
                  try {
                    const el = document.querySelector<HTMLElement>(".printable-invoice");
                    const { downloadInvoicePdf } = await import("@/lib/download-invoice-pdf");
                    await downloadInvoicePdf(el, `invoice-${order.invoice_number ?? order.id}`);
                  } catch (err) {
                    console.error("PDF download failed", err);
                    toast.error(
                      (err as Error)?.message ??
                        (lang === "ar" ? "فشل تحميل ملف PDF" : "PDF download failed"),
                    );
                  }
                }}
              >
                <Printer className="h-4 w-4 me-1.5 text-muted-foreground" /> {t("orders.printA4")}
              </Button>
            </>
          )}
          {isReadOnly ? (
            isAdmin && (
              <Button
                variant="default"
                onClick={() => setEditingUnlocked(true)}
                className="shadow-sm transition-all hover:scale-[1.01] active:scale-95 font-semibold bg-primary hover:bg-primary/90"
              >
                <Unlock className="h-4 w-4 me-1.5" />
                {lang === "ar" ? "فتح للتعديل" : "Unlock for editing"}
              </Button>
            )
          ) : (
            <Button
              onClick={save}
              disabled={saving}
              className={`${isCreationMode ? "min-w-48" : ""} lg:hidden shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95`}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {isCreationMode
                ? lang === "ar"
                  ? "إنشاء وحفظ الطلب"
                  : "Create & Save Order"
                : t("common.save")}
            </Button>
          )}
        </div>
      </div>

      {isReadOnly && (
        <div className="no-print mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="h-4 w-4 shrink-0" />
          {lang === "ar"
            ? "هذا طلب مغلق. الحقول مقفلة لحماية السجل التاريخي."
            : "This order is closed. Fields are locked to protect its history."}
        </div>
      )}

      {/* Sticky Section Navigation Bar */}
      {!isCreationMode && (
        <div className="no-print sticky top-0 z-30 mb-6 flex overflow-x-auto gap-2 rounded-xl border border-border/80 bg-background/95 p-1.5 backdrop-blur shadow-sm select-none">
          <button
            type="button"
            onClick={() => scrollToSection("sec-overview")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 touch-manipulation",
              activeSection === "sec-overview"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "hover:bg-muted text-muted-foreground",
            )}
          >
            📍 {lang === "ar" ? "العميل والتوصيل" : "Overview & Delivery"}
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("sec-items")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 touch-manipulation",
              activeSection === "sec-items"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "hover:bg-muted text-muted-foreground",
            )}
          >
            🛍️ {lang === "ar" ? "بنود الطلب" : "Line Items"}
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("sec-invoice")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 touch-manipulation",
              activeSection === "sec-invoice"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "hover:bg-muted text-muted-foreground",
            )}
          >
            📄 {lang === "ar" ? "معاينة الفاتورة" : "Invoice Preview"}
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("sec-activity")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 touch-manipulation",
              activeSection === "sec-activity"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "hover:bg-muted text-muted-foreground",
            )}
          >
            📜 {lang === "ar" ? "سجل النشاطات" : "Activity Log"}
          </button>
        </div>
      )}

      {/* Editor - hidden on print */}
      <fieldset
        disabled={isReadOnly}
        className="no-print m-0 min-w-0 border-0 p-0 disabled:opacity-80"
      >
        <div className="mb-6 grid items-start gap-6 grid-cols-1 lg:grid-cols-3">
          {/* RIGHT COLUMN (35% width) - Customer, Address & Workflow Controls */}
          <div className="space-y-6 lg:col-span-1">
            <Card
              id="sec-overview"
              className="scroll-mt-24 overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-5 sm:p-6"
            >
            <div className="mb-4">
              <Label className="flex items-center gap-2">
                <Search className="h-3 w-3" /> {t("customers.searchByPhone")}
              </Label>
              <Input
                className="text-start"
                placeholder={t("customers.searchByPhonePh")}
                value={phoneSearch}
                onChange={(e) => {
                  const q = e.target.value;
                  setPhoneSearch(q);
                  const digits = q.replace(/\D/g, "");
                  if (digits.length < 3) return;
                  const match = (customersQ.data ?? []).find((c: any) =>
                    (c.phone ?? "").replace(/\D/g, "").includes(digits),
                  );
                  if (match) {
                    const def =
                      (addressesQ.data ?? []).find(
                        (a) => a.customer_id === match.id && a.is_default,
                      ) ?? (addressesQ.data ?? []).find((a) => a.customer_id === match.id);
                    setOrder({
                      ...order,
                      customer_id: match.id,
                      shipping_address_id: def?.id ?? null,
                    });
                  }
                }}
              />
              {phoneSearch.replace(/\D/g, "").length >= 3 &&
                !(customersQ.data ?? []).some((c: any) =>
                  (c.phone ?? "").replace(/\D/g, "").includes(phoneSearch.replace(/\D/g, "")),
                ) && (
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    {t("customers.noMatch")}
                  </p>
                )}
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>{t("orderDetail.customer")}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px] font-semibold text-primary"
                    onClick={() => setNewCustomerOpen(true)}
                  >
                    <Plus className="h-3 w-3 me-1" />
                    {lang === "ar" ? "زبون جديد" : "New Customer"}
                  </Button>
                </div>
                <Select
                  value={order.customer_id ?? "none"}
                  onValueChange={(v) => {
                    const cid = v === "none" ? null : v;
                    const def = cid
                      ? ((addressesQ.data ?? []).find(
                          (a) => a.customer_id === cid && a.is_default,
                        ) ?? (addressesQ.data ?? []).find((a) => a.customer_id === cid))
                      : null;
                    setOrder({ ...order, customer_id: cid, shipping_address_id: def?.id ?? null });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("orderDetail.noCustomerOption")}</SelectItem>
                    {(customersQ.data ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` — ${c.phone}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            </div>
            {order.customer_id &&
              (() => {
                const selected = (customersQ.data ?? []).find(
                  (c: any) => c.id === order.customer_id,
                );
                if (!selected) return null;
                const customerAddrs = (addressesQ.data ?? []).filter(
                  (a) => a.customer_id === order.customer_id,
                );
                const legacyLines = formatDeliveryAddress(selected, lang);
                return (
                  <div className="mt-4 pt-4 border-t border-border text-start">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                      {order.fulfillment_method === "digital"
                        ? lang === "ar"
                          ? "بيانات العميل"
                          : "Customer details"
                        : t("orderDetail.deliveryAddress")}
                    </p>
                    <p className="font-medium">{selected.name}</p>
                    {selected.email && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5 break-all">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <a href={`mailto:${selected.email}`} className="hover:underline">
                          {selected.email}
                        </a>
                      </p>
                    )}
                    {selected.phone && (
                      <p className="text-sm text-muted-foreground">{selected.phone}</p>
                    )}
                    {order.fulfillment_method === "delivery" &&
                    legacyLines.length > 0 &&
                    customerAddrs.length === 0
                      ? legacyLines.map((line, index) => (
                          <p key={index} className="text-sm text-muted-foreground">
                            {line}
                          </p>
                        ))
                      : null}
                  </div>
                );
              })()}
            {(() => {
              const method = order.fulfillment_method ?? "delivery";
              const deliveryEnabled = Boolean((settingsQ.data as any).delivery_enabled);
              const pickupEnabled = Boolean((settingsQ.data as any).pickup_enabled);
              const digitalEnabled = Boolean((settingsQ.data as any).digital_delivery_enabled);
              const defaultDeliveryFee = Number((settingsQ.data as any).delivery_fee ?? 0);
              const selectedCustomer = (customersQ.data ?? []).find(
                (c: any) => c.id === order.customer_id,
              );
              const selectedAddress = (addressesQ.data ?? []).find(
                (a) => a.id === order.shipping_address_id,
              );
              const storedAddressSnapshot = (order as any)
                .delivery_address_snapshot as StructuredAddress | null;
              const snapshotMatchesSavedSelection =
                storedAddressSnapshot &&
                (!order.shipping_address_id ||
                  !storedAddressSnapshot.id ||
                  storedAddressSnapshot.id === order.shipping_address_id);
              const addressSnapshot =
                (snapshotMatchesSavedSelection ? storedAddressSnapshot : null) ??
                selectedAddress ??
                storedAddressSnapshot ??
                (selectedCustomer as StructuredAddress | null);
              const selectedBranch = (branchesQ.data ?? []).find(
                (b: any) => b.id === order.branch_id,
              );
              const address = selectedAddress
                ? formatAddressLine(selectedAddress as StructuredAddress, lang)
                : formatDeliveryAddress(selectedCustomer, lang).join("، ");
              const branchName = selectedBranch
                ? lang === "ar"
                  ? selectedBranch.name_ar || selectedBranch.name_en
                  : selectedBranch.name_en || selectedBranch.name_ar
                : null;
              const branchLocation = selectedBranch
                ? lang === "ar"
                  ? selectedBranch.location_ar || selectedBranch.location_en
                  : selectedBranch.location_en || selectedBranch.location_ar
                : null;
              const customerAddresses = (addressesQ.data ?? []).filter(
                (item) => item.customer_id === order.customer_id,
              );
              const defaultAddress =
                customerAddresses.find((item) => item.is_default) ?? customerAddresses[0] ?? null;
              const title =
                method === "digital"
                  ? lang === "ar"
                    ? "تسليم رقمي"
                    : "Digital delivery"
                  : method === "pickup"
                    ? lang === "ar"
                      ? "استلام من الفرع"
                      : "Pickup from branch"
                    : lang === "ar"
                      ? "توصيل"
                      : "Delivery";
              return (
                <div className="mt-5 overflow-hidden rounded-xl border bg-muted/20 text-start shadow-sm">
                  <div className="flex flex-col gap-3 border-b bg-muted/50 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {lang === "ar" ? "طريقة التسليم" : "Fulfillment"}
                      </p>
                      <p className="text-lg font-semibold">{title}</p>
                    </div>
                    <div className="w-full sm:w-64">
                      <Label className="sr-only">
                        {lang === "ar" ? "طريقة التسليم" : "Fulfillment method"}
                      </Label>
                      <Select
                        value={method}
                        onValueChange={(value) =>
                          setOrder({
                            ...order,
                            fulfillment_method: value,
                            branch_id: value === "pickup" ? (order.branch_id ?? null) : null,
                            shipping_address_id:
                              value === "delivery"
                                ? (order.shipping_address_id ?? defaultAddress?.id ?? null)
                                : null,
                            shipping:
                              value === "delivery"
                                ? isCreationMode
                                  ? defaultDeliveryFee
                                  : Number(order.shipping ?? defaultDeliveryFee)
                                : 0,
                          })
                        }
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(pickupEnabled || method === "pickup") && (
                            <SelectItem value="pickup">
                              {lang === "ar" ? "استلام من الفرع" : "Pickup from Branch"}
                            </SelectItem>
                          )}
                          {(deliveryEnabled || method === "delivery") && (
                            <SelectItem value="delivery">
                              {lang === "ar" ? "توصيل للمنزل" : "Home Delivery"}
                            </SelectItem>
                          )}
                          {(digitalEnabled || method === "digital") && (
                            <SelectItem value="digital">
                              {lang === "ar" ? "تسليم رقمي" : "Digital Delivery"}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="p-4">
                    {method === "delivery" && isAdmin && (
                      <div className="mb-4 space-y-3 rounded-lg border bg-background p-3">
                        <Label>{lang === "ar" ? "مندوب التوصيل المسند" : "Assigned courier"}</Label>
                        <Select
                          value={order.assigned_to ?? "unassigned"}
                          onValueChange={assignCourier}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">
                              {lang === "ar" ? "غير مسند" : "Unassigned"}
                            </SelectItem>
                            {(couriersQ.data ?? []).map((courier: any) => (
                              <SelectItem key={courier.id} value={courier.id}>
                                {courier.name || courier.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {(() => {
                          if (!order.assigned_to) return null;
                          const assignedCourierObj = (couriersQ.data ?? []).find(
                            (c: any) => c.id === order.assigned_to,
                          );
                          const notifiedAgo = formatNotifiedTimeAgo(
                            (order as any).courier_notified_at,
                            lang,
                          );
                          return (
                            <div className="space-y-2 pt-2 border-t">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                {notifiedAgo ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800 text-[11px] font-bold px-2.5 py-1">
                                    🔔{" "}
                                    {lang === "ar"
                                      ? `تم الإشعار (${notifiedAgo})`
                                      : `Notified ${notifiedAgo}`}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800 text-[11px] font-bold px-2.5 py-1">
                                    ⏳{" "}
                                    {lang === "ar"
                                      ? "لم يتم الإشعار عبر واتساب بعد"
                                      : "WhatsApp notification pending"}
                                  </span>
                                )}

                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 shadow-sm flex items-center gap-1.5"
                                  onClick={() => setWaModalOpen(true)}
                                >
                                  📱{" "}
                                  {lang === "ar"
                                    ? `إشعار ${assignedCourierObj?.name ? assignedCourierObj.name.split(" ")[0] : "المندوب"} عبر واتساب`
                                    : `Notify ${assignedCourierObj?.name ? assignedCourierObj.name.split(" ")[0] : "Courier"} on WhatsApp`}
                                </Button>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
                          <span className="text-muted-foreground">
                            {lang === "ar" ? "حالة التوصيل:" : "Delivery status:"}
                          </span>
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                            {getFulfillmentLabel(order.fulfillment_status, lang)}
                          </span>
                          {order.payment_method === "cod" && (
                            <span
                              className={`rounded-full px-2.5 py-1 font-medium ${order.cod_collected_at ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                            >
                              {order.cod_collected_at
                                ? `${lang === "ar" ? "تم استلام النقد" : "Cash received"}: ${formatMoney(Number(order.cod_collected_amount || 0), order.currency || "BHD")}`
                                : lang === "ar"
                                  ? "النقد بانتظار التحصيل"
                                  : "Cash collection pending"}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {method === "digital" ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label>{lang === "ar" ? "قناة التسليم" : "Delivery channel"}</Label>
                          <Select
                            value={order.digital_delivery_channel ?? "email"}
                            onValueChange={(value) =>
                              setOrder({ ...order, digital_delivery_channel: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="email">
                                {lang === "ar" ? "البريد الإلكتروني" : "Email"}
                              </SelectItem>
                              <SelectItem value="whatsapp">
                                {lang === "ar" ? "واتساب" : "WhatsApp"}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>
                            {order.digital_delivery_channel === "whatsapp"
                              ? lang === "ar"
                                ? "رقم أو معرّف واتساب"
                                : "WhatsApp number or user ID"
                              : lang === "ar"
                                ? "البريد الإلكتروني"
                                : "Email address"}
                          </Label>
                          <Input
                            dir="ltr"
                            value={order.digital_delivery_contact ?? ""}
                            onChange={(e) =>
                              setOrder({ ...order, digital_delivery_contact: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    ) : method === "pickup" ? (
                      <div className="space-y-2">
                        <Label>{lang === "ar" ? "فرع الاستلام" : "Pickup location"}</Label>
                        <Select
                          value={order.branch_id ?? ""}
                          onValueChange={(branchId) => setOrder({ ...order, branch_id: branchId })}
                        >
                          <SelectTrigger className="text-start">
                            <SelectValue
                              placeholder={lang === "ar" ? "اختر الفرع" : "Select a branch"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {(branchesQ.data ?? []).map((branch: any) => {
                              const name =
                                lang === "ar"
                                  ? branch.name_ar || branch.name_en
                                  : branch.name_en || branch.name_ar;
                              const location =
                                lang === "ar"
                                  ? branch.location_ar || branch.location_en
                                  : branch.location_en || branch.location_ar;
                              return (
                                <SelectItem key={branch.id} value={branch.id}>
                                  {name}
                                  {location ? ` — ${location}` : ""}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        {selectedBranch && (
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">{branchName}</span>
                            {branchLocation ? ` — ${branchLocation}` : ""}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-4 grid-cols-1">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label>{lang === "ar" ? "عنوان التوصيل" : "Delivery address"}</Label>
                            {defaultAddress && (
                              <button
                                type="button"
                                className="text-xs font-medium text-primary hover:underline"
                                onClick={() =>
                                  setOrder({ ...order, shipping_address_id: defaultAddress.id })
                                }
                              >
                                {lang === "ar"
                                  ? "استخدام عنوان ملف العميل"
                                  : "Use Customer Profile Address"}
                              </button>
                            )}
                          </div>
                          <Select
                            value={order.shipping_address_id ?? ""}
                            onValueChange={(addressId) =>
                              setOrder({ ...order, shipping_address_id: addressId })
                            }
                          >
                            <SelectTrigger className="text-start">
                              <SelectValue
                                placeholder={lang === "ar" ? "اختر عنواناً" : "Select an address"}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {customerAddresses.map((savedAddress) => (
                                <SelectItem key={savedAddress.id} value={savedAddress.id}>
                                  {savedAddress.label || t("customers.address")}
                                  {savedAddress.is_default ? " ★" : ""} —{" "}
                                  {formatAddressLine(savedAddress as StructuredAddress, lang) ||
                                    "—"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {addressSnapshot && (
                            <DeliveryAddressCard
                              address={addressSnapshot}
                              lang={lang}
                              compact
                              showLabel={false}
                            />
                          )}
                          <p className="hidden text-sm text-muted-foreground">
                            {address ||
                              (lang === "ar"
                                ? "لا يوجد عنوان توصيل محفوظ لهذا العميل"
                                : "No saved delivery address for this customer")}
                          </p>
                        </div>
                        <div>
                          <Label>{lang === "ar" ? "رسوم التوصيل" : "Delivery fee"}</Label>
                          <BhdFeeInput
                            value={Number(order.shipping ?? 0)}
                            disabled={isReadOnly}
                            onChange={(shipping) => setOrder({ ...order, shipping })}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatMoney(Number(order.shipping ?? 0), order.currency ?? "BHD")}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="mt-4 grid grid-cols-1 gap-4">
              <div>
                <Label>{t("orderDetail.notes")}</Label>
                <Textarea
                  value={order.notes ?? ""}
                  onChange={(e) => setOrder({ ...order, notes: e.target.value })}
                  rows={3}
                  placeholder={lang === "ar" ? "ملاحظات داخلية للطلب" : "Internal order notes"}
                />
              </div>
              <div>
                <Label className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-bold mb-1.5">
                  <Truck className="h-4 w-4" />
                  {lang === "ar" ? "ملاحظات التوصيل وسجل السائق" : "Courier Delivery Notes & Trace"}
                </Label>
                <Textarea
                  value={order.delivery_notes ?? ""}
                  onChange={(e) => setOrder({ ...order, delivery_notes: e.target.value })}
                  rows={3}
                  placeholder={
                    lang === "ar" ? "ملاحظات السائق وسجل التوصيل" : "Driver notes and courier logs"
                  }
                  className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 font-mono text-xs"
                />
              </div>
            </div>
          </Card>
          </div>

          {/* LEFT COLUMN (65% width) - Products, Line Items & Notes */}
          <div className="space-y-6 lg:col-span-2">
            <Card
              id="sec-items"
              className="scroll-mt-24 overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-5 sm:p-6"
            >
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h3 className="font-display text-lg">{t("orderDetail.lineItems")}</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground font-semibold"
                  onClick={() => setProductSearchOpen(true)}
                >
                  <Search className="h-3.5 w-3.5 me-1.5" />
                  {lang === "ar" ? "بحث المنتجات والـ SKU" : "Search Products & SKUs"}
                </Button>
                <Button size="sm" variant="outline" onClick={openBarcodeScanner}>
                  <ScanLine className="h-3.5 w-3.5 me-1.5" />
                  {lang === "ar" ? "مسح الباركود" : "Scan Barcode"}
                </Button>
                <Button size="sm" variant="outline" onClick={addItem}>
                  <Plus className="h-3.5 w-3.5 me-1.5" /> {t("orderDetail.addLine")}
                </Button>
              </div>
            </div>
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("orderDetail.noLines")}</p>
            )}
            <div className="space-y-3">
              {items.map((it, idx) => {
                const variant = it.variant_id
                  ? (variantsQ.data ?? []).find((x: any) => x.id === it.variant_id)
                  : null;
                const product =
                  (variant ? productsQ.data?.find((x: any) => x.id === (variant as any).product_id) : null) ??
                  (it.product_id ? (productsQ.data ?? []).find((x: any) => x.id === it.product_id) : null) ??
                  (productsQ.data ?? []).find((x: any) =>
                    it.description && x.name
                      ? String(it.description).trim().toLowerCase().includes(String(x.name).trim().toLowerCase()) ||
                        String(x.name).trim().toLowerCase().includes(String(it.description).trim().toLowerCase())
                      : false,
                  );

                const getMediaUrl = (obj: any) => {
                  if (!obj) return null;
                  if (typeof obj.image_url === "string" && obj.image_url) return obj.image_url;
                  if (typeof obj.image === "string" && obj.image) return obj.image;
                  if (Array.isArray(obj.images) && obj.images[0]) return obj.images[0];
                  if (Array.isArray(obj.media) && obj.media[0]) {
                    const m = obj.media[0];
                    return typeof m === "string" ? m : m.url || m.poster_url || null;
                  }
                  return null;
                };

                const imageUrl = getMediaUrl(variant) || getMediaUrl(product);
                const sku = (variant as any)?.sku || (product as any)?.sku;
                const mainStock = Number((variant as any)?.stock_main ?? 0);
                const incStock = Number((variant as any)?.stock_incubator ?? 0);
                const isAr = lang === "ar";
                return (
                  <div key={idx} className="space-y-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-xs transition-all">
                    {/* Item Thumbnail & SKU Header */}
                    <div className="flex items-center gap-3 pb-2.5 border-b border-border/60">
                      <div className="h-12 w-12 rounded-lg border bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={it.description || ""}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate text-foreground">
                          {it.description || (product?.name ?? (isAr ? "منتج مخصص" : "Custom Item"))}
                        </p>
                        {sku ? (
                          <span className="inline-flex items-center text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-muted/80 text-muted-foreground border border-border/60 mt-1">
                            SKU: {sku}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            {variant
                              ? `${variant.size || ""} ${variant.color || ""}`.trim() || (isAr ? "متغير" : "Variant")
                              : (isAr ? "بند مخصص" : "Custom Line")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-4">
                        <Label>{t("orderDetail.fromInventory")}</Label>
                        <Select
                          value={it.variant_id ?? "custom"}
                          onValueChange={(v) => v !== "custom" && pickVariant(idx, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("orderDetail.pickVariant")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="custom">{t("orderDetail.customLine")}</SelectItem>
                            {(variantsQ.data ?? []).map((v: any) => {
                              const p = productsQ.data?.find((x: any) => x.id === v.product_id);
                              if (!p) return null;
                              return (
                                <SelectItem key={v.id} value={v.id}>
                                  {p.name} {v.size ? `· ${v.size}` : ""}{" "}
                                  {v.color ? `· ${v.color}` : ""} —{" "}
                                  {formatMoney(v.selling_price, currency)}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-3">
                        <Label>{t("orderDetail.description")}</Label>
                        <Textarea
                          rows={3}
                          value={it.description}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          className="text-sm leading-snug"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>{t("orderDetail.qty")}</Label>
                        <Input
                          type="number"
                          min={1}
                          className="min-w-[70px] text-center"
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <Label>{t("orderDetail.unitPrice")}</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={it.unit_price}
                          onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                        />
                        {Number(it.original_price ?? (variant as any)?.original_price ?? 0) >
                          Number(it.unit_price) && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {isAr ? "السعر الأصلي" : "Original"}:{" "}
                            <span className="line-through">
                              {formatMoney(
                                Number(it.original_price ?? (variant as any)?.original_price),
                                currency,
                              )}
                            </span>
                            <span className="mx-1">·</span>
                            {isAr ? "سعر التخفيض" : "Sale"}:{" "}
                            <span className="font-medium text-foreground">
                              {formatMoney(it.unit_price, currency)}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    {it.variant_id && (
                      <div>
                        <Label className="text-xs">
                          {isAr ? "الموقع (خصم من)" : "Location (deduct from)"}
                        </Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {(
                            [
                              {
                                key: "main",
                                en: `Direct Sales · Main (${mainStock})`,
                                ar: `الرئيسي (${mainStock})`,
                              },
                              {
                                key: "incubator",
                                en: `Incubator (${incStock})`,
                                ar: `الحاضنة (${incStock})`,
                              },
                            ] as const
                          ).map((opt) => {
                            const active = it.location === opt.key;
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => updateItem(idx, { location: opt.key })}
                                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                  active
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-border hover:bg-secondary"
                                }`}
                              >
                                {isAr ? opt.ar : opt.en}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(it.selected_variant ||
                      (it.custom_field_values && it.custom_field_values.length > 0)) && (
                      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
                        <div className="font-medium text-sm">
                          {isAr ? "اختيارات العميل" : "Customer selections"}
                        </div>
                        {it.selected_variant && (
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {it.selected_variant.size && (
                              <span>
                                <b>{isAr ? "المقاس" : "Size"}:</b> {it.selected_variant.size}
                              </span>
                            )}
                            {it.selected_variant.color && (
                              <span>
                                <b>{isAr ? "اللون" : "Color"}:</b> {it.selected_variant.color}
                              </span>
                            )}
                            {it.selected_variant.fabric && (
                              <span>
                                <b>{isAr ? "القماش" : "Fabric"}:</b> {it.selected_variant.fabric}
                              </span>
                            )}
                          </div>
                        )}
                        {it.custom_field_values && it.custom_field_values.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 pt-1">
                            {it.custom_field_values.map((cf, i) => (
                              <div key={i}>
                                <b>
                                  {isAr
                                    ? cf.label_ar || cf.label_en || cf.key
                                    : cf.label_en || cf.label_ar || cf.key}
                                  :
                                </b>{" "}
                                {cf.value.startsWith("http") ? (
                                  <div className="inline-flex flex-col gap-1 mt-1">
                                    <a
                                      href={cf.value}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-primary hover:underline font-semibold inline-flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded"
                                    >
                                      📎 {isAr ? "تحميل/عرض الملف" : "View Uploaded File"}
                                    </a>
                                    {/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(cf.value) && (
                                      <img
                                        src={cf.value}
                                        alt=""
                                        className="mt-1 max-h-24 rounded border object-contain bg-background"
                                      />
                                    )}
                                  </div>
                                ) : (
                                  cf.value
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <Label className="text-xs">{t("orderDetail.customizations")}</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {(customQ.data ?? []).map((c: any) => {
                          const active = it.customizations.some((x) => x.name === c.name);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() =>
                                toggleCustom(idx, {
                                  name: c.name,
                                  price_delta: Number(c.price_delta),
                                })
                              }
                              className={`text-xs px-2 py-1 rounded-full border ${active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}
                            >
                              {c.name} +{formatMoney(c.price_delta, currency)}
                            </button>
                          );
                        })}
                        {(customQ.data ?? []).length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            {t("orderDetail.addonsHint")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-sm text-muted-foreground">
                        {t("orderDetail.lineTotal")}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{formatMoney(it.line_total, currency)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <BarcodeScanner
              open={scannerOpen}
              onOpenChange={setScannerOpen}
              onDetected={handleScanned}
              cameraStreamPromise={cameraStreamPromise}
            />
          </Card>

          <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-5 sm:p-6 space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div>
                  <Label>{t("orderDetail.orderDate")}</Label>
                  <Input
                    type="date"
                    value={order.order_date}
                    onChange={(e) => setOrder({ ...order, order_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t("orderDetail.status")}</Label>
                  <Select
                    value={order.status}
                    onValueChange={(status) => {
                      const updatedFulfillment =
                        status === "completed"
                          ? "COMPLETED"
                          : status === "cancelled"
                            ? "CANCELLED"
                            : order.fulfillment_status;
                      setOrder({ ...order, status, fulfillment_status: updatedFulfillment });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">{t("status.draft")}</SelectItem>
                      <SelectItem value="confirmed">{t("status.confirmed")}</SelectItem>
                      <SelectItem value="completed">{t("status.completed")}</SelectItem>
                      <SelectItem value="cancelled">{t("status.cancelled")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2 lg:col-span-1">
                  <Label>{t("orderDetail.paymentMethod")}</Label>
                  <Select
                    value={order.payment_method ?? "none"}
                    onValueChange={(payment_method) =>
                      setOrder({
                        ...order,
                        payment_method: payment_method === "none" ? null : payment_method,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("orderDetail.selectPayment")}</SelectItem>
                      <SelectItem value="cash">{t("payment.cash")}</SelectItem>
                      <SelectItem value="card">{t("payment.card")}</SelectItem>
                      <SelectItem value="bank_transfer">{t("payment.bank_transfer")}</SelectItem>
                      <SelectItem value="benefit">{t("payment.benefit")}</SelectItem>
                      <SelectItem value="apple_pay">{t("payment.apple_pay")}</SelectItem>
                      <SelectItem value="google_pay">{t("payment.google_pay")}</SelectItem>
                      <SelectItem value="cod">{t("payment.cod")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="lg:hidden">
                <Label>{t("orderDetail.notes")}</Label>
                <Textarea
                  value={order.notes ?? ""}
                  onChange={(e) => setOrder({ ...order, notes: e.target.value })}
                  rows={5}
                />
              </div>
              <div className="space-y-3">
                {order.payment_method === "benefit" && order.benefit_receipt_key && (
                  <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5" />
                        <span className="font-semibold">
                          {lang === "ar" ? "إيصال تحويل بنفت" : "Benefit transfer receipt"}
                        </span>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${order.payment_status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-200 text-amber-900"}`}
                      >
                        {order.payment_status === "paid"
                          ? lang === "ar"
                            ? "تم التحقق"
                            : "Verified"
                          : lang === "ar"
                            ? "بانتظار التحقق"
                            : "Pending verification"}
                      </span>
                    </div>
                    {receiptViewQ.isLoading ? (
                      <div className="flex h-52 items-center justify-center rounded-lg border bg-white">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : receiptViewQ.data?.url ? (
                      <a
                        href={receiptViewQ.data.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg border bg-white"
                      >
                        <img
                          src={receiptViewQ.data.url}
                          alt="Benefit payment receipt"
                          className="h-52 w-full object-contain"
                        />
                      </a>
                    ) : (
                      <div className="rounded-lg border bg-white p-5 text-center text-sm text-muted-foreground">
                        {order.benefit_receipt_deleted_at
                          ? lang === "ar"
                            ? "تم حذف صورة الإيصال حسب سياسة الاحتفاظ."
                            : "Receipt image removed under the retention policy."
                          : lang === "ar"
                            ? "تعذر تحميل صورة الإيصال الخاصة."
                            : "The private receipt could not be loaded."}
                      </div>
                    )}
                    {order.payment_status !== "paid" && (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button
                          type="button"
                          className="bg-emerald-700 text-white hover:bg-emerald-800"
                          onClick={approveBenefitPayment}
                          disabled={approvingBenefit || rejectingBenefit}
                        >
                          {approvingBenefit ? (
                            <Loader2 className="me-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="me-2 h-4 w-4" />
                          )}
                          {lang === "ar" ? "اعتماد الدفع" : "Approve Payment"}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setRejectReasonOpen(true)}
                          disabled={approvingBenefit || rejectingBenefit}
                        >
                          {rejectingBenefit && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                          {lang === "ar" ? "رفض الإيصال" : "Reject Receipt"}
                        </Button>
                      </div>
                    )}
                    <Dialog
                      open={rejectReasonOpen}
                      onOpenChange={(open) => {
                        setRejectReasonOpen(open);
                        if (!open) setRejectReason("");
                      }}
                    >
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>
                            {lang === "ar" ? "رفض إيصال بنفت باي" : "Reject BenefitPay receipt"}
                          </DialogTitle>
                          <DialogDescription>
                            {lang === "ar"
                              ? "سيُرسل سبب الرفض للعميل، وستُحذف صورة الإيصال الخاصة فوراً."
                              : "The reason will be emailed to the customer and the private receipt image will be deleted immediately."}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                          <Label htmlFor="benefit-rejection-reason">
                            {lang === "ar" ? "سبب الرفض" : "Rejection reason"}
                          </Label>
                          <Textarea
                            id="benefit-rejection-reason"
                            value={rejectReason}
                            onChange={(event) => setRejectReason(event.target.value)}
                            maxLength={500}
                            dir={lang === "ar" ? "rtl" : "ltr"}
                            placeholder={
                              lang === "ar"
                                ? "مثال: الإيصال غير واضح أو لا يطابق مبلغ الطلب"
                                : "For example: receipt is unclear or does not match the order amount"
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            {rejectReason.trim().length}/500
                          </p>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setRejectReasonOpen(false)}
                          >
                            {lang === "ar" ? "إلغاء" : "Cancel"}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={rejectBenefitPayment}
                            disabled={rejectingBenefit || rejectReason.trim().length < 3}
                          >
                            {rejectingBenefit && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                            {lang === "ar"
                              ? "رفض الإيصال وإرسال السبب"
                              : "Reject and notify customer"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <Label>{lang === "ar" ? "تطبيق رمز خصم" : "Apply Promo Code"}</Label>
                  {appliedPromo ? (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                      <div className="flex min-w-0 items-center gap-2">
                        <Tag className="h-4 w-4 shrink-0" />
                        <span className="truncate font-mono font-semibold">
                          {appliedPromo.code}
                        </span>
                        <span className="text-xs">
                          − {formatMoney(appliedPromo.amount, currency)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={removeAdminPromo}
                        disabled={isReadOnly}
                        aria-label={lang === "ar" ? "إزالة رمز الخصم" : "Remove promo code"}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={promoInput}
                        onChange={(event) => setPromoInput(event.target.value.toUpperCase())}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void applyAdminPromo();
                          }
                        }}
                        placeholder="EID20"
                        className="uppercase"
                        disabled={isReadOnly || checkingPromo}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={applyAdminPromo}
                        disabled={isReadOnly || checkingPromo}
                      >
                        {checkingPromo && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                        {lang === "ar" ? "تطبيق" : "Apply"}
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {lang === "ar"
                      ? "يتم التحقق من أهلية العميل والمنتجات والحد الأقصى تلقائياً."
                      : "Customer eligibility, sale exclusions, and discount caps are checked automatically."}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label>{t("orderDetail.discount")}</Label>
                      {!appliedPromo && !isReadOnly && (
                        <div className="flex items-center rounded-md border p-0.5 text-xs bg-muted/40">
                          <button
                            type="button"
                            className={cn(
                              "px-2 py-0.5 rounded font-semibold transition-colors",
                              discountMode === "fixed"
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() => setDiscountMode("fixed")}
                          >
                            {currency}
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "px-2 py-0.5 rounded font-semibold transition-colors",
                              discountMode === "percent"
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() => {
                              setDiscountMode("percent");
                              if (totals.subtotal > 0 && order.discount > 0) {
                                const pct = (order.discount / totals.subtotal) * 100;
                                setDiscountPercentInput(pct.toFixed(1));
                              }
                            }}
                          >
                            %
                          </button>
                        </div>
                      )}
                    </div>
                    {discountMode === "percent" && !appliedPromo ? (
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          placeholder="10"
                          value={discountPercentInput}
                          disabled={isReadOnly}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDiscountPercentInput(val);
                            const pct = Number(val) || 0;
                            const calculated = Number(((totals.subtotal * pct) / 100).toFixed(3));
                            setOrder({ ...order, discount: calculated });
                          }}
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-bold">
                          %
                        </span>
                      </div>
                    ) : (
                      <Input
                        type="number"
                        step="0.001"
                        value={order.discount}
                        disabled={isReadOnly || !!appliedPromo}
                        onChange={(e) => setOrder({ ...order, discount: Number(e.target.value) })}
                      />
                    )}
                    {appliedPromo && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {lang === "ar"
                          ? "تم تثبيت الخصم بواسطة رمز الخصم."
                          : "Locked to the validated promo amount."}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>{t("orderDetail.shipping")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={order.shipping}
                      onChange={(e) => setOrder({ ...order, shipping: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>{t("orderDetail.taxRate")}</Label>
                    {!isReadOnly && (
                      <Button
                        type="button"
                        variant={Number(order.tax_rate) === 0 ? "secondary" : "outline"}
                        size="sm"
                        className="h-6 px-2 text-[11px] font-semibold"
                        onClick={() => {
                          if (Number(order.tax_rate) > 0) {
                            setLastNonZeroTaxRate(Number(order.tax_rate));
                            setOrder({ ...order, tax_rate: 0 });
                          } else {
                            setOrder({ ...order, tax_rate: lastNonZeroTaxRate || 10 });
                          }
                        }}
                      >
                        {Number(order.tax_rate) === 0
                          ? lang === "ar"
                            ? "✓ معفي من الضريبة"
                            : "✓ Tax Exempt"
                          : lang === "ar"
                            ? "إعفاء ضريبي (0%)"
                            : "Set Tax Exempt (0%)"}
                      </Button>
                    )}
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    value={order.tax_rate}
                    onChange={(e) => setOrder({ ...order, tax_rate: Number(e.target.value) })}
                  />
                  {Number(order.tax_rate) === 0 && (
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      {lang === "ar"
                        ? "🛡️ الطلب معفي من قيمة الضريبة المضافة (0%)"
                        : "🛡️ Order is exempt from VAT (0%)"}
                    </p>
                  )}
                </div>
                <div>
                  <Label>{t("orderDetail.advancePaid")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={order.advance_paid ?? 0}
                    onChange={(e) => setOrder({ ...order, advance_paid: Number(e.target.value) })}
                  />
                </div>
                {/* 1. Payment Control Block */}
                <div className="space-y-1.5 border-t border-border pt-4">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("orderDetail.paymentStatus")}
                  </Label>
                  <Select
                    value={order.payment_status ?? "unpaid"}
                    onValueChange={(v) => {
                      const updatedFulfillment =
                        v === "paid" &&
                        (!order.fulfillment_status ||
                          ["ON_HOLD", "on_hold", "unassigned"].includes(order.fulfillment_status))
                          ? "NEEDS_PACKING"
                          : order.fulfillment_status;
                      setOrder({
                        ...order,
                        payment_status: v,
                        fulfillment_status: updatedFulfillment,
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_BADGE_VALUES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {t(`payStatus.${v}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {isUnpaid && !isCod && (
                    <Button
                      type="button"
                      size="sm"
                      className="mt-1 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-1.5 shadow-sm"
                      onClick={() => {
                        const updatedFulfillment =
                          !order.fulfillment_status ||
                          ["ON_HOLD", "on_hold", "unassigned"].includes(order.fulfillment_status)
                            ? "NEEDS_PACKING"
                            : order.fulfillment_status;
                        setOrder({
                          ...order,
                          payment_status: "paid",
                          fulfillment_status: updatedFulfillment,
                        });
                        toast.success(
                          lang === "ar" ? "تم تسجيل الدفع بنجاح!" : "Order payment marked as Paid!",
                        );
                      }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {lang === "ar" ? "تسجيل كمدفوع" : "Mark as Paid"}
                    </Button>
                  )}
                </div>

                {/* 2. Fulfillment Control Block */}
                <div className="space-y-2 border-t border-border pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {lang === "ar" ? "حالة التجهيز والشحن" : "Fulfillment Status"}
                    </Label>
                    {isPickup ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800">
                        🏪 {lang === "ar" ? "استلام" : "Pickup"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800">
                        🚚 {lang === "ar" ? "توصيل" : "Delivery"}
                      </span>
                    )}
                  </div>

                  <Select
                    value={order.fulfillment_status ?? "ON_HOLD"}
                    onValueChange={(v) => {
                      const blocksFulfillment = ["SHIPPED", "NEEDS_PACKING"].includes(v);
                      if (blocksFulfillment && isUnpaid && !isCod && !adminOverrideChecked) {
                        toast.error(
                          lang === "ar"
                            ? "خطأ: لا يمكن شحن أو تجهيز طلب غير مدفوع! يرجى تأكيد الدفع أو تفعيل خيار تجاوز التحقق."
                            : "Error: Cannot ship or pack an unpaid order! Please approve payment or toggle the admin override.",
                        );
                        return;
                      }
                      setOrder({ ...order, fulfillment_status: v });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ON_HOLD">
                        {lang === "ar" ? "قيد الانتظار" : "On Hold"}
                      </SelectItem>
                      <SelectItem value="NEEDS_PACKING">
                        {lang === "ar" ? "بحاجة للتعبئة" : "Needs Packing"}
                      </SelectItem>
                      <SelectItem value="READY_FOR_PICKUP">
                        {lang === "ar" ? "جاهز للاستلام" : "Ready for Pickup"}
                      </SelectItem>
                      <SelectItem value="SHIPPED">
                        {lang === "ar" ? "تم الشحن" : "Shipped"}
                      </SelectItem>
                      <SelectItem value="COMPLETED">
                        {lang === "ar" ? "مكتمل" : "Completed"}
                      </SelectItem>
                      <SelectItem value="CANCELLED">
                        {lang === "ar" ? "ملغي" : "Cancelled"}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {isUnpaid && !isCod && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="admin-override-checkbox"
                        checked={adminOverrideChecked}
                        onChange={(e) => setAdminOverrideChecked(e.target.checked)}
                        className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                      />
                      <label
                        htmlFor="admin-override-checkbox"
                        className="text-xs text-muted-foreground select-none cursor-pointer"
                      >
                        {lang === "ar"
                          ? "تجاوز التحقق من الدفع يدوياً"
                          : "Override unpaid payment check"}
                      </label>
                    </div>
                  )}
                </div>
                <div className="space-y-1 border-t border-border pt-3 text-sm">
                  <Row
                    label={t("orderDetail.subtotal")}
                    value={formatMoney(totals.subtotal, currency)}
                  />
                  <Row
                    label={`${t("orderDetail.discount")}${order.promo_code ? ` (Promo: ${order.promo_code})` : ""}`}
                    value={`− ${formatMoney(totals.discount, currency)}`}
                  />
                  <Row
                    label={`${t("orderDetail.vat")} (${order.tax_rate}%)`}
                    value={formatMoney(totals.taxAmount, currency)}
                  />
                  <Row
                    label={t("orderDetail.shipping")}
                    value={formatMoney(totals.shipping, currency)}
                  />
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="font-display text-lg">{t("orderDetail.total")}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg">
                        {formatMoney(totals.total, currency)}
                      </span>
                      <span
                        className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${PAYMENT_BADGE_CLASSES[paymentBadge]}`}
                      >
                        {t(`payStatus.${paymentBadge}`)}
                      </span>
                    </div>
                  </div>
                  {totals.advancePaid > 0 && (
                    <>
                      <Row
                        label={t("orderDetail.advancePaid")}
                        value={`− ${formatMoney(totals.advancePaid, currency)}`}
                      />
                      <div className="flex justify-between pt-1 font-medium">
                        <span>{t("orderDetail.remaining")}</span>
                        <span>{formatMoney(totals.remaining, currency)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Card>
          </div>
        </div>
      </fieldset>

      {/* Floating Sticky Save Bar - Only appears when form has unsaved changes */}
      {!isReadOnly && isDirty && (
        <div className="no-print fixed bottom-4 inset-x-4 sm:inset-x-auto sm:end-8 z-50 flex items-center gap-3 rounded-2xl border border-amber-300/80 bg-amber-50/95 dark:bg-amber-950/90 p-3.5 shadow-2xl backdrop-blur animate-in slide-in-from-bottom duration-200 max-w-lg mx-auto">
          <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />
          <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex-1 min-w-0">
            {lang === "ar" ? "توجد تغييرات غير محفوظة على الطلب" : "Unsaved changes detected"}
          </span>
          <Button
            onClick={save}
            disabled={saving}
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md shrink-0 touch-manipulation"
          >
            {saving ? (
              <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="me-1.5 h-4 w-4" />
            )}
            {isCreationMode
              ? lang === "ar"
                ? "إنشاء وحفظ"
                : "Create & Save"
              : lang === "ar"
                ? "حفظ التغييرات"
                : "Save Changes"}
          </Button>
        </div>
      )}

      {/* Invoice Preview Section Anchor */}
      <div id="sec-invoice" className="scroll-mt-24">
        <div className="no-print mb-4 rounded-xl border bg-card">
          <button
            type="button"
            onClick={() => setInvoicePreviewOpen((open) => !open)}
            className="flex w-full items-center justify-between px-4 py-3 text-start font-medium hover:bg-muted/40"
            aria-expanded={invoicePreviewOpen}
          >
            <span>{lang === "ar" ? "معاينة الفاتورة" : "Preview Invoice"}</span>
            <span className="text-sm text-muted-foreground">{invoicePreviewOpen ? "−" : "+"}</span>
          </button>
        </div>
        <div className={invoicePreviewOpen ? "block" : "hidden print:block"}>
          {/* Printable invoice */}
          {(() => {
            const addrs = (addressesQ.data ?? []).filter((a) => a.customer_id === order.customer_id);
            const chosen =
              ((order as any).delivery_address_snapshot as SavedAddress | null) ??
              addrs.find((a) => a.id === order.shipping_address_id) ??
              addrs.find((a) => a.is_default) ??
              null;
            return (
              <InvoicePreview
                order={{
                  ...order,
                  subtotal: totals.subtotal,
                  tax_amount: totals.taxAmount,
                  total: totals.total,
                  advance_paid: totals.advancePaid,
                }}
                items={items}
                settings={settingsQ.data}
                shippingAddress={chosen}
                paymentBadge={paymentBadge}
              />
            );
          })()}
        </div>
      </div>

      {/* Activity Trail Section Anchor */}
      <div id="sec-activity" className="scroll-mt-24 max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 no-print">
        <ActivityLogList orderId={order.id} scope="order" brandId={brand.id} />
      </div>

      <CourierWhatsAppModal
        isOpen={waModalOpen}
        onClose={() => setWaModalOpen(false)}
        order={orderQ.data || order}
        courier={
          (couriersQ.data ?? []).find((c: any) => c.id === order.assigned_to) ||
          (order.assigned_profile as any) ||
          null
        }
        brandSlug={slug}
        lang={lang}
        onNotified={() => orderQ.refetch()}
      />

      {/* Product Search & Autocomplete Modal */}
      <Dialog open={productSearchOpen} onOpenChange={setProductSearchOpen}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4 text-primary" />
              {lang === "ar" ? "البحث عن منتج أو SKU أو باركود" : "Search Product, SKU, or Barcode"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder={
                  lang === "ar"
                    ? "اكتب للبحث بالاسم، الرمز (SKU)، المقاس، أو الباركود..."
                    : "Type product title, SKU, size, or barcode..."
                }
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                className="ps-9 h-10 text-sm font-medium"
              />
              {productSearchQuery && (
                <button
                  type="button"
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  onClick={() => setProductSearchQuery("")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="max-h-[380px] overflow-y-auto space-y-2 pe-1">
              {filteredVariantsForSearch.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {lang === "ar"
                    ? `لم يتم العثور على منتجات تطابق "${productSearchQuery}"`
                    : `No products found matching "${productSearchQuery}"`}
                </div>
              ) : (
                filteredVariantsForSearch.map((v: any) => {
                  const p = (productsQ.data ?? []).find((x: any) => x.id === v.product_id);
                  const title = (p as any)?.name || "Product";
                  const sku = v.sku || (p as any)?.sku;
                  const mainStock = Number(v.stock_main ?? 0);
                  const incStock = Number(v.stock_incubator ?? 0);
                  const fallbackStock = Number(v.stock ?? v.quantity ?? (p as any)?.stock ?? 0);
                  const totalStock = (mainStock + incStock) > 0 ? (mainStock + incStock) : fallbackStock;
                  const price = Number(
                    v.selling_price ??
                      v.price_override ??
                      v.price ??
                      (p as any)?.selling_price ??
                      (p as any)?.base_price ??
                      (p as any)?.price ??
                      0,
                  );
                  const getMediaUrl = (obj: any) => {
                    if (!obj) return null;
                    if (typeof obj.image_url === "string" && obj.image_url) return obj.image_url;
                    if (typeof obj.image === "string" && obj.image) return obj.image;
                    if (Array.isArray(obj.images) && obj.images[0]) return obj.images[0];
                    return null;
                  };
                  const img = getMediaUrl(v) || getMediaUrl(p);

                  return (
                    <div
                      key={v.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border/70 hover:border-primary/60 hover:bg-primary/5 cursor-pointer transition-all"
                      onClick={() => handleSelectVariantFromModal(v)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-11 w-11 rounded-lg border bg-muted/40 overflow-hidden shrink-0 flex items-center justify-center">
                          {img ? (
                            <img src={img} alt={title} className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-xs sm:text-sm text-foreground truncate">
                            {title}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                            {sku && (
                              <span className="font-mono bg-muted/80 px-1.5 py-0.5 rounded text-[10px]">
                                {sku}
                              </span>
                            )}
                            {(v.size || v.color) && (
                              <span>
                                {[v.size, v.color].filter(Boolean).join(" / ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-end shrink-0">
                        <p className="font-bold text-sm text-foreground">
                          {formatMoney(price, currency)}
                        </p>
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded inline-block mt-0.5",
                            totalStock > 0
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
                          )}
                        >
                          {totalStock > 0
                            ? `${lang === "ar" ? "متوفر" : "In Stock"}: ${totalStock}`
                            : lang === "ar"
                              ? "نفذت الكمية"
                              : "Out of Stock"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Inline New Customer Dialog */}
      <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              {lang === "ar" ? "إضافة زبون جديد" : "Create New Customer"}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "أدخل بيانات الزبون وسيتم تعيينه مباشرة لهذا الطلب بدون فقدان التغييرات."
                : "Enter customer details. They will be assigned to this order draft immediately."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>{lang === "ar" ? "اسم الزبون *" : "Full Name *"}</Label>
              <Input
                placeholder={lang === "ar" ? "مثال: علي محمد" : "e.g. Ali Mohamed"}
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>{lang === "ar" ? "رقم الهاتف" : "Phone Number"}</Label>
                <Input
                  dir="ltr"
                  placeholder="33000000"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                />
              </div>
              <div>
                <Label>{lang === "ar" ? "البريد الإلكتروني" : "Email Address"}</Label>
                <Input
                  dir="ltr"
                  placeholder="ali@example.com"
                  value={newCustEmail}
                  onChange={(e) => setNewCustEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {lang === "ar" ? "عنوان التوصيل الافتراضي" : "Default Delivery Address"}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder={lang === "ar" ? "المنطقة (مثال: المنامة)" : "Region (e.g. Manama)"}
                  value={newCustRegion}
                  onChange={(e) => setNewCustRegion(e.target.value)}
                />
                <Input
                  placeholder={lang === "ar" ? "المجمع (مثال: 321)" : "Block (e.g. 321)"}
                  value={newCustBlock}
                  onChange={(e) => setNewCustBlock(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  placeholder={lang === "ar" ? "الطريق" : "Road"}
                  value={newCustRoad}
                  onChange={(e) => setNewCustRoad(e.target.value)}
                />
                <Input
                  placeholder={lang === "ar" ? "المنزل" : "House"}
                  value={newCustHouse}
                  onChange={(e) => setNewCustHouse(e.target.value)}
                />
                <Input
                  placeholder={lang === "ar" ? "الشقة" : "Flat"}
                  value={newCustFlat}
                  onChange={(e) => setNewCustFlat(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewCustomerOpen(false)}
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile Sticky Action Footer Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-background/95 backdrop-blur border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.08)] sm:hidden flex items-center justify-between gap-3 no-print">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
            {lang === "ar" ? "المبلغ الإجمالي" : "Total Due"}
          </span>
          <span className="font-black text-base text-foreground tabular-nums truncate">
            {formatMoney(totals.total, currency)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {order.public_invoice_token && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs font-semibold"
              onClick={copyLink}
            >
              <Copy className="h-3.5 w-3.5 me-1" />
              {lang === "ar" ? "الرابط" : "Link"}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={save}
            className="h-9 px-4 bg-primary text-primary-foreground font-bold shadow-md text-xs"
          >
            {saving && <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />}
            {isBlankDraft
              ? lang === "ar"
                ? "حفظ كمسودة"
                : "Save Draft"
              : lang === "ar"
                ? "حفظ التغييرات"
                : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

const INVOICE_LABELS = {
  en: {
    invoice: "INVOICE",
    invoiceNumber: "Invoice #",
    date: "Date",
    status: "Status",
    billTo: "Bill to",
    paymentMethod: "Payment method",
    vatLabel: "VAT",
    item: "Item",
    description: "Description",
    qty: "Qty",
    unit: "Unit Price",
    price: "Price",
    total: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    vat: "VAT",
    shipping: "Shipping",
    grandTotal: "Grand Total",
    notes: "Notes",
    warmRegards: "Warm regards",
    language: "Language",
    english: "English",
    arabic: "العربية",
  },
  ar: {
    invoice: "فاتورة",
    invoiceNumber: "رقم الفاتورة",
    date: "التاريخ",
    status: "الحالة",
    billTo: "فاتورة إلى",
    paymentMethod: "طريقة الدفع",
    vatLabel: "الرقم الضريبي",
    item: "الصنف",
    description: "الوصف",
    qty: "الكمية",
    unit: "سعر الوحدة",
    price: "السعر",
    total: "الإجمالي",
    subtotal: "المجموع الفرعي",
    discount: "الخصم",
    vat: "ضريبة القيمة المضافة",
    shipping: "الشحن",
    grandTotal: "الإجمالي الكلي",
    notes: "ملاحظات",
    warmRegards: "مع أطيب التحيات",
    language: "اللغة",
    english: "English",
    arabic: "العربية",
  },
} as const;
const BRAND: Record<"en" | "ar", string> = { en: "Boutq", ar: "بوتك" };
const LEGACY_BRAND_NAMES = new Set(["Abaya Atelier", "أباية أتيليه"]);
function brandFor(lang: "en" | "ar", stored?: string | null) {
  const s = (stored ?? "").trim();
  if (!s || LEGACY_BRAND_NAMES.has(s)) return BRAND[lang];
  return s;
}

const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  draft: { en: "Draft", ar: "مسودة" },
  confirmed: { en: "Confirmed", ar: "مؤكدة" },
  paid: { en: "Paid", ar: "مدفوعة" },
  pending: { en: "Pending", ar: "قيد الانتظار" },
  shipped: { en: "Shipped", ar: "تم الشحن" },
  completed: { en: "Completed", ar: "مكتملة" },
  cancelled: { en: "Cancelled", ar: "ملغاة" },
  refunded: { en: "Refunded", ar: "مستردة" },
};

const PAYMENT_LABELS: Record<string, { en: string; ar: string }> = {
  cash: { en: "Cash", ar: "نقدًا" },
  card: { en: "Card", ar: "بطاقة" },
  bank_transfer: { en: "Bank transfer", ar: "تحويل بنكي" },
  transfer: { en: "Bank transfer", ar: "تحويل بنكي" },
  benefit: { en: "Benefit", ar: "بنفت" },
  apple_pay: { en: "Apple Pay", ar: "أبل باي" },
  google_pay: { en: "Google Pay", ar: "جوجل باي" },
  cod: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
};

function tStatus(s: string | null | undefined, lang: "en" | "ar") {
  if (!s) return "";
  return STATUS_LABELS[s]?.[lang] ?? s;
}
function tPayment(s: string | null | undefined, lang: "en" | "ar") {
  if (!s) return "";
  return PAYMENT_LABELS[s]?.[lang] ?? s;
}

// Localize numerals (Arabic-Indic) inside a rendered money/number string
function toArabicDigits(str: string) {
  const map = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return str.replace(/[0-9]/g, (d) => map[+d]);
}

function InvoiceBranchName({
  brandId,
  branchId,
  isRTL,
}: {
  brandId: string;
  branchId: string;
  isRTL: boolean;
}) {
  const q = useQuery({
    queryKey: ["branch", brandId, branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches" as any)
        .select("name_ar, name_en, location_ar, location_en")
        .eq("id", branchId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!branchId,
  });
  const b = q.data;
  if (!b) return null;
  const name = isRTL ? b.name_ar || b.name_en : b.name_en || b.name_ar;
  const loc = isRTL ? b.location_ar || b.location_en : b.location_en || b.location_ar;
  return (
    <p className="text-sm" style={{ opacity: 0.85 }}>
      {name}
      {loc ? ` — ${loc}` : ""}
    </p>
  );
}

function InvoicePreview({
  order,
  items,
  settings,
  shippingAddress,
  paymentBadge,
}: {
  order: any;
  items: Item[];
  settings: any;
  shippingAddress?: SavedAddress | null;
  paymentBadge?: PaymentBadge;
}) {
  const currency = order.currency;
  const color = settings.primary_color || "#8b6f47";
  const bg = settings.background_color || "#ffffff";
  const text = settings.text_color || "#1a1a1a";
  const fontSize = Number(settings.font_size) || 14;
  const logoX = Number(settings.logo_x) || 0;
  const logoY = Number(settings.logo_y) || 0;
  const logoW = Number(settings.logo_width) || 160;
  const logoH = Number(settings.logo_height) || 64;
  const template = settings.invoice_template || "modern";
  const secondary = settings.invoice_secondary_color || `${color}10`;

  const [invoiceLang, setInvoiceLang] = useState<"en" | "ar">("en");
  const L = INVOICE_LABELS[invoiceLang];
  const isRTL = invoiceLang === "ar";
  const locale = isRTL ? "ar-BH-u-nu-latn" : "en-US";
  const money = (n: number) => {
    const s = formatMoney(n, currency, locale);
    return isRTL ? toArabicDigits(s) : s;
  };
  const num = (n: number | string) => (isRTL ? toArabicDigits(String(n)) : String(n));

  const family = isRTL
    ? `"Tajawal", "Cairo", sans-serif`
    : settings.font_family === "Custom (uploaded)"
      ? "'InvoiceCustomFont', sans-serif"
      : `"${settings.font_family || "Cormorant Garamond"}", serif`;

  return (
    <div className="space-y-2">
      {/* Invoice controls (not printed) */}
      <div className="print:hidden flex flex-wrap items-center justify-end gap-2">
        <Label className="text-xs text-muted-foreground">{L.language}:</Label>
        <div className="inline-flex rounded-md border border-input overflow-hidden">
          <button
            type="button"
            onClick={() => setInvoiceLang("en")}
            className={`px-3 py-1 text-xs ${invoiceLang === "en" ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            {L.english}
          </button>
          <button
            type="button"
            onClick={() => setInvoiceLang("ar")}
            className={`px-3 py-1 text-xs ${invoiceLang === "ar" ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            {L.arabic}
          </button>
        </div>
      </div>

      <div
        dir={isRTL ? "rtl" : "ltr"}
        lang={invoiceLang}
        className={`printable-invoice pdf-invoice-root overflow-hidden ${template === "minimal" ? "" : "rounded-lg border border-border shadow-lg"}`}
        style={
          {
            backgroundColor: bg,
            color: text,
            fontFamily: family,
            fontSize: `${fontSize}px`,
            printColorAdjust: "exact",
            WebkitPrintColorAdjust: "exact",
          } as any
        }
      >
        {settings.font_url && !isRTL && (
          <style>{`@font-face { font-family: 'InvoiceCustomFont'; src: url('${settings.font_url}'); font-display: swap; }`}</style>
        )}
        {/* Browser print overrides removed — PDF is generated via html2pdf directly from the live DOM,
            preserving the exact colors and typography configured by the user. */}
        <div
          className="pdf-invoice-body p-4 sm:p-8 md:p-10 print:p-10 relative"
          style={{
            position: "relative",
            borderTop:
              template === "minimal"
                ? "0"
                : template === "classic"
                  ? `2px solid ${color}`
                  : `8px solid ${color}`,
          }}
        >
          {/* Payment Status Ink Stamp Watermark */}
          {order.payment_status === "paid" ? (
            <div className="absolute top-[10%] right-[10%] md:right-[15%] rotate-[-12deg] select-none pointer-events-none opacity-20 print:opacity-30 z-10">
              <div className="border-[6px] border-double border-emerald-600 text-emerald-600 font-extrabold text-2xl md:text-3xl tracking-widest uppercase py-2 px-6 rounded-xl font-sans flex flex-col items-center justify-center leading-none">
                <span>{invoiceLang === "ar" ? "مدفوع" : "PAID"}</span>
                {order.updated_at && (
                  <span className="text-[10px] md:text-xs font-semibold tracking-normal mt-1 opacity-90 font-mono">
                    {new Date(order.updated_at).toLocaleDateString(
                      invoiceLang === "ar" ? "ar-BH-u-nu-latn" : "en-BH",
                    )}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="absolute top-[10%] right-[10%] md:right-[15%] rotate-[-12deg] select-none pointer-events-none opacity-20 print:opacity-30 z-10">
              <div className="border-[6px] border-double border-rose-600 text-rose-600 font-extrabold text-2xl md:text-3xl tracking-widest uppercase py-2 px-6 rounded-xl font-sans flex flex-col items-center justify-center leading-none">
                <span>{invoiceLang === "ar" ? "غير مدفوع" : "UNPAID"}</span>
                <span className="text-[9px] md:text-[10px] font-semibold tracking-normal mt-1 uppercase font-mono text-center">
                  {invoiceLang === "ar" ? "الرجاء التحويل البنكي" : "Bank Transfer Req."}
                </span>
              </div>
            </div>
          )}
          {/*
            Layout rule:
            - EN (LTR): brand block on the LEFT, invoice meta on the RIGHT
            - AR (RTL): brand block on the RIGHT, invoice meta on the LEFT
            Natural flex-row mirrors correctly from the document direction.
          */}
          <div className="pdf-invoice-header flex flex-row justify-between items-start mb-8 md:mb-10 gap-4 md:gap-6 print:flex-row">
            <div className="pdf-brand-block w-[48%] min-w-0" style={{ textAlign: "start" }}>
              {settings.logo_url && (
                <div
                  className="pdf-brand-logo-wrap relative mb-3 flex"
                  style={{ height: logoH + logoY + 8, justifyContent: "flex-start" }}
                >
                  <img
                    src={settings.logo_url}
                    alt="logo"
                    className="pdf-brand-logo"
                    draggable={false}
                    style={{
                      position: "absolute",
                      insetInlineStart: logoX,
                      top: logoY,
                      width: logoW,
                      height: logoH,
                      objectFit: "contain",
                    }}
                  />
                </div>
              )}
              <p className="font-semibold">{settings.business_name}</p>
              {settings.invoice_show_business_details !== false && (
                <div className="text-xs mt-1 space-y-0.5" style={{ opacity: 0.7 }}>
                  {settings.address && <p>{settings.address}</p>}
                  {settings.phone && (
                    <p
                      dir="ltr"
                      style={{ unicodeBidi: "isolate", textAlign: isRTL ? "right" : "left" }}
                    >
                      {settings.phone}
                    </p>
                  )}
                  {settings.email && (
                    <p
                      dir="ltr"
                      style={{ unicodeBidi: "isolate", textAlign: isRTL ? "right" : "left" }}
                    >
                      {settings.email}
                    </p>
                  )}
                  {settings.vat_number && (
                    <p>
                      {isRTL ? "الرقم الضريبي" : "VAT"}: {settings.vat_number}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="pdf-meta-block w-[48%] min-w-0" style={{ textAlign: "end" }}>
              <h1
                className={`text-3xl sm:text-4xl font-display ${isRTL ? "" : "tracking-tight"}`}
                style={{
                  color,
                  letterSpacing: isRTL ? "normal" : undefined,
                  textTransform: "none",
                }}
              >
                {(isRTL ? settings.invoice_title_ar : settings.invoice_title_en) || L.invoice}
              </h1>
              <p className="text-lg mt-1">
                {L.invoiceNumber}: {num(order.invoice_number)}
              </p>
              <p className="text-xs mt-2" style={{ opacity: 0.7 }}>
                {L.date}:{" "}
                {formatDate(
                  order.created_at ?? order.order_date,
                  isRTL ? "ar-BH-u-nu-latn" : "en-BH",
                )}
              </p>
              <p className="text-xs" style={{ opacity: 0.7 }}>
                {L.status}: {PAYMENT_BADGE_LABEL[paymentBadge ?? "unpaid"][invoiceLang]}
              </p>
              {order.payment_method && (
                <p className="text-xs" style={{ opacity: 0.7 }}>
                  {L.paymentMethod}: {tPayment(order.payment_method, invoiceLang)}
                </p>
              )}
            </div>
          </div>

          {order.customers && (
            <div className="mb-8" style={{ textAlign: "start" }}>
              <p
                className={`text-xs mb-1 ${isRTL ? "" : "uppercase tracking-wider"}`}
                style={{ opacity: 0.6, letterSpacing: isRTL ? "normal" : undefined }}
              >
                {L.billTo}
              </p>
              <p className="font-medium">{getOrderCustomerName(order)}</p>
              {settings.invoice_show_customer_contact !== false && getOrderCustomerPhone(order) && (
                <p
                  dir="ltr"
                  className="text-sm"
                  style={{
                    opacity: 0.75,
                    unicodeBidi: "isolate",
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {num(getOrderCustomerPhone(order))}
                </p>
              )}
              {settings.invoice_show_customer_contact !== false && getOrderCustomerEmail(order) && (
                <p
                  dir="ltr"
                  className="text-sm"
                  style={{ opacity: 0.75, textAlign: isRTL ? "right" : "left" }}
                >
                  {getOrderCustomerEmail(order)}
                </p>
              )}
              {(() => {
                const detailed = shippingAddress
                  ? formatAddressDetailed(shippingAddress as StructuredAddress, invoiceLang)
                  : "";
                const legacy = !detailed ? formatDeliveryAddress(order.customers, invoiceLang) : [];
                if (!detailed && legacy.length === 0) return null;
                return (
                  <div className="mt-3 pt-3 border-t border-neutral-200">
                    <p
                      className={`text-xs mb-1 ${isRTL ? "" : "uppercase tracking-wider"}`}
                      style={{ opacity: 0.6, letterSpacing: isRTL ? "normal" : undefined }}
                    >
                      {isRTL ? "عنوان التوصيل" : "Delivery address"}
                    </p>
                    {detailed ? (
                      <p className="text-sm leading-relaxed" style={{ opacity: 0.85 }}>
                        {isRTL ? toArabicDigits(detailed) : detailed}
                      </p>
                    ) : (
                      legacy.map((l, i) => (
                        <p
                          key={i}
                          className="text-sm whitespace-pre-line"
                          style={{ opacity: 0.85 }}
                        >
                          {isRTL ? toArabicDigits(l) : l}
                        </p>
                      ))
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {settings.invoice_show_fulfillment !== false &&
            (order.fulfillment_method || order.branch_id) && (
              <div
                className="mb-6 rounded-lg p-4 text-sm"
                style={{ textAlign: "start", backgroundColor: secondary }}
              >
                <p
                  className={`text-xs mb-1 ${isRTL ? "" : "uppercase tracking-wider"}`}
                  style={{ opacity: 0.6, letterSpacing: isRTL ? "normal" : undefined }}
                >
                  {isRTL ? "طريقة التسليم" : "Fulfillment"}
                </p>
                <p>
                  {order.fulfillment_method === "digital"
                    ? isRTL
                      ? "تسليم رقمي"
                      : "Digital delivery"
                    : order.fulfillment_method === "pickup"
                      ? isRTL
                        ? "استلام من الفرع"
                        : "Pickup from branch"
                      : isRTL
                        ? "توصيل"
                        : "Delivery"}
                </p>
                {order.fulfillment_method === "digital" && (
                  <div className="mt-2 rounded-md border border-neutral-200 p-3">
                    <p
                      className={`text-xs ${isRTL ? "" : "uppercase tracking-wider"}`}
                      style={{ opacity: 0.6, letterSpacing: isRTL ? "normal" : undefined }}
                    >
                      {isRTL ? "قناة التسليم الرقمي" : "Digital delivery channel"}
                    </p>
                    <p className="font-medium">
                      {order.digital_delivery_channel === "whatsapp"
                        ? isRTL
                          ? "واتساب"
                          : "WhatsApp"
                        : isRTL
                          ? "البريد الإلكتروني"
                          : "Email"}
                    </p>
                    <p className="mt-1 break-all" dir="ltr">
                      {order.digital_delivery_contact || "—"}
                    </p>
                  </div>
                )}
                {order.branch_id && (
                  <InvoiceBranchName
                    brandId={order.brand_id}
                    branchId={order.branch_id}
                    isRTL={isRTL}
                  />
                )}
              </div>
            )}

          <div className="pdf-table-wrap -mx-4 sm:mx-0 overflow-x-auto print:overflow-visible print:mx-0">
            <table className="pdf-line-items w-full min-w-[520px] text-sm mb-6">
              <thead>
                <tr style={{ backgroundColor: color, color: "#ffffff" }}>
                  <th className="text-start p-3">{L.description}</th>
                  <th className="text-end p-3 w-16">{L.qty}</th>
                  <th className="text-end p-3 w-28">{L.unit}</th>
                  <th className="text-end p-3 w-28">{L.total}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b border-neutral-200 align-top">
                    <td className="p-3 text-start">
                      {(() => {
                        const raw = (it.description || "—")
                          .split(/\r?\n/)
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const [head, ...rest] = raw.length ? raw : ["—"];
                        return (
                          <>
                            <p className="font-medium">{head}</p>
                            {rest.length > 0 && (
                              <div className="text-xs mt-0.5 leading-snug" style={{ opacity: 0.7 }}>
                                {rest.map((line, li) => (
                                  <div key={li}>{line}</div>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {it.customizations.length > 0 && (
                        <ul className="mt-1 text-xs space-y-0.5" style={{ opacity: 0.75 }}>
                          {it.customizations.map((c, ci) => (
                            <li key={ci}>
                              + {c.name} ({money(c.price_delta)})
                            </li>
                          ))}
                        </ul>
                      )}
                      {it.selected_variant &&
                        (it.selected_variant.size ||
                          it.selected_variant.color ||
                          it.selected_variant.fabric) && (
                          <p className="mt-1 text-xs" style={{ opacity: 0.75 }}>
                            {[
                              it.selected_variant.size &&
                                `${isRTL ? "المقاس" : "Size"}: ${it.selected_variant.size}`,
                              it.selected_variant.color &&
                                `${isRTL ? "اللون" : "Color"}: ${it.selected_variant.color}`,
                              it.selected_variant.fabric &&
                                `${isRTL ? "القماش" : "Fabric"}: ${it.selected_variant.fabric}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      {it.custom_field_values && it.custom_field_values.length > 0 && (
                        <ul className="mt-1 text-xs space-y-0.5" style={{ opacity: 0.75 }}>
                          {it.custom_field_values.map((cf, ci) => (
                            <li key={ci}>
                              {isRTL
                                ? cf.label_ar || cf.label_en || cf.key
                                : cf.label_en || cf.label_ar || cf.key}
                              :{" "}
                              {cf.value.startsWith("http") ? (
                                <a
                                  href={cf.value}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:underline font-semibold inline-flex items-center gap-1"
                                >
                                  📎 {isRTL ? "تحميل/عرض الملف" : "View File"}
                                </a>
                              ) : (
                                cf.value
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="p-3 text-end">{num(it.quantity)}</td>
                    <td className="p-3 text-end whitespace-nowrap">
                      {Number(it.original_price ?? 0) > Number(it.unit_price) ? (
                        <span className="inline-flex flex-col items-end leading-tight">
                          <span className="text-xs line-through" style={{ opacity: 0.6 }}>
                            {money(Number(it.original_price) + it.customization_total)}
                          </span>
                          <span>{money(it.unit_price + it.customization_total)}</span>
                        </span>
                      ) : (
                        money(it.unit_price + it.customization_total)
                      )}
                    </td>
                    <td className="p-3 font-medium text-end whitespace-nowrap">
                      {money(it.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals stay on the physical left side in both languages. */}
          <div
            className="pdf-totals-row flex"
            style={{ justifyContent: isRTL ? "flex-start" : "flex-end", direction: "ltr" }}
          >
            <div
              className="pdf-totals-block w-72 text-sm space-y-1"
              style={{ direction: isRTL ? "rtl" : "ltr" }}
            >
              <div className="flex justify-between">
                <span style={{ opacity: 0.75 }}>{L.subtotal}</span>
                <span>{money(order.subtotal)}</span>
              </div>
              {Number(order.discount) > 0 && (
                <div className="flex justify-between gap-4">
                  <span style={{ opacity: 0.75 }}>
                    {L.discount}
                    {order.promo_code ? ` (Promo: ${order.promo_code})` : ""}
                  </span>
                  <span>− {money(order.discount)}</span>
                </div>
              )}
              {Number(order.tax_rate) > 0 && (
                <div className="flex justify-between">
                  <span style={{ opacity: 0.75 }}>
                    {L.vat} ({num(order.tax_rate)}%)
                  </span>
                  <span>{money(order.tax_amount)}</span>
                </div>
              )}
              {Number(order.shipping) > 0 && (
                <div className="flex justify-between">
                  <span style={{ opacity: 0.75 }}>{L.shipping}</span>
                  <span>{money(order.shipping)}</span>
                </div>
              )}
              <div
                className="flex justify-between items-center pt-2 border-t-2"
                style={{ borderColor: color }}
              >
                <span className="font-display text-lg" style={{ color }}>
                  {invoiceLang === "ar" ? "المبلغ الإجمالي" : "Total Amount"}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg" style={{ color }}>
                    {money(order.total)}
                  </span>
                  {paymentBadge && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${isRTL ? "" : "uppercase tracking-wider"} ${PAYMENT_BADGE_CLASSES[paymentBadge]}`}
                      style={{ letterSpacing: isRTL ? "normal" : undefined }}
                    >
                      {PAYMENT_BADGE_LABEL[paymentBadge][invoiceLang]}
                    </span>
                  )}
                </div>
              </div>
              {Number(order.advance_paid) > 0 && (
                <>
                  <div className="flex justify-between pt-1">
                    <span style={{ opacity: 0.75 }}>
                      {invoiceLang === "ar" ? "المبلغ المقدم المدفوع" : "Advance Paid"}
                    </span>
                    <span>− {money(order.advance_paid)}</span>
                  </div>
                  <div
                    className="flex justify-between items-center rounded-md px-2 py-1 mt-1 font-semibold"
                    style={{ backgroundColor: `${color}1a`, color }}
                  >
                    <span>{invoiceLang === "ar" ? "المتبقي للاستحقاق" : "Remaining Due"}</span>
                    <span>
                      {money(Math.max(0, Number(order.total) - Number(order.advance_paid)))}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {settings.invoice_show_notes !== false && (order.notes || settings.footer_note) && (
            <div
              className="mt-10 pt-6 border-t border-neutral-200 text-sm space-y-2"
              style={{ opacity: 0.85 }}
            >
              {order.notes && (
                <p>
                  <strong>{L.notes}: </strong>
                  {order.notes}
                </p>
              )}
              {settings.footer_note && <p className="italic">{settings.footer_note}</p>}
              <p className="italic">
                {L.warmRegards},<br />
                {brandFor(invoiceLang, settings.business_name)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Tpl = {
  id: string;
  name: string;
  channel: "email" | "whatsapp" | "both";
  subject: string | null;
  body: string;
  is_default: boolean;
};

function ResendConfirmationEmailButton({
  order,
  lang,
  onDone,
}: {
  order: any;
  lang: "ar" | "en";
  onDone: () => void;
}) {
  const [sending, setSending] = useState(false);
  const status: string = order?.confirmation_email_status ?? "pending";
  const sentAt = order?.confirmation_email_sent_at as string | null | undefined;
  const err = order?.confirmation_email_error as string | null | undefined;

  const color =
    status === "sent"
      ? "text-green-600"
      : status === "failed"
        ? "text-destructive"
        : "text-muted-foreground";

  const label =
    lang === "ar"
      ? status === "sent"
        ? "إعادة إرسال البريد"
        : status === "failed"
          ? "إعادة المحاولة"
          : "إرسال بريد التأكيد"
      : status === "sent"
        ? "Resend confirmation email"
        : status === "failed"
          ? "Retry confirmation email"
          : "Send confirmation email";

  const title = err
    ? `${lang === "ar" ? "فشل: " : "Failed: "}${err}`
    : sentAt
      ? `${lang === "ar" ? "أُرسل: " : "Sent: "}${new Date(sentAt).toLocaleString()}`
      : undefined;

  const onClick = async () => {
    if (!order?.id) return;
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const { data, error } = await supabase.functions.invoke("send-order-email", {
        body: { order_id: order.id, lang, wait_for_delivery: true },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      toast.success(
        lang === "ar"
          ? "تم قبول بريد العميل للإرسال. راجع سجل المراسلات لمتابعة الحالة."
          : "Customer email accepted by the provider. Track it in Communications.",
      );
    } catch (e: any) {
      toast.error(e?.message ?? (lang === "ar" ? "فشل الإرسال" : "Failed to send"));
    } finally {
      setSending(false);
      onDone();
    }
  };

  return (
    <Button variant="outline" onClick={onClick} disabled={sending} title={title}>
      {sending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Mail className={`h-4 w-4 mr-2 ${color}`} />
      )}
      {label}
    </Button>
  );
}

function renderTemplate(str: string, vars: Record<string, string>) {
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

function defaultBody() {
  return `Hi {{customer_name}},

Thank you for your order with {{business_name}}. Please find your invoice details below:

Invoice #: {{invoice_number}}
Date: {{date}}
Total: {{total}}

Please let us know if you have any questions.

Warm regards,
{{business_name}}`;
}

function SendInvoiceDialog({
  order,
  totals,
  settings,
  currency,
}: {
  order: any;
  totals: any;
  settings: any;
  currency: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const qc = useQueryClient();

  const vars = useMemo(
    () => ({
      customer_name: getOrderCustomerName(order) || "there",
      customer_email: getOrderCustomerEmail(order),
      customer_phone: getOrderCustomerPhone(order),
      business_name: brandFor("en", settings?.business_name),
      invoice_number: String(order?.invoice_number ?? ""),
      date: formatDate(order?.created_at ?? order?.order_date, "en-BH"),
      total: formatMoney(totals.total, currency),
      notes: order?.notes ?? "",
    }),
    [order, totals, settings, currency],
  );

  const brand = useBrand();
  const brandId = brand.id;
  const templatesQ = useQuery({
    queryKey: ["message-templates", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Tpl[];
    },
  });

  const [selectedId, setSelectedId] = useState<string>("__default");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  // Refresh fields from customer + selected template whenever dialog opens or selection/order changes
  useEffect(() => {
    if (!open) return;
    setPhone(getOrderCustomerPhone(order));
    const tpl = templatesQ.data?.find((t) => t.id === selectedId);
    const rawBody = tpl?.body ?? defaultBody();
    setMessage(renderTemplate(rawBody, vars));
  }, [open, selectedId, templatesQ.data, vars, order]);

  // Auto-pick default template once loaded
  useEffect(() => {
    if (selectedId !== "__default") return;
    const def = templatesQ.data?.find((t) => t.is_default);
    if (def) setSelectedId(def.id);
  }, [templatesQ.data, selectedId]);

  const openWhatsApp = () => {
    const digits = (phone || "").replace(/[^\d]/g, "");
    if (!digits)
      return toast.error(
        "This customer has no phone on file — add it in Customers or type one here (with country code)",
      );
    // Explicitly inject the live invoice link (same URL as the "Copy invoice link" button)
    // into the {{Dynamic Invoice Link}} placeholder before encoding for WhatsApp.
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const invoiceLink = `${origin}/invoice/${order.public_invoice_token}`;
    const finalMessage = message.replace(/\{\{\s*Dynamic Invoice Link\s*\}\}/g, invoiceLink);
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(finalMessage)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Send className="h-4 w-4 mr-2" /> {t("orderDetail.sendInvoiceWa")}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("orderDetail.sendInvoiceWa")}</DialogTitle>
            <DialogDescription>
              Pick a template, tweak the message, then open WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label>Template</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default">— Built-in default —</SelectItem>
                  {(templatesQ.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.is_default ? " ★" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
              Manage
            </Button>
          </div>

          <div className="space-y-3 mt-4">
            <div>
              <Label>Phone (country code + number)</Label>
              <PhoneInput value={phone} onChange={setPhone} />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea rows={10} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Opens WhatsApp Web or the WhatsApp app with the message pre-filled — you send it
              manually. Attach the printed PDF there if needed.
            </p>
            <DialogFooter>
              <Button onClick={openWhatsApp}>
                <Send className="h-4 w-4 mr-2" /> Open WhatsApp
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>



      <ManageTemplatesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        templates={templatesQ.data ?? []}
        onChanged={() => qc.invalidateQueries({ queryKey: ["message-templates"] })}
      />
    </>
  );
}

function ManageTemplatesDialog({
  open,
  onOpenChange,
  templates,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templates: Tpl[];
  onChanged: () => void;
}) {
  const { lang } = useI18n();
  const [editing, setEditing] = useState<Partial<Tpl> | null>(null);

  const startNew = () =>
    setEditing({ name: "", channel: "both", subject: "", body: defaultBody(), is_default: false });

  const save = async () => {
    if (!editing?.name || !editing?.body)
      return toast.error(lang === "ar" ? "الاسم والمحتوى مطلوبان" : "Name and body are required");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      user_id: user.id,
      name: editing.name!,
      channel: editing.channel ?? "both",
      subject: editing.subject ?? null,
      body: editing.body!,
      is_default: !!editing.is_default,
    };
    // If setting as default, unset others first
    if (payload.is_default) {
      await supabase.from("message_templates").update({ is_default: false }).eq("user_id", user.id);
    }
    let error;
    if (editing.id) {
      ({ error } = await supabase.from("message_templates").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await (supabase.from("message_templates") as any).insert(payload));
    }
    if (error) return toast.error(error.message);
    toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
    setEditing(null);
    onChanged();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("message_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(lang === "ar" ? "تم الحذف" : "Deleted");
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Message templates</DialogTitle>
          <DialogDescription>
            Use placeholders like <code>{"{{customer_name}}"}</code>,{" "}
            <code>{"{{business_name}}"}</code>, <code>{"{{invoice_number}}"}</code>,{" "}
            <code>{"{{date}}"}</code>, <code>{"{{total}}"}</code>, <code>{"{{notes}}"}</code>.
          </DialogDescription>
        </DialogHeader>

        {!editing && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button size="sm" onClick={startNew}>
                <Plus className="h-3 w-3 mr-1" /> New template
              </Button>
            </div>
            {templates.length === 0 && (
              <p className="text-sm text-muted-foreground">No templates yet.</p>
            )}
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between border border-border rounded-md p-3"
              >
                <div>
                  <p className="font-medium text-sm">
                    {t.name}{" "}
                    {t.is_default && <span className="text-xs text-primary">★ default</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.channel}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Channel</Label>
                <Select
                  value={editing.channel ?? "both"}
                  onValueChange={(v) => setEditing({ ...editing, channel: v as Tpl["channel"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both</SelectItem>
                    <SelectItem value="email">Email only</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Email subject (optional)</Label>
              <Input
                value={editing.subject ?? ""}
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
              />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea
                rows={12}
                value={editing.body ?? ""}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!editing.is_default}
                onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })}
              />
              Use as default template
            </label>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={save}>Save template</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
