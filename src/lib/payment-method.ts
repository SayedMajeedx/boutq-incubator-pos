export type PaymentMethodFilter = "all" | "benefit" | "cod" | "card";
export type CanonicalPaymentMethod = Exclude<PaymentMethodFilter, "all">;

const PAYMENT_METHOD_ALIASES: Record<CanonicalPaymentMethod, ReadonlySet<string>> = {
  benefit: new Set(["benefit", "benefitpay", "benefit_pay", "bank_transfer"]),
  cod: new Set(["cod", "cash", "cash_on_delivery", "cash on delivery"]),
  card: new Set([
    "card",
    "tap",
    "creimax",
    "credit",
    "credit_card",
    "debit_card",
    "apple_pay",
    "google_pay",
  ]),
};

export function normalizePaymentMethod(
  paymentMethod: string | null | undefined,
): CanonicalPaymentMethod | null {
  const normalized = String(paymentMethod ?? "")
    .trim()
    .toLowerCase();

  for (const method of ["benefit", "cod", "card"] as const) {
    if (PAYMENT_METHOD_ALIASES[method].has(normalized)) return method;
  }

  return null;
}

export function matchesPaymentMethodFilter(
  paymentMethod: string | null | undefined,
  filter: PaymentMethodFilter,
): boolean {
  return filter === "all" || normalizePaymentMethod(paymentMethod) === filter;
}
