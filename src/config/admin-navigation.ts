import {
  LayoutDashboard,
  Package,
  Users,
  ReceiptText,
  Settings,
  Wallet,
  Megaphone,
  Shield,
  Plug,
  Tags,
  FileText,
  BadgePercent,
  Mail,
  BarChart,
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
  section: "overview" | "operations" | "growth_finance" | "storefront_settings";
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
        labelEn: "Orders",
        labelAr: t("nav.orders"),
        icon: ReceiptText,
        section: "operations",
      },
    ];
  }

  const allItems: AdminNavItemConfig[] = [
    // Group 1: OVERVIEW
    {
      id: "dashboard",
      to: "/admin/b/$slug/dashboard",
      params: { slug: activeSlug },
      labelEn: "Dashboard",
      labelAr: t("nav.dashboard"),
      icon: LayoutDashboard,
      section: "overview",
    },
    {
      id: "reports",
      to: "/admin/b/$slug/reports",
      params: { slug: activeSlug },
      labelEn: "Reports",
      labelAr: lang === "ar" ? "التقارير" : "Reports",
      icon: BarChart,
      permission: "manage_orders",
      section: "overview",
    },

    // Group 2: OPERATIONS
    {
      id: "orders",
      to: "/admin/b/$slug/orders",
      params: { slug: activeSlug },
      labelEn: "Orders & Invoices",
      labelAr: lang === "ar" ? "الطلبات والفواتير" : "Orders & Invoices",
      icon: ReceiptText,
      permission: "manage_orders",
      section: "operations",
    },
    {
      id: "customers",
      to: "/admin/b/$slug/customers",
      params: { slug: activeSlug },
      labelEn: "Customers",
      labelAr: t("nav.customers"),
      icon: Users,
      permission: "manage_customers",
      section: "operations",
    },
    {
      id: "inventory",
      to: "/admin/b/$slug/inventory",
      params: { slug: activeSlug },
      labelEn: "Inventory",
      labelAr: t("nav.inventory"),
      icon: Package,
      permission: "manage_inventory",
      section: "operations",
    },
    {
      id: "categories",
      to: "/admin/b/$slug/categories",
      params: { slug: activeSlug },
      labelEn: "Categories",
      labelAr: lang === "ar" ? "الأقسام" : "Categories",
      icon: Tags,
      permission: "manage_inventory",
      section: "operations",
    },

    // Group 3: GROWTH & FINANCE
    {
      id: "campaigns",
      to: "/admin/b/$slug/campaigns",
      params: { slug: activeSlug },
      labelEn: "WhatsApp Campaigns",
      labelAr: lang === "ar" ? "حملات الواتساب" : "WhatsApp Campaigns",
      icon: Megaphone,
      permission: "manage_orders",
      section: "growth_finance",
    },
    {
      id: "discounts",
      to: "/admin/b/$slug/discounts",
      params: { slug: activeSlug },
      labelEn: "Discount Codes",
      labelAr: lang === "ar" ? "رموز الخصم" : "Discount Codes",
      icon: BadgePercent,
      permission: "manage_settings",
      section: "growth_finance",
    },
    {
      id: "expenses",
      to: "/admin/b/$slug/expenses",
      params: { slug: activeSlug },
      labelEn: "Expenses",
      labelAr: t("nav.expenses"),
      icon: Wallet,
      permission: "view_financials",
      section: "growth_finance",
    },

    // Group 4: STOREFRONT & SETTINGS
    {
      id: "integrations",
      to: "/admin/b/$slug/integrations",
      params: { slug: activeSlug },
      labelEn: "Integrations",
      labelAr: t("nav.integrations"),
      icon: Plug,
      adminOnly: true,
      section: "storefront_settings",
    },
    {
      id: "communications",
      to: "/admin/b/$slug/communications",
      params: { slug: activeSlug },
      labelEn: "Communications",
      labelAr: lang === "ar" ? "الاتصالات" : "Communications",
      icon: Mail,
      permission: "manage_settings",
      section: "storefront_settings",
    },
    {
      id: "pages",
      to: "/admin/b/$slug/pages",
      params: { slug: activeSlug },
      labelEn: "Pages & Policies",
      labelAr: lang === "ar" ? "الصفحات والسياسات" : "Pages & Policies",
      icon: FileText,
      permission: "manage_settings",
      section: "storefront_settings",
    },
    {
      id: "team",
      to: "/admin/b/$slug/team",
      params: { slug: activeSlug },
      labelEn: "Team Management",
      labelAr: lang === "ar" ? "إدارة الموظفين" : "Team Management",
      icon: Shield,
      adminOnly: true,
      section: "storefront_settings",
    },
    {
      id: "settings",
      to: "/admin/b/$slug/settings",
      params: { slug: activeSlug },
      labelEn: "Settings",
      labelAr: t("nav.settings"),
      icon: Settings,
      permission: "manage_settings",
      section: "storefront_settings",
    },
  ];

  return allItems.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.permission) return hasPermission(item.permission);
    return true;
  });
}
