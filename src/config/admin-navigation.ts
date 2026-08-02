import {
  ShoppingCart,
  Store,
  FileText,
  Wallet,
  Package,
  Clock,
  Users,
  LayoutDashboard,
  Settings,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItemConfig {
  id: string;
  to: string;
  params?: Record<string, string>;
  labelEn: string;
  labelAr: string;
  icon: LucideIcon;
  permission?: string;
  adminOnly?: boolean;
  section: "pos_retail" | "incubator" | "operations" | "system";
}

export interface GetNavItemsOptions {
  activeSlug: string | null;
  isCourier: boolean;
  isAdmin: boolean;
  hasPermission: (permission: string) => boolean;
  t: (key: string) => string;
  lang: "en" | "ar";
}

export function getAdminNavItems({
  activeSlug,
  isCourier,
  isAdmin,
  hasPermission,
  t,
  lang,
}: GetNavItemsOptions): AdminNavItemConfig[] {
  if (!activeSlug) return [];

  if (isCourier) {
    return [
      {
        id: "orders",
        to: "/admin/b/$slug/orders",
        params: { slug: activeSlug },
        labelEn: "Contracts & Invoices",
        labelAr: lang === "ar" ? "العقود والفواتير" : "Contracts & Invoices",
        icon: ReceiptText,
        section: "incubator",
      },
    ];
  }

  const allItems: AdminNavItemConfig[] = [
    // Section 1: RETAIL & POS STATION
    {
      id: "pos",
      to: "/admin/b/$slug/pos",
      params: { slug: activeSlug },
      labelEn: "POS Register",
      labelAr: lang === "ar" ? "🛒 نقطة البيع (POS)" : "🛒 POS Register",
      icon: ShoppingCart,
      permission: "manage_orders",
      section: "pos_retail",
    },
    {
      id: "shifts",
      to: "/admin/b/$slug/reports",
      params: { slug: activeSlug },
      labelEn: "POS Shifts & Registers",
      labelAr: lang === "ar" ? "⏱️ وردية الكاشير والسجلات" : "⏱️ POS Shifts & Registers",
      icon: Clock,
      permission: "manage_orders",
      section: "pos_retail",
    },

    // Section 2: INCUBATOR & VENDOR MANAGEMENT
    {
      id: "vendors",
      to: "/admin/brands",
      labelEn: "Vendors & Incubator Brands",
      labelAr: lang === "ar" ? "🏬 إدارة العلامات والمتاجر" : "🏬 Vendors & Incubator Brands",
      icon: Store,
      adminOnly: true,
      section: "incubator",
    },
    {
      id: "contracts",
      to: "/admin/b/$slug/orders",
      params: { slug: activeSlug },
      labelEn: "Vendor Contracts & Invoices",
      labelAr: lang === "ar" ? "📄 العقود وفواتير الإيجار" : "📄 Vendor Contracts & Invoices",
      icon: FileText,
      permission: "manage_orders",
      section: "incubator",
    },
    {
      id: "ledger",
      to: "/admin/b/$slug/expenses",
      params: { slug: activeSlug },
      labelEn: "Vendor Ledger & Balances",
      labelAr: lang === "ar" ? "💰 دفتر الأستاذ وأرصدة البائعين" : "💰 Vendor Ledger & Balances",
      icon: Wallet,
      permission: "view_financials",
      section: "incubator",
    },

    // Section 3: INVENTORY & STAFF OPERATIONS
    {
      id: "inventory",
      to: "/admin/b/$slug/inventory",
      params: { slug: activeSlug },
      labelEn: "Inventory & Barcodes",
      labelAr: lang === "ar" ? "📦 المخزون والبارکود" : "📦 Inventory & Barcodes",
      icon: Package,
      permission: "manage_inventory",
      section: "operations",
    },
    {
      id: "team",
      to: "/admin/b/$slug/team",
      params: { slug: activeSlug },
      labelEn: "Team & Cashier Management",
      labelAr: lang === "ar" ? "👥 إدارة الكاشير والموظفين" : "👥 Team & Cashier Management",
      icon: Users,
      adminOnly: true,
      section: "operations",
    },

    // Section 4: DASHBOARD & SYSTEM
    {
      id: "dashboard",
      to: "/admin/b/$slug/dashboard",
      params: { slug: activeSlug },
      labelEn: "Incubator Dashboard",
      labelAr: lang === "ar" ? "📊 لوحة تحكم الحاضنة" : "📊 Incubator Dashboard",
      icon: LayoutDashboard,
      section: "system",
    },
    {
      id: "settings",
      to: "/admin/b/$slug/settings",
      params: { slug: activeSlug },
      labelEn: "Store Settings",
      labelAr: t("nav.settings"),
      icon: Settings,
      permission: "manage_settings",
      section: "system",
    },
  ];

  return allItems.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.permission) return hasPermission(item.permission);
    return true;
  });
}
