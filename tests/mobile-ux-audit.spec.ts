import { test, expect } from "@playwright/test";

// Mock database states for Playwright audits
const mockProducts = [
  {
    id: "prod-1",
    brand_id: "test-brand",
    name_en: "Original Mock Product",
    name_ar: "المنتج الأصلي",
    base_price: 15.0,
    is_visible: true,
    image_url: null,
    created_at: "2026-07-20T12:00:00Z",
  },
];

const mockVariants = [
  {
    id: "var-1",
    product_id: "prod-1",
    brand_id: "test-brand",
    sku: "SKU-ORIGINAL",
    size: "54",
    color: "Red",
    fabric: "Silk",
    selling_price: 15.0,
    stock_main: 10,
    created_at: "2026-07-20T12:00:00Z",
  },
];

const mockOrders = [
  {
    id: "order-1",
    brand_id: "test-brand",
    invoice_number: "1001",
    status: "pending",
    payment_status: "unpaid",
    payment_method: "benefit_pay",
    total: 15.0,
    total_amount: 15.0,
    currency: "BHD",
    created_at: "2026-07-22T12:00:00Z",
    customer_id: "cust-1",
    customer_name_snapshot: "John Doe",
    customer_email_snapshot: "john@example.com",
    customer_phone_snapshot: "97312345678",
    customers: {
      name: "John Doe",
    },
    profiles: {
      full_name: "John Doe",
      phone: "97312345678",
    },
    order_items: [
      {
        id: "item-1",
        quantity: 1,
        unit_price: 15.0,
        price: 15.0,
        line_total: 15.0,
        variant_id: "var-1",
        name_en: "Original Mock Product",
        description: "Dress - PR3 - المقاس: 52 - اللون: Black",
      },
    ],
  },
];

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
        email: "majeed@hotmail.it",
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
        email: "majeed@hotmail.it",
        role: "authenticated",
        aud: "authenticated",
      }),
    });
  });

  await page.route("**/auth/v1/logout**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
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
        role: "super_admin",
        brand_id: "test-brand",
        email: "majeed@hotmail.it",
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
        card_processing_fee: 2.5,
        benefit_processing_fee: 1.0,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(isSingle ? settingsObj : [settingsObj]),
      });
      return;
    }

    if (url.includes("/orders")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? mockOrders[0] : mockOrders),
      });
      return;
    }

    if (url.includes("/customers")) {
      const customer = {
        id: "cust-1",
        brand_id: "test-brand",
        name: "John Doe",
        phone: "97312345678",
        email: "john@example.com",
        notes: null,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(isSingle ? customer : [customer]),
      });
      return;
    }

    if (url.includes("/products")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockProducts),
      });
      return;
    }

    if (url.includes("/product_variants")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockVariants),
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

