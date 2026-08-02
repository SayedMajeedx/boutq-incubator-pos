import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  Package,
  Users,
  ReceiptText,
  TrendingUp,
  CalendarDays,
  Trophy,
  Wallet,
  PiggyBank,
  AlertTriangle,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { formatDate, formatMoney } from "@/lib/format";
import { useI18n, useT } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";
import { useBrand } from "@/lib/brand-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useMemo, useEffect, useState } from "react";
import { getOrderCustomerName } from "@/lib/order-customer-snapshot";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { canViewFinancials } = useProfile();
  const { slug } = Route.useParams();
  const brand = useBrand();
  const brandId = brand.id;
  const locale = lang === "ar" ? "ar-BH-u-nu-latn" : "en-US";

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 1. Fetch Business settings (business name, currency, etc.)
  const businessSettings = useQuery({
    queryKey: ["dashboard-business-settings", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("business_name, currency, card_processing_fee, benefit_processing_fee")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      return (
        data ?? {
          business_name: "",
          currency: "BHD",
          card_processing_fee: 0,
          benefit_processing_fee: 0,
        }
      );
    },
  });

  const currency = businessSettings.data?.currency ?? "BHD";

  // 2. Fetch all products
  const productsQ = useQuery({
    queryKey: ["dashboard-products", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_ar, name_en, category, is_active")
        .eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 3. Fetch all variants (with stock levels, created_at date, and cost price)
  const variantsQ = useQuery({
    queryKey: ["dashboard-variants", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select(
          "id, product_id, size, color, selling_price, cost_price, stock_main, stock_incubator, created_at",
        )
        .eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 4. Fetch all customers
  const customersQ = useQuery({
    queryKey: ["dashboard-customers", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    },
    // Customer PII is intentionally not published to Supabase Realtime.
    // This keeps the dashboard current without exposing customer records on a
    // websocket channel.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // 5. Fetch all orders (and order items)
  const ordersQ = useQuery({
    queryKey: ["dashboard-orders-with-items", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, invoice_number, created_at, currency, total, status, customer_id, customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot, customers(name), payment_method, order_items(id, variant_id, quantity, unit_price, line_total)",
        )
        .eq("brand_id", brandId)
        .in("status", ["confirmed", "paid", "shipped", "completed"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Keep the operational feed separate from revenue reporting. Pending
  // BenefitPay orders belong in "Recent orders" even before they are paid.
  const recentOrdersQ = useQuery({
    queryKey: ["dashboard-recent-orders", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, invoice_number, created_at, currency, total, status, payment_status, customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot, customers(name)",
        )
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .order("invoice_number", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as any[];
    },
    // A small resilience fallback if a browser temporarily loses its realtime socket.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // 6. Fetch all manual expenses (for OPEX summing)
  const expensesQ = useQuery({
    queryKey: ["dashboard-expenses", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("amount, expense_date")
        .eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    },
  });

  useRealtimeInvalidate(
    [
      { table: "orders", brandId, queryKey: ["dashboard-orders-with-items", brandId] },
      { table: "orders", brandId, queryKey: ["dashboard-recent-orders", brandId] },
      { table: "orders", brandId, queryKey: ["dashboard-customers", brandId] },
      { table: "order_items", brandId, queryKey: ["dashboard-orders-with-items", brandId] },
      { table: "products", brandId, queryKey: ["dashboard-products", brandId] },
      { table: "product_variants", brandId, queryKey: ["dashboard-variants", brandId] },
      { table: "expenses", brandId, queryKey: ["dashboard-expenses", brandId] },
      { table: "business_settings", brandId, queryKey: ["dashboard-business-settings", brandId] },
    ],
    `dashboard-realtime:${brandId}`,
  );

  const isLoading =
    businessSettings.isLoading ||
    productsQ.isLoading ||
    variantsQ.isLoading ||
    customersQ.isLoading ||
    ordersQ.isLoading ||
    recentOrdersQ.isLoading ||
    expensesQ.isLoading;

  // Financial intelligence aggregations (Revenue, COGS, OPEX, Net Profit, Gross Margin %)
  const financials = useMemo(() => {
    const orders = ordersQ.data ?? [];
    const expenses = expensesQ.data ?? [];
    const variants = variantsQ.data ?? [];

    const variantCostMap = new Map<string, number>();
    variants.forEach((v) => {
      variantCostMap.set(v.id, Number(v.cost_price || 0));
    });

    const revenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    let cogs = 0;
    orders.forEach((order) => {
      (order.order_items ?? []).forEach((item: any) => {
        const cost = variantCostMap.get(item.variant_id) ?? 0;
        cogs += cost * Number(item.quantity || 0);
      });
    });

    const cardFeePercent = Number((businessSettings.data as any)?.card_processing_fee ?? 0);
    const benefitFeePercent = Number((businessSettings.data as any)?.benefit_processing_fee ?? 0);

    let paymentProcessingFees = 0;
    orders.forEach((o) => {
      const totalVal = Number(o.total || 0);
      if (o.payment_method === "card") {
        paymentProcessingFees += totalVal * (cardFeePercent / 100);
      } else if (o.payment_method === "benefit") {
        paymentProcessingFees += totalVal * (benefitFeePercent / 100);
      }
    });

    const opex =
      expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0) + paymentProcessingFees;

    const totalExpenses = cogs + opex;
    const netProfit = revenue - totalExpenses;
    const grossMarginPercent = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0;

    // Period Comparison Deltas (Current 30 Days vs Prior 30 Days)
    const nowMs = new Date().getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

    const current30Orders = orders.filter((o) => {
      if (!o.created_at) return false;
      const d = new Date(o.created_at);
      if (isNaN(d.getTime())) return false;
      return nowMs - d.getTime() <= thirtyDaysMs;
    });

    const prior30Orders = orders.filter((o) => {
      if (!o.created_at) return false;
      const d = new Date(o.created_at);
      if (isNaN(d.getTime())) return false;
      const diff = nowMs - d.getTime();
      return diff > thirtyDaysMs && diff <= sixtyDaysMs;
    });

    const revenueCurrent = current30Orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const revenuePrior = prior30Orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const revenueDeltaPct =
      revenuePrior > 0
        ? ((revenueCurrent - revenuePrior) / revenuePrior) * 100
        : revenueCurrent > 0
          ? 100
          : 0;

    const ordersCurrent = current30Orders.length;
    const ordersPrior = prior30Orders.length;
    const ordersDeltaPct =
      ordersPrior > 0
        ? ((ordersCurrent - ordersPrior) / ordersPrior) * 100
        : ordersCurrent > 0
          ? 100
          : 0;

    const aovCurrent = ordersCurrent > 0 ? revenueCurrent / ordersCurrent : 0;
    const aovPrior = ordersPrior > 0 ? revenuePrior / ordersPrior : 0;
    const aovDeltaPct =
      aovPrior > 0 ? ((aovCurrent - aovPrior) / aovPrior) * 100 : aovCurrent > 0 ? 100 : 0;

    // 30-Day Daily Sales Time Series Chart Data
    const chartDataMap = new Map<string, { date: string; sales: number; orders: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(nowMs - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString(locale, { day: "numeric", month: "short" });
      chartDataMap.set(key, { date: label, sales: 0, orders: 0 });
    }

    orders.forEach((o) => {
      if (!o.created_at) return;
      const d = new Date(o.created_at);
      if (isNaN(d.getTime())) return;
      const key = d.toISOString().split("T")[0];
      if (chartDataMap.has(key)) {
        const item = chartDataMap.get(key)!;
        item.sales += Number(o.total || 0);
        item.orders += 1;
      }
    });

    const dailyChartSeries = Array.from(chartDataMap.values());

    return {
      revenue,
      cogs,
      opex,
      totalExpenses,
      netProfit,
      grossMarginPercent,
      revenueCurrent,
      revenueDeltaPct,
      ordersCurrent,
      ordersDeltaPct,
      aovCurrent,
      aovDeltaPct,
      dailyChartSeries,
    };
  }, [ordersQ.data, expensesQ.data, variantsQ.data, businessSettings.data, locale]);

  // CRM segmentation distribution & alerts
  const crmStats = useMemo(() => {
    const orders = ordersQ.data ?? [];
    const customers = customersQ.data ?? [];

    const nowMs = new Date().getTime();
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

    const ordersByCustomer = new Map<string, typeof orders>();
    orders.forEach((o) => {
      if (o.customer_id) {
        if (!ordersByCustomer.has(o.customer_id)) {
          ordersByCustomer.set(o.customer_id, []);
        }
        ordersByCustomer.get(o.customer_id)!.push(o);
      }
    });

    let vipCount = 0;
    let churnRiskCount = 0;
    const churnRiskVips: Array<{ id: string; name: string }> = [];

    customers.forEach((c) => {
      const custOrders = ordersByCustomer.get(c.id) ?? [];
      const totalOrders = custOrders.length;
      const lifetimeSpend = custOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

      let lastOrderMs = 0;
      custOrders.forEach((o) => {
        const ms = new Date(o.created_at).getTime();
        if (ms > lastOrderMs) lastOrderMs = ms;
      });

      const isVip = lifetimeSpend > 250;
      const isIdle60 = lastOrderMs > 0 && nowMs - lastOrderMs > sixtyDaysMs;

      if (isVip) {
        vipCount++;
        if (isIdle60) {
          churnRiskVips.push({ id: c.id, name: c.name });
        }
      }

      if (isIdle60) {
        churnRiskCount++;
      }
    });

    return {
      vipCount,
      churnRiskCount,
      churnRiskVips,
    };
  }, [ordersQ.data, customersQ.data]);

  // Inventory velocity & stock depletion calculations
  const inventoryIntel = useMemo(() => {
    const products = productsQ.data ?? [];
    const variants = variantsQ.data ?? [];
    const orders = ordersQ.data ?? [];

    const past45Days = new Date();
    past45Days.setDate(past45Days.getDate() - 45);
    const past45DaysMs = past45Days.getTime();

    // 1. Calculate sales per variant in the past 45 days
    const salesByVariant = new Map<string, number>();

    orders.forEach((order) => {
      const orderTime = new Date(order.created_at).getTime();
      if (orderTime >= past45DaysMs) {
        (order.order_items ?? []).forEach((item: any) => {
          if (item.variant_id) {
            salesByVariant.set(
              item.variant_id,
              (salesByVariant.get(item.variant_id) ?? 0) + Number(item.quantity || 0),
            );
          }
        });
      }
    });

    // 2. Helpers for Stock & Velocity
    const getVariantStock = (v: any) => Number(v.stock_main || 0) + Number(v.stock_incubator || 0);

    const getVariantDailyVelocity = (v: any) => {
      const qtySold = salesByVariant.get(v.id) || 0;
      const variantCreatedAt = v.created_at ? new Date(v.created_at) : null;
      const daysElapsed = variantCreatedAt
        ? Math.max(
            1,
            Math.min(
              45,
              Math.ceil(
                (new Date().getTime() - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
              ),
            ),
          )
        : 45;
      return qtySold / daysElapsed;
    };

    // Low stock count & Dead stock count
    let deadStockCount = 0;
    variants.forEach((v) => {
      const qtySold = salesByVariant.get(v.id) || 0;
      if (qtySold === 0) {
        deadStockCount++;
      }
    });

    // Product stock map and product weekly sales map
    const productStockMap = new Map<string, number>();
    const productWeeklySalesMap = new Map<string, number>();

    products.forEach((product) => {
      const pVariants = variants.filter((v) => v.product_id === product.id);
      const stock = pVariants.reduce((sum, v) => sum + getVariantStock(v), 0);
      productStockMap.set(product.id, stock);

      const productDailyVelocity = pVariants.reduce(
        (sum, v) => sum + getVariantDailyVelocity(v),
        0,
      );
      productWeeklySalesMap.set(product.id, productDailyVelocity * 7);
    });

    let lowStockCount = 0;
    products.forEach((product) => {
      const stock = productStockMap.get(product.id) ?? 0;
      const weeklySales = productWeeklySalesMap.get(product.id) ?? 0;
      if (stock < weeklySales) {
        lowStockCount++;
      }
    });

    // 3. Top Moving Items (sorted by total units sold in past 45 days)
    const productSalesMap = new Map<string, number>();
    orders.forEach((order) => {
      const orderTime = new Date(order.created_at).getTime();
      if (orderTime >= past45DaysMs) {
        (order.order_items ?? []).forEach((item: any) => {
          if (item.variant_id) {
            const variant = variants.find((v) => v.id === item.variant_id);
            if (variant) {
              productSalesMap.set(
                variant.product_id,
                (productSalesMap.get(variant.product_id) ?? 0) + Number(item.quantity || 0),
              );
            }
          }
        });
      }
    });

    const movingItems = products
      .map((p) => {
        const pVariants = variants.filter((v) => v.product_id === p.id);
        const unitsSold = productSalesMap.get(p.id) ?? 0;
        const stock = productStockMap.get(p.id) ?? 0;

        // Product velocity and days left
        const productDailyVelocity = pVariants.reduce(
          (sum, v) => sum + getVariantDailyVelocity(v),
          0,
        );
        let daysLeft = Infinity;
        if (productDailyVelocity > 0) {
          daysLeft = Math.ceil(stock / productDailyVelocity);
        }

        return {
          id: p.id,
          title: lang === "ar" ? p.name_ar || p.name : p.name_en || p.name,
          unitsSold,
          stock,
          daysLeft,
          dailyVelocity: productDailyVelocity,
        };
      })
      .filter((item) => item.unitsSold > 0)
      .sort((a, b) => b.unitsSold - a.unitsSold);

    // 4. Low Stock Variants (for sidebar alerts)
    const lowStockVariants: Array<{
      id: string;
      name: string;
      stock: number;
      daysLeft: number;
    }> = [];

    variants.forEach((v) => {
      const product = products.find((p) => p.id === v.product_id);
      if (!product) return;

      const stock = getVariantStock(v);
      const dailyVelocity = getVariantDailyVelocity(v);
      if (dailyVelocity > 0) {
        const daysLeft = Math.ceil(stock / dailyVelocity);
        if (daysLeft <= 14) {
          // flag if depletes in 14 days
          const sizeText = v.size ? ` (${v.size})` : "";
          const colorText = v.color ? ` - ${v.color}` : "";
          const pName =
            lang === "ar" ? product.name_ar || product.name : product.name_en || product.name;
          lowStockVariants.push({
            id: v.id,
            name: `${pName}${sizeText}${colorText}`,
            stock,
            daysLeft,
          });
        }
      } else if (stock === 0) {
        const sizeText = v.size ? ` (${v.size})` : "";
        const colorText = v.color ? ` - ${v.color}` : "";
        const pName =
          lang === "ar" ? product.name_ar || product.name : product.name_en || product.name;
        lowStockVariants.push({
          id: v.id,
          name: `${pName}${sizeText}${colorText}`,
          stock: 0,
          daysLeft: 0,
        });
      }
    });

    return {
      deadStockCount,
      lowStockCount,
      movingItems,
      lowStockVariants: lowStockVariants.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5),
    };
  }, [productsQ.data, variantsQ.data, ordersQ.data, lang]);

  // Loading skeleton placeholder layout (Wow factor, micro-animations)
  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-pulse">
        <div className="space-y-3">
          <div className="h-9 w-48 bg-muted rounded-md" />
          <div className="h-4 w-64 bg-muted rounded-sm" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-xl border" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-muted rounded-xl border" />
          <div className="lg:col-span-1 h-96 bg-muted rounded-xl border" />
        </div>
      </div>
    );
  }

  // Build high-level cards
  const kpis = [
    ...(canViewFinancials
      ? [
          {
            label: isAr ? "الإيرادات وصافي الربح" : "Revenue & Net Profit",
            value: formatMoney(financials.revenue, currency, locale),
            subValue: `${isAr ? "صافي الربح" : "Net Profit"}: ${formatMoney(financials.netProfit, currency, locale)}`,
            deltaPct: financials.revenueDeltaPct,
            icon: TrendingUp,
            color: "text-emerald-500",
            bg: "from-emerald-500/10 via-transparent to-transparent",
            border: "hover:border-emerald-500/20",
          },
          {
            label: isAr ? "متوسط قيمة الطلب (AOV)" : "Average Order Value (AOV)",
            value: formatMoney(financials.aovCurrent, currency, locale),
            subValue: `${isAr ? "إجمالي الطلبات" : "Total Orders"}: ${financials.ordersCurrent}`,
            deltaPct: financials.aovDeltaPct,
            icon: Wallet,
            color: "text-sky-500",
            bg: "from-sky-500/10 via-transparent to-transparent",
            border: "hover:border-sky-500/20",
          },
          {
            label: isAr ? "نسبة هامش الربح الإجمالي" : "Gross Margin %",
            value: `${financials.grossMarginPercent.toFixed(1)}%`,
            subValue: `${isAr ? "تكلفة المبيعات" : "COGS"}: ${formatMoney(financials.cogs, currency, locale)}`,
            icon: PiggyBank,
            color: "text-blue-500",
            bg: "from-blue-500/10 via-transparent to-transparent",
            border: "hover:border-blue-500/20",
          },
        ]
      : []),
    {
      label: isAr ? "البضائع الراكدة والمنخفضة" : "Dead & Low Stock Items",
      value: `${inventoryIntel.deadStockCount} / ${inventoryIntel.lowStockCount}`,
      subValue: `${isAr ? "الراكدة" : "Dead"}: ${inventoryIntel.deadStockCount} | ${isAr ? "المنخفضة" : "Low"}: ${inventoryIntel.lowStockCount}`,
      icon: Package,
      color: "text-amber-500",
      bg: "from-amber-500/10 via-transparent to-transparent",
      border: "hover:border-amber-500/20",
    },
    {
      label: isAr ? "توزيع مستويات العملاء" : "Customer Tier Distribution",
      value: `${crmStats.vipCount} / ${crmStats.churnRiskCount}`,
      subValue: `VIP: ${crmStats.vipCount} | Churn Risk: ${crmStats.churnRiskCount}`,
      icon: Users,
      color: "text-indigo-500",
      bg: "from-indigo-500/10 via-transparent to-transparent",
      border: "hover:border-indigo-500/20",
    },
  ];

  return (
    <div
      className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8 animate-fade-in"
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* Upper header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 dark:from-slate-50 dark:to-slate-300 flex items-center gap-3">
            <Zap className="h-8 w-8 text-primary animate-pulse shrink-0" />
            {t("dashboard.title")}
          </h1>
          <p className="mt-1.5 text-muted-foreground text-sm max-w-md">
            {isAr
              ? "نظرة عامة على أداء النشاط ومقاييس التجزئة الذكية"
              : "Real-time retail finance and customer CRM analytics insights."}
          </p>
        </div>
        {/* Navigation Quicklinks */}
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            to="/admin/b/$slug/orders"
            params={{ slug }}
            className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-2"
          >
            <ReceiptText className="h-4 w-4" />
            {isAr ? "الطلبات" : "Orders"}
          </Link>
          <Link
            to="/admin/b/$slug/inventory"
            params={{ slug }}
            className="inline-flex h-10 items-center rounded-xl border border-border/60 bg-card/50 px-4 text-xs font-bold text-foreground shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-2"
          >
            <Package className="h-4 w-4" />
            {isAr ? "المنتجات" : "Products"}
          </Link>
          <Link
            to="/admin/b/$slug/customers"
            params={{ slug }}
            className="inline-flex h-10 items-center rounded-xl border border-border/60 bg-card/50 px-4 text-xs font-bold text-foreground shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-2"
          >
            <Users className="h-4 w-4" />
            {isAr ? "العملاء" : "Customers"}
          </Link>
          {canViewFinancials && (
            <Link
              to="/admin/b/$slug/expenses"
              params={{ slug }}
              className="inline-flex h-10 items-center rounded-xl border border-border/60 bg-card/50 px-4 text-xs font-bold text-foreground shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-2"
            >
              <Wallet className="h-4 w-4" />
              {isAr ? "المصروفات" : "Expenses"}
            </Link>
          )}
        </div>
      </div>

      {/* KPI Row (Gridded and responsive) */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${canViewFinancials ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-2"} gap-4`}
      >
        {kpis.map((k) => {
          const Icon = k.icon;
          const hasDelta = typeof (k as any).deltaPct === "number";
          const delta = (k as any).deltaPct ?? 0;
          const isPositive = delta >= 0;

          return (
            <Card
              key={k.label}
              className={`relative overflow-hidden p-4.5 transition-all duration-300 bg-gradient-to-br ${k.bg} hover:shadow-xl hover:-translate-y-1 border border-border/60 shadow-md rounded-2xl bg-card/40 backdrop-blur-sm ${k.border}`}
            >
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 truncate">
                    {k.label}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {hasDelta && (
                      <span
                        className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                          isPositive
                            ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
                            : "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-400"
                        }`}
                      >
                        {isPositive ? (
                          <ArrowUpRight className="h-3 w-3 me-0.5" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 me-0.5" />
                        )}
                        {Math.abs(delta).toFixed(1)}%
                      </span>
                    )}
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100/80 shadow-sm dark:bg-slate-800/80 ${k.color}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-baseline">
                  <p className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-foreground tabular-nums truncate">
                    {k.value}
                  </p>
                </div>
                <p className="mt-2 text-xs font-medium leading-snug text-muted-foreground/90 truncate">
                  {k.subValue}
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 30-Day Interactive Revenue Area Chart */}
      {canViewFinancials && (
        <Card className="p-6 border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold font-display flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                {isAr ? "اتجاه المبيعات اليومية (آخر 30 يومًا)" : "Daily Sales Performance (30 Days)"}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "مخطط حركة إجمالي المبيعات والطلبات اليومية المؤكدة"
                  : "Daily revenue trajectory and completed volume trends."}
              </p>
            </div>
            <span className="text-xs font-bold text-primary font-mono bg-primary/10 px-3 py-1 rounded-full border border-primary/20 w-fit">
              {formatMoney(financials.revenueCurrent, currency, locale)} (30d Total)
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            {isMounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={financials.dailyChartSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#888888" tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} stroke="#888888" tickLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-xl border bg-popover/95 p-3 shadow-xl backdrop-blur-md text-xs space-y-1">
                            <p className="font-bold text-foreground">{data.date}</p>
                            <p className="text-emerald-500 font-mono font-bold">
                              {formatMoney(Number(data.sales), currency, locale)}
                            </p>
                            <p className="text-muted-foreground">
                              {data.orders} {isAr ? "طلبات" : "orders"}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#salesGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full animate-pulse bg-muted rounded-xl" />
            )}
          </div>
        </Card>
      )}

      {/* Two Column Actionable Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (65%) - Top Moving Items */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  <h2 className="text-xl font-display font-bold text-foreground">
                    {isAr ? "المنتجات الأكثر حركة ورواجًا" : "Top Moving Items"}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "أعلى مبيعات المنتجات في الـ 45 يومًا الماضية ومعدل نفادها"
                    : "Top item sales in the past 45 days matched with velocity runway."}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-muted-foreground font-semibold border">
                {isAr ? "مفلترة: آخر 45 يومًا" : "Past 45 days window"}
              </span>
            </div>

            {inventoryIntel.movingItems.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground bg-secondary/10 rounded-xl border border-dashed border-border">
                {isAr
                  ? "لا توجد بيانات كافية لعرض المنتجات الأكثر حركة."
                  : "Insufficient sales volume to map item movement."}
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-muted-foreground uppercase border-b bg-muted/40">
                      <th className="p-3 px-6 text-start">{isAr ? "المنتج" : "Product"}</th>
                      <th className="p-3 text-center w-28">
                        {isAr ? "الوحدات المباعة" : "Units Sold"}
                      </th>
                      <th className="p-3 text-center w-28">
                        {isAr ? "المخزون المتبقي" : "Remaining Stock"}
                      </th>
                      <th className="p-3 px-6 text-end w-36">
                        {isAr ? "النفاد المتوقع" : "Days Left"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {inventoryIntel.movingItems.slice(0, 8).map((item) => {
                      const velocityText =
                        item.daysLeft === Infinity
                          ? isAr
                            ? "∞ مستقر"
                            : "∞ Stable"
                          : `${item.daysLeft} ${isAr ? "أيام" : "days"}`;

                      const runwayColor =
                        item.daysLeft <= 7
                          ? "text-rose-600 bg-rose-500/10 dark:text-rose-400"
                          : item.daysLeft <= 14
                            ? "text-amber-600 bg-amber-500/10 dark:text-amber-400"
                            : "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400";

                      return (
                        <tr key={item.id} className="hover:bg-secondary/10 transition-colors">
                          <td className="p-3 px-6 font-semibold text-foreground truncate max-w-[200px] sm:max-w-xs">
                            {item.title}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-foreground">
                            {item.unitsSold}
                          </td>
                          <td className="p-3 text-center font-mono font-medium text-muted-foreground">
                            {item.stock}
                          </td>
                          <td className="p-3 px-6 text-end">
                            <span
                              className={`inline-flex items-center justify-center text-xs font-bold px-2 py-0.5 rounded-full ${runwayColor}`}
                            >
                              {velocityText}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Recent Orders Card */}
          <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ReceiptText className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-display font-bold text-foreground">
                  {t("dashboard.recentOrders")}
                </h2>
              </div>
              <Link
                to="/admin/b/$slug/orders"
                params={{ slug }}
                className="text-xs text-primary font-semibold hover:underline flex items-center gap-0.5"
              >
                {isAr ? "عرض الكل" : "View All"} <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            {(recentOrdersQ.data ?? []).length === 0 ? (
              <p className="p-6 text-sm text-center text-muted-foreground bg-secondary/10 rounded-xl border border-dashed">
                {t("dashboard.noOrders")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(recentOrdersQ.data ?? []).map((o: any) => (
                  <li
                    key={o.id}
                    className="py-3 flex items-center justify-between gap-3 text-sm hover:bg-secondary/5 px-2 rounded-lg transition-colors"
                  >
                    <Link
                      to="/admin/b/$slug/orders/$id"
                      params={{ slug, id: o.id }}
                      className="min-w-0 truncate"
                    >
                      <span className="text-primary font-bold hover:underline">
                        #{o.invoice_number}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {formatDate(o.created_at, locale)}
                      </span>
                      {getOrderCustomerName(o) && (
                        <span className="text-foreground/90 font-medium block sm:inline sm:ms-2">
                          · {getOrderCustomerName(o)}
                        </span>
                      )}
                    </Link>
                    <span className="shrink-0 font-bold text-foreground font-mono">
                      {formatMoney(Number(o.total), o.currency, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Right Column (35% Sticky Sidebar) - Operational Alert Center */}
        <div className="lg:col-span-1 lg:sticky lg:top-6 space-y-6">
          <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-border/60">
              <AlertCircle className="h-5 w-5 text-rose-500 animate-bounce" />
              <h3 className="font-display font-bold text-lg text-foreground">
                {isAr ? "مركز الإنذار والعمليات" : "Operational Alerts"}
              </h3>
            </div>

            <div className="space-y-3.5">
              {/* Alert Segment: Low Stock Warnings */}
              <div>
                <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider mb-2">
                  {isAr ? "⚠️ تحذيرات مستويات المخزون" : "⚠️ Low Stock Warnings"}
                </h4>
                {inventoryIntel.lowStockVariants.length === 0 ? (
                  <p className="text-xs text-muted-foreground bg-secondary/10 p-3 rounded-lg border border-dashed border-border">
                    {isAr
                      ? "جميع البضائع مستقرة ومغذية بشكل كافٍ."
                      : "All variants fully stock stable."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {inventoryIntel.lowStockVariants.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-1"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-xs font-bold text-foreground truncate max-w-[150px]">
                            {item.name}
                          </span>
                          <span className="text-[10px] shrink-0 font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                            {item.stock === 0
                              ? isAr
                                ? "نفذ"
                                : "Out of stock"
                              : `${item.stock} ${isAr ? "وحدات" : "units"}`}
                          </span>
                        </div>
                        <p className="text-[10px] text-amber-800 dark:text-amber-300 font-medium">
                          {item.stock === 0
                            ? isAr
                              ? "🚨 لا توجد كميات للبيع!"
                              : "🚨 No quantities left for sale!"
                            : isAr
                              ? `سوف ينفد المخزون بالكامل في غضون ${item.daysLeft} أيام`
                              : `Will completely deplete in ${item.daysLeft} days`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Alert Segment: Retention Alerts */}
              <div>
                <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider mb-2">
                  {isAr ? "🚨 حملات استعادة العملاء" : "🚨 Retention Alerts"}
                </h4>
                {crmStats.churnRiskVips.length === 0 ? (
                  <p className="text-xs text-muted-foreground bg-secondary/10 p-3 rounded-lg border border-dashed border-border">
                    {isAr
                      ? "لا يوجد عملاء VIP معرضون للمغادرة حاليًا."
                      : "No VIP customers in retention danger."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-rose-800 dark:text-rose-400">
                          {isAr ? "عملاء VIP معرضون للمغادرة" : "VIP Churn Risk Alerts"}
                        </span>
                        <span className="text-[10px] font-bold bg-rose-500/20 text-rose-700 dark:text-rose-400 px-1.5 py-0.5 rounded-full">
                          {crmStats.churnRiskVips.length} {isAr ? "عملاء" : "VIPs"}
                        </span>
                      </div>
                      <p className="text-[10px] text-rose-700 dark:text-rose-300 leading-relaxed">
                        {isAr
                          ? "لم يقم كبار العملاء هؤلاء بأي طلبات جديدة في الـ 60 يومًا الماضية. بادر بإعادتهم الآن!"
                          : "High-value VIP spenders with no orders in past 60 days. Launch outreach campaign immediately!"}
                      </p>
                      <div className="flex flex-wrap gap-1 border-t border-rose-500/10 pt-2">
                        {crmStats.churnRiskVips.slice(0, 3).map((v) => (
                          <span
                            key={v.id}
                            className="text-[9px] font-semibold bg-rose-500/10 text-rose-900 dark:text-rose-300 px-2 py-0.5 rounded-md"
                          >
                            👤 {v.name}
                          </span>
                        ))}
                        {crmStats.churnRiskVips.length > 3 && (
                          <span className="text-[9px] font-semibold text-rose-700 dark:text-rose-400 px-1 py-0.5">
                            +{crmStats.churnRiskVips.length - 3} {isAr ? "المزيد" : "more"}
                          </span>
                        )}
                      </div>
                      {/* PRE-FILTER LINK DEEP LINK TO CAMPAIGNS PAGE */}
                      <Link
                        to="/admin/b/$slug/campaigns"
                        params={{ slug }}
                        search={{ segment: "Churn Risk" }}
                        className="mt-1.5 inline-flex items-center justify-center text-center w-full px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-sm gap-1"
                      >
                        🚀 {isAr ? "إطلاق حملة استهداف الشريحة" : "Launch Target Campaign"}
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
