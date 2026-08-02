import { test, expect } from "@playwright/test";

// Mock database states for Playwright intercepts
const mockProducts = [
  {
    id: "prod-1",
    brand_id: "test-brand",
    name: "Original Mock Product",
    name_en: "Original Mock Product",
    name_ar: "المنتج الأصلي",
    base_price: 15.0,
    is_visible: true,
    is_active: true,
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
    cost_price: 5.0,
    stock_main: 10,
    stock_incubator: 2,
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
    payment_method: "card",
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
      },
    ],
  },
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

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
    } catch {}
  });

  // Mock Supabase calls
  await page.route("**/auth/v1/user**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-user-id",
        email: "admin@test.com",
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
            name_en: "Boutq Test Store",
            name_ar: "متجر بوك التجريبي",
          },
        },
      ]),
    });
  });

  await page.route("**/rest/v1/business_settings?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "setting-1",
        brand_id: "test-brand",
        business_name: "Boutq Test Store",
        currency: "BHD",
        card_processing_fee: 2.5,
        benefit_processing_fee: 1.0,
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

  await page.route("**/rest/v1/orders?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockOrders),
    });
  });

  await page.route("**/rest/v1/customers?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "cust-1",
          brand_id: "test-brand",
          name: "John Doe",
          phone: "97312345678",
          email: "john@example.com",
        },
      ]),
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

  await page.route("**/rest/v1/brands?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "test-brand", slug: "test-brand", name_en: "Boutq Test Store", is_active: true },
      ]),
    });
  });
});