test("Comprehensive Mobile UX Audit at 390x844 Viewport", async ({ page }) => {
  const auditResults: Record<string, any> = {
    viewportAndLayout: {},
    navigationAndDrawer: {},
    tapTargets: [],
    pageAudits: {},
  };

  page.on("console", (msg) => console.log("BROWSER LOG:", msg.type(), msg.text()));
  page.on("requestfailed", (req) =>
    console.log("FAILED REQ:", req.url(), req.failure()?.errorText),
  );
  page.on("response", (res) => {
    if (res.status() >= 400) console.log("ERROR RESP:", res.status(), res.url());
  });

  // Navigate to Dashboard
  await page.goto("/admin/b/test-brand/dashboard");
  await page.waitForLoadState("networkidle");

  console.log("NAVIGATED URL:", page.url());
  console.log("PAGE BODY TEXT:", await page.innerText("body"));

  // 1. Audit Header & Viewport Layout
  const viewportSize = page.viewportSize();
  console.log("=== STARTING MOBILE UX AUDIT ===");
  console.log("Viewport Size:", viewportSize);

  // Check horizontal body overflow
  const bodyOverflow = await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body.scrollWidth;
    const bodyOverflowStyle = window.getComputedStyle(document.body).overflow;
    const htmlOverflowStyle = window.getComputedStyle(document.documentElement).overflow;
    return {
      docWidth,
      scrollWidth,
      bodyScrollWidth,
      hasHorizontalScroll: scrollWidth > docWidth || bodyScrollWidth > docWidth,
      bodyOverflowStyle,
      htmlOverflowStyle,
    };
  });
  auditResults.viewportAndLayout.bodyOverflow = bodyOverflow;

  // Measure Top Mobile Header
  const topHeader = page.locator(".no-print.fixed.top-0").first();
  await expect(topHeader).toBeVisible();
  const headerBoundingBox = await topHeader.boundingBox();
  auditResults.viewportAndLayout.headerBoundingBox = headerBoundingBox;

  // Measure Header Tap Targets
  const headerButtons = topHeader.locator("button");
  const headerButtonCount = await headerButtons.count();
  for (let i = 0; i < headerButtonCount; i++) {
    const btn = headerButtons.nth(i);
    const box = await btn.boundingBox();
    const ariaLabel =
      (await btn.getAttribute("aria-label")) || (await btn.innerText()) || `HeaderBtn-${i}`;
    if (box) {
      const isViolating = box.width < 44 || box.height < 44;
      auditResults.tapTargets.push({
        location: "Mobile Header Top Bar",
        label: ariaLabel.trim(),
        width: Math.round(box.width),
        height: Math.round(box.height),
        violates: isViolating,
      });
    }
  }

  // 2. Test Mobile Hamburger Drawer Navigation
  const menuButton = page.locator("button[aria-label='القائمة الرئيسية']").first();
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await page.waitForTimeout(300);

  const drawerSheet = page.locator("div[role='dialog']").first();
  await expect(drawerSheet).toBeVisible();

  // Test drawer close via Backdrop click at { x: 20, y: 100 } (exposed backdrop on left in RTL)
  await page.mouse.click(20, 100);
  await page.waitForTimeout(300);
  await expect(drawerSheet).not.toBeVisible();

  // Re-open drawer for route navigation check
  await menuButton.click();
  await page.waitForTimeout(300);

  // Measure Drawer Link Tap Targets
  const drawerLinks = drawerSheet.locator("a");
  const drawerLinkCount = await drawerLinks.count();
  for (let i = 0; i < drawerLinkCount; i++) {
    const link = drawerLinks.nth(i);
    const box = await link.boundingBox();
    const label = await link.innerText();
    if (box) {
      const isViolating = box.height < 44;
      auditResults.tapTargets.push({
        location: "Mobile Navigation Drawer Link",
        label: label.trim(),
        width: Math.round(box.width),
        height: Math.round(box.height),
        violates: isViolating,
      });
    }
  }

  // Close drawer before page iterations
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 3. Test Mobile Navigation across pages
  const allRoutesToTest = [
    { name: "Dashboard", path: "/admin/b/test-brand/dashboard" },
    { name: "Orders", path: "/admin/b/test-brand/orders" },
    { name: "Order Detail", path: "/admin/b/test-brand/orders/order-1" },
    { name: "Customers", path: "/admin/b/test-brand/customers" },
    { name: "Customer Detail", path: "/admin/b/test-brand/customers/cust-1" },
    { name: "Inventory", path: "/admin/b/test-brand/inventory" },
    { name: "Categories", path: "/admin/b/test-brand/categories" },
    { name: "Campaigns", path: "/admin/b/test-brand/campaigns" },
    { name: "Discounts", path: "/admin/b/test-brand/discounts" },
    { name: "Expenses", path: "/admin/b/test-brand/expenses" },
    { name: "Communications", path: "/admin/b/test-brand/communications" },
    { name: "Pages", path: "/admin/b/test-brand/pages" },
    { name: "Team", path: "/admin/b/test-brand/team" },
    { name: "Integrations", path: "/admin/b/test-brand/integrations" },
    { name: "Settings", path: "/admin/b/test-brand/settings" },
    { name: "Reports", path: "/admin/b/test-brand/reports" },
    { name: "Sales Reports", path: "/admin/b/test-brand/reports/sales" },
    { name: "Product Reports", path: "/admin/b/test-brand/reports/products" },
    { name: "Customer Reports", path: "/admin/b/test-brand/reports/customers" },
    { name: "Report Export", path: "/admin/b/test-brand/reports/export" },
  ];
  const requestedRoutes = process.env.AUDIT_ROUTES?.split(",").map((route) => route.trim());
  const routesToTest = requestedRoutes?.length
    ? allRoutesToTest.filter((route) => requestedRoutes.includes(route.name))
    : allRoutesToTest;

  for (const route of routesToTest) {
    const pageConsoleErrors: string[] = [];
    const pageUncaughtExceptions: Error[] = [];
    let responseStatus = 200;

    const responseHandler = (res: any) => {
      if (res.url().includes(route.path)) {
        responseStatus = res.status();
      }
    };
    page.on("response", responseHandler);

    const consoleHandler = (msg: any) => {
      if (msg.type() === "error") {
        const text = msg.text();
        const lower = text.toLowerCase();
        const isNetworkNoise =
          lower.includes("websocket") ||
          lower.includes("wss://") ||
          lower.includes("ws://") ||
          lower.includes("failed to load resource") ||
          lower.includes("net::err_") ||
          lower.includes("status of 401") ||
          lower.includes("status of 403") ||
          lower.includes("status of 404");
        if (!isNetworkNoise) {
          pageConsoleErrors.push(text);
        }
      }
    };
    const pageErrorHandler = (err: Error) => {
      pageUncaughtExceptions.push(err);
    };
    page.on("console", consoleHandler);
    page.on("pageerror", pageErrorHandler);

    // The dashboard is already loaded above. Reloading the identical URL aborts
    // in-flight observers during React's development-only mount cycle and can
    // manufacture an unmounted-update warning that users never encounter.
    if (new URL(page.url()).pathname !== route.path) {
      const response = await page.goto(route.path);
      if (response) responseStatus = response.status();
      await page.waitForLoadState("networkidle");
    }

    page.off("response", responseHandler);

    // Assert non-blank page and non-404 status
    expect(responseStatus, `Route ${route.path} returned HTTP ${responseStatus}`).toBeLessThan(400);

    // Every application route owns exactly one visible semantic page heading.
    const pageHeading = page.locator("main h1");
    await expect(
      pageHeading,
      `Route ${route.path} must expose exactly one page heading`,
    ).toHaveCount(1);
    await expect(pageHeading, `Route ${route.path} missing its visible page heading`).toBeVisible({
      timeout: 5000,
    });

    const routeA11y = await page.evaluate(() => {
      const visibleButtons = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
        (button) => {
          const style = getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0;
        },
      );
      const unnamedButtons = visibleButtons
        .filter(
          (button) =>
            !button.getAttribute("aria-label")?.trim() &&
            !button.getAttribute("aria-labelledby")?.trim() &&
            !button.getAttribute("title")?.trim() &&
            !button.labels?.length &&
            !button.textContent?.trim(),
        )
        .map((button) => button.outerHTML.slice(0, 800));
      return {
        unnamedButtons,
        hasDocumentOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth ||
          document.body.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(routeA11y.unnamedButtons, `Unnamed visible buttons on ${route.path}`).toEqual([]);
    expect(routeA11y.hasDocumentOverflow, `Document-level overflow on ${route.path}`).toBe(false);

    if (route.name === "Order Detail") {
      const orderActions = page.locator(
        '[aria-label="Order actions"], [aria-label="إجراءات الطلب"]',
      );
      const mobileNavigation = page.locator('[aria-label="Mobile Navigation"]');
      await expect(
        orderActions,
        "Order actions must remain visible in the mobile summary",
      ).toBeVisible();
      await expect(mobileNavigation, "Mobile navigation must remain visible").toBeVisible();

      const [actionBox, navigationBox, actionPosition] = await Promise.all([
        orderActions.boundingBox(),
        mobileNavigation.boundingBox(),
        orderActions.evaluate((element) => getComputedStyle(element).position),
      ]);

      expect(actionPosition, "Order actions must stay in document flow").toBe("static");
      expect(actionBox, "Order actions must have measurable dimensions").not.toBeNull();
      expect(navigationBox, "Mobile navigation must have measurable dimensions").not.toBeNull();
      if (actionBox && navigationBox) {
        expect(
          actionBox.y + actionBox.height <= navigationBox.y,
          "Order actions must not overlap the global mobile navigation",
        ).toBe(true);
      }
    }

    // Assert body is non-empty
    const bodyText = (await page.innerText("body")).trim();
    expect(bodyText.length, `Route ${route.path} rendered blank page`).toBeGreaterThan(10);

    // Check table horizontal scrollability if tables exist
    const tables = page.locator("table");
    const tableCount = await tables.count();
    let tableAudit = null;

    if (tableCount > 0 && (await tables.first().isVisible())) {
      tableAudit = await page.evaluate(() => {
        const table = document.querySelector("table");
        if (!table) return null;
        const container = table.closest("div") || table.parentElement;
        const tableWidth = table.scrollWidth;
        const containerWidth = container ? container.clientWidth : 0;
        return {
          tableWidth,
          containerWidth,
          isScrollable: container ? container.scrollWidth > container.clientWidth : false,
          isValidTable: tableWidth > 0 && containerWidth > 0,
        };
      });

      if (tableAudit && tableAudit.tableWidth > 0) {
        expect(
          tableAudit.isValidTable,
          `Visible table on ${route.path} has 0-size dimensions`,
        ).toBe(true);
      }
    }

    const rawStatuses = ["\npending\n", "\nunpaid\n", "\nneeds_packing\n"].filter((s) =>
      bodyText.includes(s),
    );

    page.off("console", consoleHandler);
    page.off("pageerror", pageErrorHandler);

    auditResults.pageAudits[route.name] = {
      path: route.path,
      responseStatus,
      consoleErrors: pageConsoleErrors,
      uncaughtExceptions: pageUncaughtExceptions,
      rawStatuses,
      hasTables: tableCount > 0,
      tableAudit,
    };
  }

  // Assert zero uncaught application exceptions, raw status leak, or console errors across mobile navigation
  Object.values(auditResults.pageAudits).forEach((pAudit: any) => {
    expect(pAudit.uncaughtExceptions, `Uncaught exceptions on ${pAudit.path}`).toEqual([]);
    expect(pAudit.consoleErrors, `Console errors/React warnings on ${pAudit.path}`).toEqual([]);
    expect(pAudit.rawStatuses, `Raw unformatted status strings on ${pAudit.path}`).toEqual([]);
  });
});
