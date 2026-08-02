import React from "react";
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntegrationsScopeSwitcher } from "../src/components/integrations/IntegrationsScopeSwitcher";
import { PagesScopeSwitcher } from "../src/components/pages/PagesScopeSwitcher";
import { SettingsScopeSwitcher } from "../src/components/settings/SettingsScopeSwitcher";
import { RoutePendingSkeleton } from "../src/components/os/route-pending-skeleton";

describe("Phase 7D responsive configuration workspaces", () => {
  test("integrations keeps primary scopes visible and exposes secondary scopes from an accessible menu", () => {
    const onScopeChange = vi.fn();
    const { container } = render(
      <IntegrationsScopeSwitcher
        lang="en"
        activeScope="all"
        onScopeChange={onScopeChange}
        integrationCount={6}
      />,
    );

    expect(container.querySelector(".overflow-x-auto")).toBeNull();
    fireEvent.pointerDown(screen.getByRole("button", { name: "More integration categories" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Tracking Pixels/ }));
    expect(onScopeChange).toHaveBeenCalledWith("pixels");
  });

  test("settings replaces the nine-item mobile scroller with a localized overflow menu", () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <SettingsScopeSwitcher lang="en" activeTab="business" onTabChange={onTabChange} />,
    );

    expect(container.querySelector(".overflow-x-auto")).toBeNull();
    fireEvent.pointerDown(screen.getByRole("button", { name: "More settings" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Security" }));
    expect(onTabChange).toHaveBeenCalledWith("security");
  });

  test("pages preserves both content scopes without a mobile overflow rail", () => {
    const { container } = render(
      <PagesScopeSwitcher lang="ar" activeScope="pages" onScopeChange={vi.fn()} pageCount={4} />,
    );

    expect(container.querySelector(".overflow-x-auto")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  test("the navigation skeleton contains fixed-width placeholders inside a clipped responsive shell", () => {
    const { container } = render(<RoutePendingSkeleton />);
    const skeleton = container.firstElementChild as HTMLElement;

    expect(skeleton.className).toContain("min-w-0");
    expect(skeleton.className).toContain("overflow-hidden");
    expect(container.querySelectorAll(".max-w-full").length).toBeGreaterThan(0);
  });
});
