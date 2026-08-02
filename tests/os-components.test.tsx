import React from "react";
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShoppingBag } from "lucide-react";
import {
  OsSurface,
  OsPanel,
  OsToolbar,
  OsPage,
  OsPageHeader,
  OsAppIcon,
  OsNavItem,
  OsStatusPill,
  OsEmptyState,
  OsMobileTabBar,
} from "../src/components/os";

describe("Boutq OS Reusable Components", () => {
  test("OsSurface renders variant classes correctly", () => {
    const { container } = render(
      <OsSurface variant="glass" radius="panel" border interactive data-testid="surface">
        Test Content
      </OsSurface>,
    );

    const el = screen.getByTestId("surface");
    expect(el.className).toContain("os-glass");
    expect(el.className).toContain("rounded-[var(--os-radius-panel)]");
    expect(el.className).toContain("os-hairline");
    expect(el.className).toContain("os-interactive");
  });

  test("OsStatusPill renders status variants and dots", () => {
    render(
      <OsStatusPill variant="success" dot data-testid="status-pill">
        Paid
      </OsStatusPill>,
    );

    const pill = screen.getByTestId("status-pill");
    expect(pill.textContent).toContain("Paid");
    expect(pill.className).toContain("bg-emerald-50");
  });

  test("OsPageHeader renders title, eyebrow, and actions", () => {
    render(
      <OsPageHeader
        eyebrow="Operations"
        title="Orders"
        description="Manage customer orders"
        primaryAction={<button>New Order</button>}
      />,
    );

    expect(screen.getByText("Operations")).toBeDefined();
    expect(screen.getByText("Orders")).toBeDefined();
    expect(screen.getByText("Manage customer orders")).toBeDefined();
    expect(screen.getByText("New Order")).toBeDefined();
  });

  test("OsNavItem handles active and collapsed states", () => {
    render(
      <OsNavItem
        icon={ShoppingBag}
        label="Orders"
        active
        collapsed
        badge={5}
        data-testid="nav-item"
      />,
    );

    const nav = screen.getByTestId("nav-item");
    expect(nav.className).toContain("bg-primary");
    expect(nav.className).toContain("justify-center");
    expect(screen.getByText("5")).toBeDefined();
  });

  test("OsMobileTabBar enforces min 44px tap target buttons", () => {
    render(
      <OsMobileTabBar
        items={[
          { id: "home", icon: ShoppingBag, label: "Home", active: true },
          { id: "orders", icon: ShoppingBag, label: "Orders", active: false },
        ]}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(2);
    buttons.forEach((btn) => {
      expect(btn.className).toContain("min-h-[44px]");
    });
  });

  test("OsEmptyState renders title and action", () => {
    render(
      <OsEmptyState
        title="No Orders Found"
        description="Try adjusting your filters"
        action={<button>Reset Filters</button>}
      />,
    );

    expect(screen.getByText("No Orders Found")).toBeDefined();
    expect(screen.getByText("Try adjusting your filters")).toBeDefined();
    expect(screen.getByText("Reset Filters")).toBeDefined();
  });
});
