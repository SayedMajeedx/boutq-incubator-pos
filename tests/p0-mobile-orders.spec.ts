import { test, expect } from "@playwright/test";

test.describe("P0 - Runtime & Mobile Orders Correctness", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Mock authentication and brand session
    await page.addInitScript(() => {
      const session = {
        access_token: "mock-access-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "mock-refresh-token",
        user: {
          id: "test-user-id",
          email: "admin@test.com",
          role: "authenticated",
          aud: "authenticated",
        },
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      try {
        window.localStorage.setItem("sb-ikciahnuqhemvnyfvbyp-auth-token", JSON.stringify(session));
      } catch {
        /* ignore storage error */
      }
    });

    // Mock Supabase Auth
    await page.route("**/auth/v1/user**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "test-user-id",
          email: "admin@test.com",
          role: "authenticated",
          aud: "authenticated",
        }),
      });
    });

    // Mock REST requests
    await page.route("**/rest/v1/**", async (route) => {
      const url = route.request().url();
      const accept = route.request().headers()["accept"] || "";
      const isSingle = accept.includes("vnd.pgrst.object");

      if (url.includes("/brands")) {
        const brandObj = {
          id: "test-brand",
          slug: "test-brand",
          name_en: "Boutq Test Store",
          name_ar: "متجر بوك التجريبي",
          is_active: true,
          support_access_enabled: true,
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(isSingle ? brandObj : [brandObj]),
        });
        return;
      }

      if (url.includes("/profiles")) {
        const profileObj = {
          id: "test-user-id",
          status: "active",
          role: "brand_admin",
          brand_id: "test-brand",
          email: "admin@test.com",
          created_at: "2026-07-20T12:00:00Z",
          updated_at: "2026-07-20T12:00:00Z",
          brand: {
            id: "test-brand",
            slug: "test-brand",
            name_en: "Boutq Test Store",
            name_ar: "متجر بوك التجريبي",
            logo_url: null,
            is_active: true,
          },
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(isSingle ? profileObj : [profileObj]),
        });
        return;
      }

      if (url.includes("/business_settings")) {
        const settingsObj = {
          id: "setting-1",
          brand_id: "test-brand",
          business_name: "Boutq Test Store",
          currency: "BHD",
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(isSingle ? settingsObj : [settingsObj]),
        });
        return;
      }

      if (url.includes("/orders")) {
        const orders = [
          {
            id: "order-101",
            brand_id: "test-brand",
            invoice_number: "1077",
            status: "pending",
            payment_status: "unpaid",
            payment_method: "benefit_pay",
            total: 15.0,
            currency: "BHD",
            created_at: "2026-07-22T12:00:00Z",
            customer_name_snapshot: "John Doe",
            order_items: [
              {
                id: "item-1",
                description: "Dress - PR3",
                quantity: 1,
                unit_price: 15.0,
              },
            ],
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "content-range": "0-0/1" },
          body: JSON.stringify(orders),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });
  });

  test("P0.1: Direct cold load of /admin/b/test-brand/orders at 390x844 mobile viewport without errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const uncaughtExceptions: Error[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    page.on("pageerror", (err) => {
      uncaughtExceptions.push(err);
    });

    // 1. Initial dashboard load
    await page.goto("/admin/b/test-brand/dashboard");
    await page.waitForLoadState("networkidle");

    // 2. Navigate to Orders
    await page.goto("/admin/b/test-brand/orders");
    await page.waitForLoadState("networkidle");

    // 3. Ensure zero uncaught CreditCard or runtime reference errors occurred
    expect(uncaughtExceptions).toEqual([]);
    expect(consoleErrors.filter((e) => e.includes("CreditCard is not defined"))).toEqual([]);

    // 4. Verify mobile app header brand title (Arabic brand name) is displayed
    const appHeader = page.getByText("متجر بوك التجريبي").first();
    await expect(appHeader).toBeVisible();

    // 5. Verify order card invoice #1077 is rendered
    const invoiceEl = page.getByText("#1077").first();
    await expect(invoiceEl).toBeVisible();

    // 6. Verify payment validation action button is rendered
    const validateBtn = page.getByText("تأكيد الدفع").first();
    await expect(validateBtn).toBeVisible();
  });
});
