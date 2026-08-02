import { test, expect } from "@playwright/test";

// Desktop 1920x1080 UX Audit Test Suite
test.use({
  viewport: { width: 1920, height: 1080 },
});

const mockProducts = [
  {
    id: "prod-1",
    brand_id: "test-brand",
    name_en: "Luxury Silk Abaya",
    name_ar: "عباية حرير فاخرة",
    base_price: 45.0,
    is_visible: true,
    created_at: "2026-07-20T12:00:00Z",
  },
  {
    id: "prod-2",
    brand_id: "test-brand",
    name_en: "Classic Velvet Kaftan",
    name_ar: "قفطان مخملي كلاسيكي",
    base_price: 65.0,
    is_visible: true,
    created_at: "2026-07-21T12:00:00Z",
  },
];

const mockVariants = [
  {
    id: "var-1",
    product_id: "prod-1",
    brand_id: "test-brand",
    sku: "ABAYA-SILK-54",
    size: "54",
    color: "Black",
    selling_price: 45.0,
    cost_price: 20.0,
    stock_main: 12,
    stock_incubator: 0,
    created_at: "2026-07-20T12:00:00Z",
  },
  {
    id: "var-2",
    product_id: "prod-2",
    brand_id: "test-brand",
    sku: "KAFTAN-VEL-56",
    size: "56",
    color: "Emerald",
    selling_price: 65.0,
    cost_price: 30.0,
    stock_main: 2,
    stock_incubator: 0,
    created_at: "2026-07-21T12:00:00Z",
  },
];

const mockOrders = [
  {
    id: "order-101",
    invoice_number: "1001",
    brand_id: "test-brand",
    status: "confirmed",
    payment_status: "paid",
    total: 45.0,
    currency: "BHD",
    created_at: "2026-07-28T10:00:00Z",
    customer_id: "cust-1",
    customer_name_snapshot: "Fatima Al-Mansoor",
    customer_email_snapshot: "fatima@example.com",
    customer_phone_snapshot: "97339001122",
    order_items: [
      {
        id: "item-1",
        quantity: 1,
        unit_price: 45.0,
        line_total: 45.0,
        variant_id: "var-1",
      },
    ],
  },
];

test.beforeEach(async ({ page }) => {
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

  await page.route("**/auth/v1/user**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-user-id",
        email: "majeed@hotmail.it",
        role: "authenticated",
        aud: "authenticated",
        user_metadata: {},
        app_metadata: {},
      }),
    });
  });

  await page.route("**/rest/v1/profiles?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "test-user-id",
          email: "majeed@hotmail.it",
          status: "active",
          role: "super_admin",
          brand_id: "test-brand",
          brand: {
            id: "test-brand",
            slug: "test-brand",
            name_en: "Boutq Boutique",
            name_ar: "بوتيك بوتك",
          },
        },
      ]),
    });
  });

  await page.route("**/rest/v1/brands?**", async (route) => {
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

  await page.route("**/rest/v1/business_settings?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        brand_id: "test-brand",
        business_name: "Boutq Boutique",
        currency: "BHD",
        card_processing_fee: 1.5,
        benefit_processing_fee: 0.5,
      }),
    });
  });

  await page.route("**/rest/v1/products?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockProducts),
    });
  });

  await page.route("**/rest/v1/product_variants?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockVariants),
    });
  });

  await page.route("**/rest/v1/customers?**", async (route) => {
    const isSingle = (route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const customer = {
      id: "cust-1",
      name: "Fatima Al-Mansoor",
      phone: "97339001122",
      email: "fatima@example.com",
      notes: null,
      brand_id: "test-brand",
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(isSingle ? customer : [customer]),
    });
  });

  await page.route("**/rest/v1/orders?**", async (route) => {
    const isSingle = (route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(isSingle ? mockOrders[0] : mockOrders),
    });
  });

  await page.route("**/rest/v1/expenses?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/rest/v1/categories?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
});

