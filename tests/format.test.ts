import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, toWesternDigits, westernNumeralLocale } from "../src/lib/format";

const easternDigits = /[٠-٩۰-۹]/;

describe("Western numeral formatting", () => {
  it("forces the Latin numbering system for Arabic locales", () => {
    expect(westernNumeralLocale("ar-BH")).toContain("nu-latn");
    expect(formatMoney(15, "BHD", "ar-BH")).not.toMatch(easternDigits);
    expect(formatDate("2026-07-24", "ar-BH")).not.toMatch(easternDigits);
  });

  it("normalizes Arabic and Persian digit characters", () => {
    expect(toWesternDigits("١٥.٠٠٠ BHD · #۱۰۶۸")).toBe("15.000 BHD · #1068");
  });
});
