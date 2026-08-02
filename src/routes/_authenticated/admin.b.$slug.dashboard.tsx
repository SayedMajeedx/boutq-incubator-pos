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
  LayoutDashboard,
  Clock,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Filter,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { formatDate, formatMoney } from "@/lib/format";
import { useI18n, useT } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";
import { useBrand } from "@/lib/brand-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useMemo, useEffect, useState } from "react";
import { getOrderCustomerName } from "@/lib/order-customer-snapshot";
import { OsStatusPill } from "@/components/os/os-status-pill";

import { DashboardCommandHeader } from "@/components/dashboard/DashboardCommandHeader";
import {
  DashboardScopeSwitcher,
  type DashboardViewScope,
} from "@/components/dashboard/DashboardScopeSwitcher";
import { DashboardActivityQueue } from "@/components/dashboard/DashboardActivityQueue";

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

  const isMounted = typeof window !== "undefined";
  const [activeScope, setActiveScope] = useState<DashboardViewScope>("financials");

  // 1. Fetch Business settings
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

  // 3. Fetch all variants
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
          "id, invoice_number, created_at, currency, total, status, payment_status, customer_id, customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot, customers(name), payment_method, order_items(id, variant_id, quantity, unit_price, line_total)",
        )
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  // 6. Fetch recent 5 orders for operational feed
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
        .limit(5);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // 7. Fetch all manual expenses
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

  // Filter confirmed/completed orders for revenue reporting
  const validRevenueOrders = useMemo(() => {
    return (ordersQ.data ?? []).filter((o) =>
      ["confirmed", "paid", "shipped", "completed"].includes(o.status),
    );
  }, [ordersQ.data]);

  // Operational Actionable Orders (Orders needing triage/action)
  const actionNeededOrders = useMemo(() => {
    return (ordersQ.data ?? [])
      .filter((o) => {
        const isUnpaid = o.payment_status === "unpaid" || o.payment_status === "pending";
        const isPendingFulfillment = o.status === "confirmed" || o.status === "needs_packing";
        return isUnpaid || isPendingFulfillment;
      })
      .slice(0, 5);
  }, [ordersQ.data]);

  // Financial intelligence aggregations
  const financials = useMemo(() => {
    const orders = validRevenueOrders;
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
  }, [validRevenueOrders, expensesQ.data, variantsQ.data, businessSettings.data, locale]);

  // CRM segmentation distribution
  const crmStats = useMemo(() => {
    const orders = validRevenueOrders;
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
  }, [validRevenueOrders, customersQ.data]);

  // Inventory velocity & stock depletion calculations
  const inventoryIntel = useMemo(() => {
    const products = productsQ.data ?? [];
    const variants = variantsQ.data ?? [];
    const orders = validRevenueOrders;

    const past45Days = new Date();
    past45Days.setDate(past45Days.getDate() - 45);
    const past45DaysMs = past45Days.getTime();

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

    let deadStockCount = 0;
    variants.forEach((v) => {
      const qtySold = salesByVariant.get(v.id) || 0;
      if (qtySold === 0) {
        deadStockCount++;
      }
    });

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
      lowStockVariants: lowStockVariants.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5),
    };
  }, [productsQ.data, variantsQ.data, validRevenueOrders, lang]);

  // Loading skeleton placeholder
  if (isLoading) {
    return (
      <div className="p-2 max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-muted rounded-md" />
          <div className="h-4 w-64 bg-muted rounded-sm" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-2xl border" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 bg-muted rounded-2xl border" />
          <div className="lg:col-span-1 h-64 bg-muted rounded-2xl border" />
        </div>
      </div>
    );
  }

  // Primary Financial KPIs
  const primaryKpis = [
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
            label: isAr ? "متوسط قيمة الطلب" : "Average Order Value (AOV)",
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
      label: isAr ? "إجمالي الطلبات المؤكدة" : "Total Confirmed Orders",
      value: `${financials.ordersCurrent}`,
      subValue: isAr ? "خلال الثلاثين يومًا الماضية" : "Over the last 30 days",
      deltaPct: financials.ordersDeltaPct,
      icon: ReceiptText,
      color: "text-indigo-500",
      bg: "from-indigo-500/10 via-transparent to-transparent",
      border: "hover:border-indigo-500/20",
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-3.5 p-1 sm:p-2">
      {/* 1. Integrated Command Header */}
      <DashboardCommandHeader
        lang={isAr ? "ar" : "en"}
        slug={slug}
        brandName={(isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug}
        orderCount={financials.ordersCurrent}
      />

      {/* 2. Scope Switcher Toolbar */}
      <DashboardScopeSwitcher
        lang={isAr ? "ar" : "en"}
        activeScope={activeScope}
        onScopeChange={(scope) => setActiveScope(scope)}
        lowStockCount={inventoryIntel.lowStockCount}
      />

      {/* Dynamic View 1: Financial Telemetry (Default / "financials") */}
      {activeScope === "financials" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Primary Financial KPIs (Top Row) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {primaryKpis.map((k) => {
              const Icon = k.icon;
              const hasDelta = typeof (k as any).deltaPct === "number";
              const delta = (k as any).deltaPct ?? 0;
              const isPositive = delta >= 0;

              return (
                <Card
                  key={k.label}
                  className={`relative overflow-hidden p-4 transition-all duration-300 bg-gradient-to-br ${k.bg} hover:shadow-lg border border-border/60 rounded-2xl bg-card/60 backdrop-blur-sm ${k.border}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 leading-tight line-clamp-2">
                        {k.label}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasDelta && (
                          <span
                            title={
                              isAr
                                ? "مقارنة بـ 30 يومًا السابقة"
                                : "Compared to previous 30-day period"
                            }
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
                          className={`flex h-8 w-8 items-center justify-center rounded-xl bg-background/80 shadow-2xs border border-border/50 ${k.color}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-baseline">
                      <p className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-foreground tabular-nums truncate">
                        {k.value}
                      </p>
                    </div>
                    <p className="mt-1 text-xs font-medium leading-snug text-muted-foreground line-clamp-1">
                      {k.subValue}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Middle Multi-Column Grid: Sales Trajectory & Action Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
            {canViewFinancials && (
              <Card className="lg:col-span-3 p-5 border border-border/60 shadow-sm rounded-2xl bg-card/80 backdrop-blur-sm flex flex-col justify-between space-y-3 h-full">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold font-heading flex items-center gap-2">
                      <TrendingUp className="h-4.5 w-4.5 text-emerald-500" />
                      {isAr
                        ? "اتجاه المبيعات اليومية (آخر 30 يومًا)"
                        : "Daily Sales Performance (30 Days)"}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {isAr
                        ? "مخطط حركة إجمالي المبيعات والطلبات اليومية المؤكدة"
                        : "Daily revenue trajectory and completed volume trends."}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-primary font-mono bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20 w-fit">
                    {formatMoney(financials.revenueCurrent, currency, locale)}
                    {isAr ? " (إجمالي 30 يوم)" : " (30-Day Total)"}
                  </span>
                </div>

                <div className="h-56 w-full pt-1">
                  {isMounted ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={financials.dailyChartSeries}
                        margin={{ top: 15, right: 15, left: -10, bottom: 5 }}
                      >
                        <defs>
                          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          stroke="#888888"
                          tickLine={false}
                        />
                        <YAxis tick={{ fontSize: 10 }} stroke="#888888" tickLine={false} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="rounded-xl border bg-popover/95 p-2.5 shadow-xl backdrop-blur-md text-xs space-y-1">
                                  <p className="font-bold text-foreground">{data.date}</p>
                                  <p className="text-emerald-500 font-mono font-bold">
                                    {formatMoney(Number(data.sales), currency, locale)}
                                  </p>
                                  <p className="text-muted-foreground text-[11px]">
                                    {data.orders} {isAr ? "طلبات مؤكدة" : "confirmed orders"}
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
                          strokeWidth={2}
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

            {/* Action Needed Feed */}
            <Card
              className={
                canViewFinancials
                  ? "lg:col-span-2 p-5 border border-border/60 shadow-sm rounded-2xl bg-card/80 backdrop-blur-sm flex flex-col justify-between space-y-3 h-full"
                  : "lg:col-span-5 p-5 border border-border/60 shadow-sm rounded-2xl bg-card/80 backdrop-blur-sm flex flex-col justify-between space-y-3 h-full"
              }
            >
              <div className="flex items-center justify-between pb-2 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4.5 w-4.5 text-amber-500" />
                  <h3 className="font-bold text-base font-heading text-foreground">
                    {isAr ? "طلبات تتطلب إجراءً" : "Action Needed Feed"}
                  </h3>
                </div>
                <Link
                  to="/admin/b/$slug/orders"
                  params={{ slug }}
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  {isAr ? "إدارة الطلبات ←" : "Triage ←"}
                </Link>
              </div>

              {actionNeededOrders.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground bg-secondary/10 rounded-xl border border-dashed border-border space-y-1 my-auto">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
                  <p className="font-bold text-foreground">
                    {isAr ? "جميع الطلبات محدثة!" : "All orders up to date!"}
                  </p>
                  <p>
                    {isAr
                      ? "لا توجد طلبات تحتاج إلى إجراء فوري حاليًا."
                      : "No urgent pending merchant actions required."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 my-auto">
                  {actionNeededOrders.map((o) => (
                    <div
                      key={o.id}
                      className="p-2.5 bg-background/80 border border-border/60 rounded-xl flex items-center justify-between gap-3 text-xs hover:border-primary/40 transition-all shadow-2xs"
                    >
                      <div className="min-w-0">
                        <Link
                          to="/admin/b/$slug/orders/$id"
                          params={{ slug, id: o.id }}
                          className="font-bold text-primary hover:underline block truncate"
                        >
                          #{o.invoice_number} —{" "}
                          {getOrderCustomerName(o) || (isAr ? "عميل" : "Customer")}
                        </Link>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(o.created_at, locale)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-bold text-foreground">
                          {formatMoney(Number(o.total), o.currency, locale)}
                        </span>
                        <Link
                          to="/admin/b/$slug/orders/$id"
                          params={{ slug, id: o.id }}
                          className="h-6 px-2 rounded-md bg-primary/10 text-primary text-[10px] font-bold flex items-center gap-1 hover:bg-primary/20 transition-colors"
                        >
                          {isAr ? "إجراء" : "Action"}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Lower Feed: Activity Queue & Low Stock Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
            <Card className="lg:col-span-3 p-5 border border-border/60 shadow-sm rounded-2xl bg-card/80 backdrop-blur-sm flex flex-col justify-between space-y-3 h-full">
              <div className="flex items-center justify-between pb-2 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-4.5 w-4.5 text-primary" />
                  <h3 className="font-bold text-base font-heading text-foreground">
                    {t("dashboard.recentOrders")}
                  </h3>
                </div>
                <Link
                  to="/admin/b/$slug/orders"
                  params={{ slug }}
                  className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                >
                  {isAr ? "عرض كل الطلبات ←" : "View All Orders →"}
                </Link>
              </div>

              <DashboardActivityQueue
                lang={isAr ? "ar" : "en"}
                slug={slug}
                orders={recentOrdersQ.data ?? []}
                currency={currency}
                locale={locale}
              />
            </Card>

            <Card className="lg:col-span-2 p-5 border border-border/60 shadow-sm rounded-2xl bg-card/80 backdrop-blur-sm flex flex-col justify-between space-y-3 h-full">
              <div className="flex items-center justify-between pb-2 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <Package className="h-4.5 w-4.5 text-amber-500" />
                  <h3 className="font-bold text-base font-heading text-foreground">
                    {isAr ? "تنبيهات انخفاض المخزون" : "Low Stock Alerts"}
                  </h3>
                </div>
                <Link
                  to="/admin/b/$slug/inventory"
                  params={{ slug }}
                  className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                >
                  {isAr ? "المخزون ←" : "Inventory →"}
                </Link>
              </div>

              {inventoryIntel.lowStockVariants.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground bg-secondary/10 rounded-xl border border-dashed border-border space-y-1 my-auto">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
                  <p className="font-bold text-foreground">
                    {isAr ? "جميع المستويات مستقرة" : "Stock Levels Healthy"}
                  </p>
                  <p>
                    {isAr
                      ? "لا توجد بضائع منخفضة أو مشرفة على النفاد."
                      : "All product stock levels are fully replenished."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 my-auto">
                  {inventoryIntel.lowStockVariants.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-semibold text-foreground truncate max-w-[180px]">
                        {item.name}
                      </span>
                      <span className="text-[10px] shrink-0 font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                        {item.stock === 0
                          ? isAr
                            ? "نفذ"
                            : "Out of stock"
                          : `${item.stock} ${isAr ? "وحدات" : "units"}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Dynamic View 2: Expanded Sales Chart Series ("sales_series") */}
      {activeScope === "sales_series" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <Card className="p-6 border border-border/60 shadow-md rounded-2xl bg-card/90 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
              <div>
                <h3 className="text-lg font-extrabold flex items-center gap-2 text-foreground">
                  <CalendarDays className="h-5 w-5 text-emerald-500" />
                  {isAr ? "مخطط حركة المبيعات اليومية التفصيلي" : "Daily Sales Trajectory Chart"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? "تحليل نمو المبيعات وإيرادات المتجر اليومية للـ 30 يومًا الماضية"
                    : "Detailed daily revenue breakdown over the last 30 operational days."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                  {isAr ? "الإجمالي: " : "Total: "}
                  {formatMoney(financials.revenueCurrent, currency, locale)}
                </span>
              </div>
            </div>

            <div className="h-80 w-full pt-2">
              {isMounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={financials.dailyChartSeries}
                    margin={{ top: 15, right: 15, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="salesGradExpanded" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#888888" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#888888" />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-xl border bg-popover/95 p-3 shadow-xl backdrop-blur-md text-xs space-y-1">
                              <p className="font-bold text-foreground">{data.date}</p>
                              <p className="text-emerald-500 font-mono font-extrabold text-sm">
                                {formatMoney(Number(data.sales), currency, locale)}
                              </p>
                              <p className="text-muted-foreground text-[11px]">
                                {data.orders} {isAr ? "طلبات مؤكدة" : "confirmed orders"}
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
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#salesGradExpanded)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full animate-pulse bg-muted rounded-xl" />
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Dynamic View 3: Diagnostics View ("diagnostics") */}
      {activeScope === "diagnostics" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Inventory Diagnostics Detailed Panel */}
            <Card className="p-5 border border-border/60 shadow-md rounded-2xl bg-card/90 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-amber-500" />
                  <div>
                    <h3 className="font-extrabold text-base text-foreground">
                      {isAr ? "تشخيص المخزون والبضائع" : "Inventory Stock Diagnostics"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "تحديد المنتجات المنخفضة والراكدة"
                        : "Low stock and dead stock alerts"}
                    </p>
                  </div>
                </div>
                <Link
                  to="/admin/b/$slug/inventory"
                  params={{ slug }}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  {isAr ? "إدارة المخزون ←" : "Manage Stock →"}
                </Link>
              </div>

              {inventoryIntel.lowStockVariants.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground bg-emerald-500/10 rounded-xl border border-emerald-500/20 space-y-1">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                  <p className="font-bold text-foreground text-sm">
                    {isAr ? "جميع المستويات مستقرة!" : "Stock Healthy!"}
                  </p>
                  <p>{isAr ? "لا توجد بضائع منخفضة." : "No low stock items detected."}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {inventoryIntel.lowStockVariants.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-bold text-foreground">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {isAr ? "مستوى المخزون الحالي" : "Current stock quantity"}
                        </p>
                      </div>
                      <Link
                        to="/admin/b/$slug/inventory"
                        params={{ slug }}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/30 transition-colors"
                      >
                        {item.stock === 0
                          ? isAr
                            ? "نفذ — إكمال المخزون"
                            : "Out of Stock — Reorder"
                          : `${item.stock} ${isAr ? "وحدات المتبقية" : "units remaining"}`}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* CRM Customer Diagnostics Panel */}
            <Card className="p-5 border border-border/60 shadow-md rounded-2xl bg-card/90 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-500" />
                  <div>
                    <h3 className="font-extrabold text-base text-foreground">
                      {isAr ? "تشخيص ورعاية العملاء (CRM)" : "CRM Customer Diagnostics"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "متابعة العملاء المميزين والمعرضين للتسرب"
                        : "VIP retention & churn risk tracking"}
                    </p>
                  </div>
                </div>
                <Link
                  to="/admin/b/$slug/customers"
                  params={{ slug }}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  {isAr ? "سجل العملاء ←" : "Customer List →"}
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-center space-y-1">
                  <p className="text-2xl font-extrabold font-mono text-indigo-600 dark:text-indigo-400">
                    {crmStats.vipCount}
                  </p>
                  <p className="text-xs font-bold text-foreground">
                    {isAr ? "عملاء مميزون (VIP)" : "VIP Customers"}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center space-y-1">
                  <p className="text-2xl font-extrabold font-mono text-rose-600 dark:text-rose-400">
                    {crmStats.churnRiskCount}
                  </p>
                  <p className="text-xs font-bold text-foreground">
                    {isAr ? "معرضون للتسرب" : "At Churn Risk"}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
