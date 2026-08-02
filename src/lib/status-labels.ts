/**
 * Centralized Status Dictionary & Translation Mapper
 * Single source of truth for order, fulfillment, and payment status labels.
 */

export type Lang = "ar" | "en";

export type StatusDefinition = {
  ar: string;
  en: string;
  badgeClasses?: string;
};

export const FULFILLMENT_STATUS_MAP: Record<string, StatusDefinition> = {
  NEEDS_PACKING: {
    ar: "بحاجة للتعبئة",
    en: "Needs Packing",
    badgeClasses: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300",
  },
  ASSIGNED: {
    ar: "تم التعيين للمندوب (بانتظار البيك اب)",
    en: "Assigned (Awaiting Pickup)",
    badgeClasses: "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300",
  },
  SHIPPED: {
    ar: "خرج للتوصيل",
    en: "Out for Delivery",
    badgeClasses: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300",
  },
  OUT_FOR_DELIVERY: {
    ar: "خرج للتوصيل",
    en: "Out for Delivery",
    badgeClasses: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300",
  },
  READY_FOR_DELIVERY: {
    ar: "جاهز للتوصيل",
    en: "Ready for Delivery",
    badgeClasses: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300",
  },
  READY_FOR_PICKUP: {
    ar: "جاهز للاستلام",
    en: "Ready for Pickup",
    badgeClasses: "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300",
  },
  DELIVERED: {
    ar: "تم التوصيل",
    en: "Delivered",
    badgeClasses: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  COMPLETED: {
    ar: "تم التوصيل",
    en: "Completed",
    badgeClasses: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  PICKED_UP: {
    ar: "تم الاستلام من المحل",
    en: "Picked Up",
    badgeClasses: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  ON_HOLD: {
    ar: "قيد الانتظار",
    en: "On Hold",
    badgeClasses: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200",
  },
  CANCELLED: {
    ar: "ملغى",
    en: "Cancelled",
    badgeClasses: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300",
  },
  CANCELED: {
    ar: "ملغى",
    en: "Cancelled",
    badgeClasses: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300",
  },
  RETURNED: {
    ar: "مرتجع",
    en: "Returned",
    badgeClasses: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300",
  },
  FAILED: {
    ar: "تعذر التوصيل",
    en: "Delivery Failed",
    badgeClasses: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300",
  },
};

export const ORDER_STATUS_MAP: Record<string, StatusDefinition> = {
  draft: { ar: "مسودة", en: "Draft" },
  confirmed: { ar: "مؤكد", en: "Confirmed" },
  paid: { ar: "مدفوع بالكامل", en: "Paid" },
  partially_paid: { ar: "مدفوع جزئياً", en: "Partially Paid" },
  unpaid: { ar: "غير مدفوع", en: "Unpaid" },
  completed: { ar: "مكتمل", en: "Completed" },
  cancelled: { ar: "ملغى", en: "Cancelled" },
  canceled: { ar: "ملغى", en: "Cancelled" },
  pending_verification: { ar: "بانتظار التحقق من البنفت", en: "Pending Verification" },
  archived_historical: { ar: "أرشيف تاريخي", en: "Archived Historical" },
};

export const FULFILLMENT_METHOD_MAP: Record<string, StatusDefinition> = {
  delivery: { ar: "توصيل للمنزل", en: "Home Delivery" },
  pickup: { ar: "استلام من المحل", en: "Store Pickup" },
  digital: { ar: "منتج رقمي", en: "Digital Delivery" },
};

/**
 * Returns localized label for fulfillment status with fallback handling.
 */
export function getFulfillmentLabel(
  status: string | null | undefined,
  lang: Lang = "ar",
): string {
  if (!status) return lang === "ar" ? "قيد الانتظار" : "On Hold";
  const normalized = String(status).trim().toUpperCase();
  const def = FULFILLMENT_STATUS_MAP[normalized];
  if (def) return def[lang];

  console.warn(`[status-labels] Unknown fulfillment status enum: "${status}"`);
  return status.replace(/_/g, " ").toLowerCase();
}

/**
 * Returns localized label for order status with fallback handling.
 */
export function getOrderStatusLabel(
  status: string | null | undefined,
  lang: Lang = "ar",
): string {
  if (!status) return lang === "ar" ? "مسودة" : "Draft";
  const normalized = String(status).trim().toLowerCase();
  const def = ORDER_STATUS_MAP[normalized];
  if (def) return def[lang];

  console.warn(`[status-labels] Unknown order status enum: "${status}"`);
  return status;
}

/**
 * Returns localized label for fulfillment method (Delivery vs Pickup).
 */
export function getFulfillmentMethodLabel(
  method: string | null | undefined,
  lang: Lang = "ar",
): string {
  if (!method) return lang === "ar" ? "توصيل للمنزل" : "Home Delivery";
  const normalized = String(method).trim().toLowerCase();
  const def = FULFILLMENT_METHOD_MAP[normalized];
  if (def) return def[lang];

  return method;
}

/**
 * Legacy Activity Log Sanitizer:
 * Translates embedded raw English status strings inside legacy message_ar strings.
 */
export function sanitizeActivityLogMessage(message: string, lang: Lang = "ar"): string {
  if (!message) return "";
  if (lang !== "ar") return message;

  return message
    .replace(/\bconfirmed\b/gi, "مؤكد")
    .replace(/\bcompleted\b/gi, "مكتمل")
    .replace(/\bshipped\b/gi, "خرج للتوصيل")
    .replace(/\bneeds_packing\b/gi, "بحاجة للتعبئة")
    .replace(/\bNEEDS_PACKING\b/g, "بحاجة للتعبئة")
    .replace(/\bASSIGNED\b/g, "تم التعيين للمندوب")
    .replace(/\bSHIPPED\b/g, "خرج للتوصيل")
    .replace(/\bDELIVERED\b/g, "تم التوصيل")
    .replace(/\bCOMPLETED\b/g, "تم التوصيل")
    .replace(/\bON_HOLD\b/g, "قيد الانتظار")
    .replace(/\bREADY_FOR_PICKUP\b/g, "جاهز للاستلام")
    .replace(/\bCANCELLED\b/gi, "ملغى")
    .replace(/\bpaid\b/gi, "مدفوع")
    .replace(/\bunpaid\b/gi, "غير مدفوع");
}
