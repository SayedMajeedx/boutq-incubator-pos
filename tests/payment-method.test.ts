import { describe, expect, it } from "vitest";
import { matchesPaymentMethodFilter, normalizePaymentMethod } from "../src/lib/payment-method";

describe("payment method filtering", () => {
  it.each([
    ["benefit", "benefit"],
    ["benefit_pay", "benefit"],
    ["cod", "cod"],
    ["cash_on_delivery", "cod"],
    ["card", "card"],
    ["tap", "card"],
  ] as const)("normalizes %s as %s", (storedValue, expected) => {
    expect(normalizePaymentMethod(storedValue)).toBe(expected);
  });

  it.each([
    ["benefit", "benefit", true],
    ["benefit", "cod", false],
    ["cod", "cod", true],
    ["cod", "card", false],
    ["card", "card", true],
    ["card", "benefit", false],
    ["imported_migration", "benefit", false],
    [null, "card", false],
  ] as const)("filters %s by %s accurately", (storedValue, filter, expected) => {
    expect(matchesPaymentMethodFilter(storedValue, filter)).toBe(expected);
  });

  it("includes every payment method when All is selected", () => {
    expect(matchesPaymentMethodFilter("benefit", "all")).toBe(true);
    expect(matchesPaymentMethodFilter("cod", "all")).toBe(true);
    expect(matchesPaymentMethodFilter("card", "all")).toBe(true);
    expect(matchesPaymentMethodFilter(null, "all")).toBe(true);
  });
});
