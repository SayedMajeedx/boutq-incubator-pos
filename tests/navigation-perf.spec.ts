import { test, expect } from "@playwright/test";

test.use({
  viewport: { width: 1280, height: 800 },
});

test.describe("P0 - Strict Navigation Performance & Transition Timings", () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication and brand session
    await page.addInitScript(() => {
      const session = {
        access_token: "mock-access-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "mock-refresh-token",
        user: {
          id: "test-user-id",
          email: "admin@boutq.store",
          role: "authenticated",
          aud: "authenticated",
        },
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      try {
        window.localStorage.setItem("sb-ikciahnuqhemvnyfvbyp-auth-token", JSON.stringify(session));
        window.localStorage.setItem("supabase.auth.token", JSON.stringify(session));
      } catch {
        /* ignore storage error */
      }
    });

    // Mock Supabase Auth
    await page.route("**/auth/v1/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "mock-access-token",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "mock-refresh-token",
          user: {
            id: "test-user-id",
            email: "admin@boutq.store",
            role: "authenticated",
            aud: "authenticated",
            user_metadata: {},
            app_metadata: {},
          },
          id: "test-user-id",
          email: "admin@boutq.store",
          role: "authenticated",
          aud: "authenticated",
          user_metadata: {},
          app_metadata: {},
        }),
      });
    });

    // Mock REST requests
    await page.route("**/rest/v1/profiles*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "test-user-id",
            email: "admin@boutq.store",
            status: "active",
            role: "brand_admin",
            brand_id: "test-brand",
            brand: {
              id: "test-brand",
              slug: "test-brand",
              name_en: "Boutq Boutique",
              name_ar: "بوتيك بوتك",
              is_active: true,
            },
          },
        ]),
      });
    });

    await page.route("**/rest/v1/brands*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "test-brand",
            slug: "test-brand",
            name_en: "Boutq Boutique",
            name_ar: "بوتيك بوتك",
            is_active: true,
          },
        ]),
      });
    });

    await page.route("**/rest/v1/business_settings*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          brand_id: "test-brand",
          business_name: "Boutq Boutique",
          currency: "BHD",
        }),
      });
    });

    await page.route("**/rest/v1/orders*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "order-101",
            invoice_number: "1001",
            brand_id: "test-brand",
            status: "pending",
            payment_status: "unpaid",
            total: 15.0,
            currency: "BHD",
            created_at: "2026-07-22T12:00:00Z",
            customer_name_snapshot: "John Doe",
          },
        ]),
      });
    });

    await page.route("**/rest/v1/products*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "prod-1",
            brand_id: "test-brand",
            name_en: "Luxury Silk Abaya",
            name_ar: "عباية حرير فاخرة",
            base_price: 45.0,
            is_visible: true,
            created_at: "2026-07-20T12:00:00Z",
          },
        ]),
      });
    });
  });

  test("P0.4: Strict Primary App Navigation Latency Assertions (Feedback ≤100ms, Content ≤300ms)", async ({
    page,
  }) => {
    // Cold load Orders route
    await page.goto("/admin/b/test-brand/orders");
    await page.waitForLoadState("networkidle");

    // Click link to Inventory in sidebar
    const navLink = page.locator("a[href*='inventory']").first();
    await expect(navLink, "Inventory link must be visible").toBeVisible({ timeout: 10000 });

    // Hover first to trigger TanStack Router link preloading
    await navLink.hover();
    await page.waitForTimeout(200);

    const activeFeedbackTime = await navLink.evaluate((el: HTMLElement) => {
      const clickStartedAt = performance.now();
      document.documentElement.dataset.navigationTestStartedAt = String(clickStartedAt);
      delete document.documentElement.dataset.destinationRenderedAt;

      const recordDestination = () => {
        if (document.querySelector('main [data-route-heading="inventory"]')) {
          document.documentElement.dataset.destinationRenderedAt = String(performance.now());
          return true;
        }
        return false;
      };
      if (!recordDestination()) {
        const observer = new MutationObserver(() => {
          if (recordDestination()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }

      el.click();
      const feedbackAt = Number(document.documentElement.dataset.navigationFeedbackAt);
      return feedbackAt - clickStartedAt;
    });

    // 1. Assert active navigation feedback occurs within ≤100ms. Both
    // timestamps are captured in the page so automation transport is excluded.
    console.log(`[STRICT PERF] Active navigation feedback time: ${activeFeedbackTime}ms`);
    expect(
      activeFeedbackTime,
      "Active navigation feedback exceeded 100ms limit",
    ).toBeLessThanOrEqual(100);

    await page.waitForURL("**/inventory**", { timeout: 2000 });

    // 2. Assert destination-specific primary content renders within ≤300ms
    const destinationContent = page.locator('main [data-route-heading="inventory"]');
    await expect(destinationContent, "Destination-specific content must be rendered").toBeVisible({
      timeout: 2000,
    });

    const totalTransitionTime = await page.evaluate(() => {
      const startedAt = Number(document.documentElement.dataset.navigationTestStartedAt);
      const renderedAt = Number(document.documentElement.dataset.destinationRenderedAt);
      return renderedAt - startedAt;
    });
    console.log(`[STRICT PERF] Primary destination transition time: ${totalTransitionTime}ms`);
    expect(
      totalTransitionTime,
      "Primary content transition exceeded 300ms requirement",
    ).toBeLessThanOrEqual(300);

    // 3. Verify zero previous-route content bleeding after route change
    const bodyText = await page.innerText("body");
    expect(bodyText).not.toContain("لوحة التحكم القديمة");
  });
});
