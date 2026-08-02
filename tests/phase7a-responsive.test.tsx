import React from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Package, TriangleAlert, XCircle } from "lucide-react";
import { InventoryScopeSwitcher } from "../src/components/inventory/InventoryScopeSwitcher";
import { CustomersScopeSwitcher } from "../src/components/customers/CustomersScopeSwitcher";
import { CategoriesWorkQueue } from "../src/components/categories/CategoriesWorkQueue";

describe("Phase 7A responsive workspaces", () => {
  test("inventory exposes two readable mobile scopes and an accessible overflow menu", () => {
    render(
      <InventoryScopeSwitcher
        lang="en"
        activeTab="all"
        onTabChange={vi.fn()}
        tabs={[
          {
            id: "all",
            label_en: "All Products",
            label_ar: "جميع المنتجات",
            count: 8,
            icon: Package,
          },
          {
            id: "low",
            label_en: "Low Stock",
            label_ar: "مخزون منخفض",
            count: 2,
            icon: TriangleAlert,
          },
          { id: "out", label_en: "Out of Stock", label_ar: "نفد المخزون", count: 1, icon: XCircle },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "More inventory scopes" })).toBeDefined();
    expect(screen.getAllByRole("button", { name: /All Products/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Low Stock/ })).toHaveLength(2);
  });

  test("customer segments provide a localized overflow action", () => {
    render(
      <CustomersScopeSwitcher
        lang="ar"
        currentScope="all"
        onScopeChange={vi.fn()}
        counts={{ all: 10, vip: 2, repeat: 3, new: 4, churn: 1 }}
      />,
    );

    expect(screen.getByRole("button", { name: "المزيد من شرائح العملاء" })).toBeDefined();
  });

  test("categories retain desktop table and render mobile cards with named reorder actions", () => {
    const { container } = render(
      <CategoriesWorkQueue
        lang="en"
        categories={[
          { id: "category-one", name_en: "Dresses", slug: "dresses", product_count: 3 },
          { id: "category-two", name_en: "Abayas", slug: "abayas", product_count: 2 },
        ]}
        isLoading={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(container.querySelector("table")).toBeDefined();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Move category up" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Move category down" })).toHaveLength(2);
  });
});
