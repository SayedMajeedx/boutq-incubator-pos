import React from "react";
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendingUp } from "lucide-react";
import { ExpensesScopeSwitcher } from "../src/components/expenses/ExpensesScopeSwitcher";
import { KpiCard } from "../src/components/reports/kpi-card";

describe("Phase 7B responsive financial workspaces", () => {
  test("expenses keeps primary financial results visible and progressively discloses costs", () => {
    render(
      <ExpensesScopeSwitcher
        lang="en"
        currency="BHD"
        totalRevenue={1200}
        totalCogs={300}
        manualOpex={150}
        processingFees={25}
        netProfit={725}
        marginPercentage={60.4}
      />,
    );

    expect(screen.getByText("Total Revenue")).toBeDefined();
    expect(screen.getByText("Net Profit / Margin")).toBeDefined();
    expect(screen.getByText("Cost and expense details")).toBeDefined();
    expect(screen.getAllByText("COGS").length).toBeGreaterThanOrEqual(2);
  });

  test("report KPI cards use compact mobile spacing while retaining desktop spacing", () => {
    render(
      <KpiCard
        title="Net sales"
        value="BHD 1,200"
        description="Paid orders"
        icon={<TrendingUp />}
      />,
    );

    const card = screen.getByRole("article");
    expect(card.className).toContain("p-3.5");
    expect(card.className).toContain("sm:p-5");
    expect(screen.getByText("Net sales")).toBeDefined();
    expect(screen.getByText("Paid orders")).toBeDefined();
  });
});
