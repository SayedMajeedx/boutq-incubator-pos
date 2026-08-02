import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { formatDate, formatMoney } from "@/lib/format";
import {
  getOrderCustomerName,
  getOrderCustomerPhone,
  getOrderCustomerEmail,
} from "@/lib/order-customer-snapshot";

type SavedAddress = {
  id?: string;
  formatted_address?: string | null;
  address?: string | null;
};

type StructuredAddress = {
  block?: string | null;
  road?: string | null;
  building?: string | null;
  flat?: string | null;
  city?: string | null;
  area?: string | null;
};

type Customization = {
  name: string;
  price_delta: number;
};

type CustomFieldValue = {
  key: string;
  label_ar?: string | null;
  label_en?: string | null;
  value: string;
};

type Item = {
  description: string;
  quantity: number;
  unit_price: number;
  original_price?: number | null;
  line_total: number;
  customization_total: number;
  customizations: Customization[];
  selected_variant?: {
    size?: string | null;
    color?: string | null;
    fabric?: string | null;
  } | null;
  custom_field_values?: CustomFieldValue[];
};

type PaymentBadge = "paid" | "partial" | "unpaid" | "refunded";

function formatDeliveryAddress(c: any, lang: "en" | "ar"): string[] {
  if (!c) return [];
  const parts: string[] = [];
  if (c.block || c.road || c.building || c.flat) {
    const blockRoad = [
      c.flat && (lang === "ar" ? `شقة/مكتب ${c.flat}` : `Flat/Office ${c.flat}`),
      c.building && (lang === "ar" ? `مبنى ${c.building}` : `Bldg ${c.building}`),
      c.road && (lang === "ar" ? `طريق ${c.road}` : `Road ${c.road}`),
      c.block && (lang === "ar" ? `مجمع ${c.block}` : `Block ${c.block}`),
    ]
      .filter(Boolean)
      .join("، ");
    if (blockRoad) parts.push(blockRoad);
  }
  if (c.city || c.area) {
    const loc = [c.area, c.city].filter(Boolean).join("، ");
    if (loc) parts.push(loc);
  }
  if (c.address && parts.length === 0) {
    parts.push(c.address);
  }
  return parts;
}

function formatAddressDetailed(addr: StructuredAddress, lang: "en" | "ar"): string {
  if (!addr) return "";
  const parts = [
    addr.flat && (lang === "ar" ? `شقة/مكتب ${addr.flat}` : `Flat ${addr.flat}`),
    addr.building && (lang === "ar" ? `مبنى ${addr.building}` : `Bldg ${addr.building}`),
    addr.road && (lang === "ar" ? `طريق ${addr.road}` : `Road ${addr.road}`),
    addr.block && (lang === "ar" ? `مجمع ${addr.block}` : `Block ${addr.block}`),
    addr.area || addr.city,
  ].filter(Boolean);
  return parts.join("، ");
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

function tPayment(s: string | null | undefined, lang: "en" | "ar") {
  if (!s) return "";
  return PAYMENT_LABELS[s]?.[lang] ?? s;
}

function toArabicDigits(str: string) {
  const map = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return str.replace(/[0-9]/g, (d) => map[+d]);
}

const PAYMENT_BADGE_CLASSES = {
  paid: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
  partial: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300",
  unpaid: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300",
  refunded: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300",
} as const;

const PAYMENT_BADGE_LABEL = {
  paid: { ar: "مدفوع بالكامل", en: "Fully Paid" },
  partial: { ar: "مدفوع جزئياً", en: "Partially Paid" },
  unpaid: { ar: "غير مدفوع", en: "Unpaid / COD" },
  refunded: { ar: "مسترد", en: "Refunded" },
} as const;

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

export default function InvoicePreview({
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
              <h2
                className={`text-3xl sm:text-4xl font-display ${isRTL ? "" : "tracking-tight"}`}
                style={{
                  color,
                  letterSpacing: isRTL ? "normal" : undefined,
                  textTransform: "none",
                }}
              >
                {(isRTL ? settings.invoice_title_ar : settings.invoice_title_en) || L.invoice}
              </h2>
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
