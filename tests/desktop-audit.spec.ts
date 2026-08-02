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
        email: "admin@boutq.store",
        role: "authenticated",
        aud: "authenticated",
      },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    try {
      window.localStorage.setItem("sb-ikciahnuqhemvnyfvbyp-auth-token", JSON.stringify(session));
    } catch {}
  });

  await page.route("**/auth/v1/user**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-user-id",
        email: "admin@boutq.store",
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
          status: "active",
          role: "brand_admin",
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "cust-1", name: "Fatima Al-Mansoor", phone: "97339001122", brand_id: "test-brand" },
      ]),
    });
  });

  await page.route("**/rest/v1/orders?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockOrders),
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
      console.log(`[BROWSER ${msg.type().toUpperCase()}]`, msg.text());
      consoleLogs.push({ type: msg.type(), text: msg.text() });
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
        console.log(`[UX CURSOR WARNING] Interactive element index ${i} has cursor: '${cursor}' instead of 'pointer'`);
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
    await firstRow.hover();
    const bgBefore = await firstRow.evaluate((node) => window.getComputedStyle(node).backgroundColor);
    console.log("Order row hover computed background:", bgBefore);
  }

  // 3. Audit Inventory (Products)
  console.log("--- AUDITING INVENTORY / PRODUCTS ---");
  await page.goto("/admin/b/test-brand/inventory");
  await page.waitForLoadState("networkidle");

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

  console.log("=== DESKTOP UX AUDIT COMPLETE ===");
  console.log("Total captured console warnings/errors:", consoleLogs.length);
});