test("Comprehensive 1920x1080 Desktop UX Audit across all routes", async ({ page }) => {
  const consoleLogs: Array<{ type: string; text: string }> = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      const text = msg.text();
      const lower = text.toLowerCase();
      const isNetworkNoise =
        lower.includes("websocket") ||
        lower.includes("wss://") ||
        lower.includes("ws://") ||
        lower.includes("failed to load resource") ||
        lower.startsWith("typeerror: failed to fetch") ||
        (lower.includes("[realtime] subscription error") && lower.includes("transport failure")) ||
        lower.includes("net::err_") ||
        lower.includes("status of 401") ||
        lower.includes("status of 403") ||
        lower.includes("status of 404");
      if (!isNetworkNoise) {
        console.log(`[BROWSER ${msg.type().toUpperCase()}]`, text);
        consoleLogs.push({ type: msg.type(), text });
      }
    }
  });

  page.on("pageerror", (err) => {
    console.log("[PAGE UNCAUGHT ERROR]", err.message);
    consoleLogs.push({ type: "pageerror", text: err.message });
  });

  // 1. Audit Dashboard
  console.log("--- AUDITING DASHBOARD ---");
  await page.goto("/admin/b/test-brand/dashboard");
  await page.waitForLoadState("networkidle");

  const viewport = page.viewportSize();
  expect(viewport?.width).toBe(1920);
  expect(viewport?.height).toBe(1080);

  // Check cursor states on dashboard buttons
  const buttons = page.locator("button, a[href]");
  const count = await buttons.count();
  for (let i = 0; i < Math.min(count, 10); i++) {
    const el = buttons.nth(i);
    if (await el.isVisible()) {
      const cursor = await el.evaluate((node) => window.getComputedStyle(node).cursor);
      // Log elements that don't have cursor: pointer
      if (cursor !== "pointer") {
        console.log(
          `[UX CURSOR WARNING] Interactive element index ${i} has cursor: '${cursor}' instead of 'pointer'`,
        );
      }
    }
  }

  // 2. Audit Orders
  console.log("--- AUDITING ORDERS ---");
  await page.goto("/admin/b/test-brand/orders");
  await page.waitForLoadState("networkidle");

  // Check table row hover effects and layout
  const orderRows = page.locator("table tbody tr");
  if ((await orderRows.count()) > 0) {
    const firstRow = orderRows.first();
    const firstCell = firstRow.locator("td").first();
    await firstCell.hover();
    const cellBg = await firstCell.evaluate(
      (node) => window.getComputedStyle(node).backgroundColor,
    );
    console.log("Order row hover computed cell background:", cellBg);
    expect(cellBg, "Hovered order row cell background must not be transparent").not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(cellBg, "Hovered order row cell background must not be transparent").not.toBe(
      "oklab(0 0 0 / 0)",
    );
  }

  // 3. Audit Inventory (Products)
  console.log("--- AUDITING INVENTORY / PRODUCTS ---");
  const invResponse = await page.goto("/admin/b/test-brand/inventory");
  expect(invResponse?.status() ?? 200).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main").first()).toBeVisible();

  // Check 'New Product' button & modal UX
  const newProductBtn = page.getByRole("button", { name: /New Product|منتج جديد/i }).first();
  if (await newProductBtn.isVisible()) {
    await newProductBtn.click();
    await page.waitForTimeout(300);
    const modal = page.locator('[role="dialog"]');
    if (await modal.isVisible()) {
      console.log("New Product modal opened successfully");
      // Check for close button or ESC key closing
      await page.keyboard.press("Escape");
    }
  }

  // 4. Audit Analytics / Reports
  console.log("--- AUDITING REPORTS ---");
  await page.goto("/admin/b/test-brand/reports");
  await page.waitForLoadState("networkidle");

  // 5. Audit Settings
  console.log("--- AUDITING SETTINGS ---");
  await page.goto("/admin/b/test-brand/settings");
  await page.waitForLoadState("networkidle");

  const remainingAdminRoutes = [
    "/admin/b/test-brand/customers",
    "/admin/b/test-brand/customers/cust-1",
    "/admin/b/test-brand/orders/order-101",
    "/admin/b/test-brand/categories",
    "/admin/b/test-brand/campaigns",
    "/admin/b/test-brand/discounts",
    "/admin/b/test-brand/expenses",
    "/admin/b/test-brand/communications",
    "/admin/b/test-brand/pages",
    "/admin/b/test-brand/team",
    "/admin/b/test-brand/integrations",
    "/admin/b/test-brand/reports/sales",
    "/admin/b/test-brand/reports/products",
    "/admin/b/test-brand/reports/customers",
    "/admin/b/test-brand/reports/export",
  ];

  for (const path of remainingAdminRoutes) {
    const response = await page.goto(path);
    expect(response?.status() ?? 200, `${path} returned an invalid response`).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main h1"), `${path} must expose one page heading`).toHaveCount(1);
    await expect(page.locator("main h1"), `${path} page heading must be visible`).toBeVisible();
    const hasDocumentOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasDocumentOverflow, `${path} has document-level horizontal overflow`).toBe(false);
  }

  console.log("=== DESKTOP UX AUDIT COMPLETE ===");
  console.log("Total captured console warnings/errors:", consoleLogs.length);
  expect(consoleLogs, "Desktop routes emitted application errors or warnings").toEqual([]);
});
