import { useState, useEffect } from "react";

export type RecentModule = {
  path: string;
  titleEn: string;
  titleAr: string;
  timestamp: number;
};

export type PinnedAction = {
  id: string;
  titleEn: string;
  titleAr: string;
  route: string;
  iconName?: string;
};

const RECENT_MODULES_KEY = "boutq_os_recent_modules";
const PINNED_ACTIONS_KEY = "boutq_os_pinned_actions";
const PANEL_WIDTHS_KEY = "boutq_os_panel_widths";
const NAV_FILTERS_KEY = "boutq_os_nav_filters";

// Route Title Resolver Map for distinct, localized sub-route titles
export function resolveRouteTitles(
  path: string,
  fallbackTitle?: string,
): { en: string; ar: string } {
  const cleanPath = path.split("?")[0].replace(/\/+$/, "");

  if (cleanPath.endsWith("/dashboard")) return { en: "Dashboard", ar: "لوحة التحكم" };
  if (cleanPath.endsWith("/orders/new")) return { en: "New Order", ar: "إنشاء طلب جديد" };
  if (cleanPath.endsWith("/orders")) return { en: "Orders & Invoices", ar: "الطلبات والفواتير" };
  if (cleanPath.endsWith("/inventory"))
    return { en: "Inventory & Catalog", ar: "المنتجات والمخزون" };
  if (cleanPath.endsWith("/customers")) return { en: "Customers CRM", ar: "إدارة العملاء" };
  if (cleanPath.endsWith("/reports/sales")) return { en: "Sales Reports", ar: "تقارير المبيعات" };
  if (cleanPath.endsWith("/reports/customers"))
    return { en: "Customer Reports", ar: "تقارير العملاء" };
  if (cleanPath.endsWith("/reports/products"))
    return { en: "Product Reports", ar: "تقارير المنتجات" };
  if (cleanPath.endsWith("/reports/export")) return { en: "Export Reports", ar: "تصدير البيانات" };
  if (cleanPath.endsWith("/reports")) return { en: "Analytics Reports", ar: "التقارير التحليلية" };
  if (cleanPath.endsWith("/settings")) return { en: "Store Settings", ar: "إعدادات المتجر" };
  if (cleanPath.endsWith("/discounts"))
    return { en: "Discounts & Promos", ar: "الخصومات والكوبونات" };
  if (cleanPath.endsWith("/campaigns"))
    return { en: "Marketing Campaigns", ar: "الحملات والتسويق" };
  if (cleanPath.endsWith("/communications")) return { en: "Outbound Logs", ar: "سجلات التواصل" };
  if (cleanPath.endsWith("/pages")) return { en: "Storefront Pages", ar: "صفحات المتجر" };
  if (cleanPath.endsWith("/team")) return { en: "Team & Staff", ar: "فريق العمل" };
  if (cleanPath.endsWith("/integrations"))
    return { en: "Integrations & API", ar: "الربط والتكامل" };
  if (cleanPath.includes("/admin/super/requests"))
    return { en: "Platform Control", ar: "تحكم المنصة الخارقة" };

  return {
    en: fallbackTitle || "Workspace",
    ar: fallbackTitle || "مساحة العمل",
  };
}

// 1. Recently Visited Modules Tracker
export function getRecentModules(): RecentModule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_MODULES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function recordVisitedModule(module: Omit<RecentModule, "timestamp">) {
  if (typeof window === "undefined") return;
  try {
    const titles = resolveRouteTitles(module.path, module.titleEn);
    const recents = getRecentModules().filter((m) => m.path !== module.path);
    const updated = [
      {
        path: module.path,
        titleEn: titles.en,
        titleAr: titles.ar,
        timestamp: Date.now(),
      },
      ...recents,
    ].slice(0, 5);
    localStorage.setItem(RECENT_MODULES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

// 2. Pinned Quick Actions
export function getPinnedActions(activeSlug?: string | null): PinnedAction[] {
  const slug = activeSlug || "pura";
  const defaultQuickActions: PinnedAction[] = [
    {
      id: "new_order",
      titleEn: "+ New Order",
      titleAr: "+ طلب جديد",
      route: `/admin/b/${slug}/orders/new`,
    },
    {
      id: "new_product",
      titleEn: "+ Add Product",
      titleAr: "+ إضافة منتج",
      route: `/admin/b/${slug}/inventory?action=new`,
    },
    {
      id: "export_sales",
      titleEn: "Export Sales",
      titleAr: "تصدير المبيعات",
      route: `/admin/b/${slug}/reports/export`,
    },
  ];

  if (typeof window === "undefined") return defaultQuickActions;
  try {
    const raw = localStorage.getItem(PINNED_ACTIONS_KEY);
    if (!raw) return defaultQuickActions;
    const items: PinnedAction[] = JSON.parse(raw);
    return items.map((item) => ({
      ...item,
      route: item.route.replace(/\/admin\/b\/[^/]+/, `/admin/b/${slug}`),
    }));
  } catch {
    return defaultQuickActions;
  }
}

export function togglePinnedAction(action: PinnedAction): boolean {
  if (typeof window === "undefined") return false;
  try {
    const current = getPinnedActions();
    const exists = current.some((a) => a.id === action.id);
    const updated = exists ? current.filter((a) => a.id !== action.id) : [...current, action];
    localStorage.setItem(PINNED_ACTIONS_KEY, JSON.stringify(updated));
    return !exists;
  } catch {
    return false;
  }
}

// 3. Persistent Panel Width Preferences
export function getPanelWidth(panelId: string, defaultWidth: number = 30): number {
  if (typeof window === "undefined") return defaultWidth;
  try {
    const raw = localStorage.getItem(PANEL_WIDTHS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return typeof map[panelId] === "number" ? map[panelId] : defaultWidth;
  } catch {
    return defaultWidth;
  }
}

export function setPanelWidth(panelId: string, width: number) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PANEL_WIDTHS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[panelId] = width;
    localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

// 4. Context-Preserving Return Navigation
export function saveNavFilterContext(routeKey: string, searchParams: Record<string, any>) {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(NAV_FILTERS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[routeKey] = searchParams;
    sessionStorage.setItem(NAV_FILTERS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function getNavFilterContext(routeKey: string): Record<string, any> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(NAV_FILTERS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map[routeKey] ?? null;
  } catch {
    return null;
  }
}

// React Hook for Recent Modules
export function useRecentModules() {
  const [recents, setRecents] = useState<RecentModule[]>([]);

  useEffect(() => {
    setRecents(getRecentModules());
  }, []);

  return recents;
}
