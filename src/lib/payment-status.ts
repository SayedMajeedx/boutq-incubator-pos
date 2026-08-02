export type PaymentBadge = "paid" | "partial" | "unpaid" | "refunded";

export const PAYMENT_BADGE_VALUES: PaymentBadge[] = ["unpaid", "partial", "paid", "refunded"];

export function resolvePaymentStatus(
  manual: string | null | undefined,
  orderStatus: string | null | undefined,
  total: number,
  advance: number,
): PaymentBadge {
  if (manual) {
    const norm = manual.toLowerCase();
    if (norm === "paid") return "paid";
    if (norm === "partial" || norm === "partially_paid") return "partial";
    if (norm === "unpaid") return "unpaid";
    if (norm === "refunded") return "refunded";
  }
  return derivePaymentStatus(orderStatus, total, advance);
}

export function derivePaymentStatus(
  orderStatus: string | null | undefined,
  total: number,
  advance: number,
): PaymentBadge {
  const t = Number(total || 0);
  const a = Number(advance || 0);
  const remaining = +(t - a).toFixed(3);
  // Fully paid: remaining is exactly 0 (and there's a total), or manually marked paid with no outstanding balance
  if (t > 0 && remaining <= 0) return "paid";
  if (orderStatus === "paid" && remaining <= 0) return "paid";
  // Partial: some advance paid but still a remaining balance
  if (a > 0 && remaining > 0) return "partial";
  return "unpaid";
}

export const PAYMENT_BADGE_CLASSES: Record<PaymentBadge, string> = {
  paid: "bg-emerald-100 text-emerald-900 border border-emerald-300/80 font-semibold dark:bg-emerald-950 dark:text-emerald-200",
  partial:
    "bg-blue-100 text-blue-900 border border-blue-300/80 font-semibold dark:bg-blue-950 dark:text-blue-200",
  unpaid:
    "bg-rose-100 text-rose-900 border border-rose-300/80 font-semibold dark:bg-rose-950 dark:text-rose-200",
  refunded:
    "bg-slate-200 text-slate-800 border border-slate-300/80 font-semibold dark:bg-neutral-800 dark:text-neutral-200",
};

export const PAYMENT_BADGE_KEY: Record<PaymentBadge, string> = {
  paid: "payStatus.paid",
  partial: "payStatus.partial",
  unpaid: "payStatus.unpaid",
  refunded: "payStatus.refunded",
};

export const PAYMENT_BADGE_LABEL: Record<PaymentBadge, { en: string; ar: string }> = {
  paid: { en: "Paid", ar: "مدفوع" },
  partial: { en: "Partially Paid", ar: "مدفوع جزئياً" },
  unpaid: { en: "Unpaid", ar: "غير مدفوع" },
  refunded: { en: "Refunded", ar: "مسترجع" },
};