test("Comprehensive Mobile UX Audit at 390x844 Viewport", async ({ page }) => {
  const auditResults: {
    hamburgerMenu: any;
    tapTargets: any[];
    mobileTables: any[];
    viewportAndLayout: any;
    pageAudits: Record<string, any>;
  } = {
    hamburgerMenu: {},
    tapTargets: [],
    mobileTables: [],
    viewportAndLayout: {},
    pageAudits: {},
  };

  // Navigate to Dashboard
  await page.goto("/admin/b/test-brand/dashboard");
  await page.waitForLoadState("networkidle");

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
  const topHeader = page.locator("div.fixed.top-0.inset-x-0").first();
  const headerBoundingBox = await topHeader.boundingBox();
  auditResults.viewportAndLayout.headerBoundingBox = headerBoundingBox;

  // Measure Header Tap Targets
  const headerButtons = topHeader.locator("button");
  const headerButtonCount = await headerButtons.count();
  for (let i = 0; i < headerButtonCount; i++) {
    const btn = headerButtons.nth(i);
    const box = await btn.boundingBox();
    const ariaLabel = (await btn.getAttribute("aria-label")) || (await btn.innerText());
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

  // 2. Audit Hamburger Menu & Sheet Navigation
  const menuBtn = page.locator("button[aria-label='Menu']").first();
  await expect(menuBtn).toBeVisible();

  // Check accessibility before click
  const menuAriaLabel = await menuBtn.getAttribute("aria-label");
  auditResults.hamburgerMenu.ariaLabel = menuAriaLabel;

  // Open Sheet
  await menuBtn.click();
  await page.waitForTimeout(400);

  // Check sheet accessibility & bounding box
  const sheetContent = page.locator("[role='dialog']").first();
  const sheetVisible = await sheetContent.isVisible();
  auditResults.hamburgerMenu.sheetVisible = sheetVisible;

  if (sheetVisible) {
    const sheetBox = await sheetContent.boundingBox();
    const sheetAriaRole = await sheetContent.getAttribute("role");
    const sheetTitle = await sheetContent.locator(".sr-only").first().innerText().catch(() => "None");
    const backdrop = page.locator("[data-state='open'].fixed.inset-0").first();
    const backdropVisible = await backdrop.isVisible();

    auditResults.hamburgerMenu.sheetBox = sheetBox;
    auditResults.hamburgerMenu.sheetAriaRole = sheetAriaRole;
    auditResults.hamburgerMenu.sheetTitle = sheetTitle;
    auditResults.hamburgerMenu.backdropVisible = backdropVisible;

    // Check Z-Indexes
    const zIndexes = await page.evaluate(() => {
      const header = document.querySelector("div.fixed.top-0.inset-x-0");
      const dialog = document.querySelector("[role='dialog']");
      const overlay = document.querySelector("[data-state='open'].fixed.inset-0");
      return {
        headerZIndex: header ? window.getComputedStyle(header).zIndex : null,
        dialogZIndex: dialog ? window.getComputedStyle(dialog).zIndex : null,
        overlayZIndex: overlay ? window.getComputedStyle(overlay).zIndex : null,
      };
    });
    auditResults.hamburgerMenu.zIndexes = zIndexes;

    // Measure Sheet Nav Items Tap Targets
    const sheetNavLinks = sheetContent.locator("nav a");
    const navLinkCount = await sheetNavLinks.count();
    for (let i = 0; i < navLinkCount; i++) {
      const link = sheetNavLinks.nth(i);
      const linkBox = await link.boundingBox();
      const linkText = await link.innerText();
      if (linkBox) {
        const isViolating = linkBox.width < 44 || linkBox.height < 44;
        auditResults.tapTargets.push({
          location: "Mobile Sidebar Sheet Nav Link",
          label: linkText.trim().replace(/\n/g, " "),
          width: Math.round(linkBox.width),
          height: Math.round(linkBox.height),
          violates: isViolating,
        });
      }
    }
  }

  // Close sheet by clicking backdrop
  const backdropElem = page.locator("[data-state='open'].fixed.inset-0").first();
  if (await backdropElem.isVisible()) {
    await backdropElem.click({ position: { x: 350, y: 100 } });
    await page.waitForTimeout(400);
    auditResults.hamburgerMenu.closedViaBackdrop = !(await sheetContent.isVisible());
  }

  // 3. Test Navigation across all 5 key routes
  const routesToTest = [
    { name: "Dashboard", path: "/admin/b/test-brand/dashboard" },
    { name: "Orders", path: "/admin/b/test-brand/orders" },
    { name: "Products/Inventory", path: "/admin/b/test-brand/inventory" },
    { name: "Analytics/Reports", path: "/admin/b/test-brand/reports" },
    { name: "Settings", path: "/admin/b/test-brand/settings" },
  ];

  for (const route of routesToTest) {
    console.log(`Auditing page: ${route.name} (${route.path})`);
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);

    const pageAudit: any = {
      path: route.path,
      hasHorizontalOverflow: false,
      tapTargetViolations: [],
      tables: [],
    };

    // Check page horizontal overflow
    const pageOverflow = await page.evaluate(() => {
      const mainEl = document.querySelector("main");
      const docWidth = document.documentElement.clientWidth;
      const mainScrollWidth = mainEl ? mainEl.scrollWidth : 0;
      return {
        docWidth,
        mainScrollWidth,
        hasHorizontalOverflow: mainScrollWidth > docWidth,
      };
    });
    pageAudit.hasHorizontalOverflow = pageOverflow.hasHorizontalOverflow;

    // Check buttons, links, inputs for tap target size violations (<44x44px)
    const interactiveElements = page.locator("main button, main a, main input, main select");
    const count = await interactiveElements.count();
    for (let i = 0; i < Math.min(count, 20); i++) {
      const el = interactiveElements.nth(i);
      if (await el.isVisible()) {
        const box = await el.boundingBox();
        const text = (await el.innerText()).trim() || (await el.getAttribute("placeholder")) || (await el.getAttribute("aria-label")) || "Element";
        if (box && box.width > 0 && box.height > 0) {
          if (box.width < 44 || box.height < 44) {
            const labelStr = text.substring(0, 30).replace(/\n/g, " ");
            pageAudit.tapTargetViolations.push({
              text: labelStr,
              width: Math.round(box.width),
              height: Math.round(box.height),
            });
            auditResults.tapTargets.push({
              location: `${route.name} Page`,
              label: labelStr,
              width: Math.round(box.width),
              height: Math.round(box.height),
              violates: true,
            });
          }
        }
      }
    }

    // Check Tables on Page
    const tables = page.locator("table");
    const tableCount = await tables.count();
    for (let i = 0; i < tableCount; i++) {
      const tbl = tables.nth(i);
      const tblInfo = await page.evaluate((tableEl) => {
        const container = tableEl.closest(".overflow-x-auto, [class*='overflow']");
        const tblBox = tableEl.getBoundingClientRect();
        const containerBox = container ? container.getBoundingClientRect() : null;
        const ths = Array.from(tableEl.querySelectorAll("th")).map((th) => ({
          text: th.textContent?.trim(),
          sticky: window.getComputedStyle(th).position === "sticky",
        }));
        return {
          tableWidth: Math.round(tblBox.width),
          containerWidth: containerBox ? Math.round(containerBox.width) : null,
          hasHorizontalScroll: container ? container.scrollWidth > container.clientWidth : tblBox.width > window.innerWidth,
          containerOverflowX: container ? window.getComputedStyle(container).overflowX : null,
          columnCount: ths.length,
          headers: ths.map((h) => h.text),
        };
      }, await tbl.elementHandle());

      pageAudit.tables.push(tblInfo);
      auditResults.mobileTables.push({
        page: route.name,
        tableInfo: tblInfo,
      });
    }

    auditResults.pageAudits[route.name] = pageAudit;
  }

  // Print full detailed audit report to console
  console.log("\n=== MOBILE UX AUDIT DETAILED RESULTS ===");
  console.log(JSON.stringify(auditResults, null, 2));

  expect(auditResults.viewportAndLayout.bodyOverflow.bodyOverflowStyle).toBe("hidden");
});
