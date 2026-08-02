import { supabase } from "@/integrations/supabase/client";

export type DateRange = {
  from: Date;
  to: Date;
};

export type ReportInterval = "day" | "week" | "month" | "year";

// Robust fallback overview calculation querying public schema directly
async function getDirectOverviewFallback(brandSlug?: string) {
  try {
    let brandId: string | null = null;
    if (brandSlug) {
      const { data: b } = await supabase.from("brands").select("id").eq("slug", brandSlug).maybeSingle();
      brandId = b?.id || null;
    }

    let query = supabase.from("orders").select("id, total, status, created_at");
    if (brandId) {
      query = query.eq("brand_id", brandId);
    }

    const { data: orders = [] } = await query;

    const validOrders = (orders || []).filter((o: any) =>
      ["confirmed", "paid", "shipped", "completed"].includes(o.status)
    );

    const paidOrderValue = validOrders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);
    const paidOrderCount = validOrders.length;

    return [
      {
        currency: "BHD",
        paid_order_value: paidOrderValue,
        net_merch_sales: paidOrderValue,
        paid_order_count: paidOrderCount,
        discounts: 0,
        shipping_collected: 0,
        vat_collected: 0,
        expenses: 0,
        manual_expenses: 0,
        processing_fees: 0,
        partial_amount: 0,
        refunded_total: 0,
        free_completed_order_count: 0,
        known_cogs: 0,
        missing_cost_item_count: 0,
        missing_cost_exposure: 0,
        overview_fallback: true,
      },
    ];
  } catch (err) {
    console.error("Direct overview fallback error:", err);
    return [
      {
        currency: "BHD",
        paid_order_value: 0,
        net_merch_sales: 0,
        paid_order_count: 0,
        discounts: 0,
        expenses: 0,
        overview_fallback: true,
      },
    ];
  }
}

// Overview metrics
export async function fetchReportingOverview(
  range: DateRange,
  tz: string,
  includeHistorical: boolean = false,
  brandSlug?: string,
) {
  try {
    const { data, error } = await (supabase as any).rpc("rpc_reporting_overview", {
      p_start_date: range.from.toISOString(),
      p_end_date: range.to.toISOString(),
      p_tz: tz,
      p_include_historical: includeHistorical,
      p_brand_slug: brandSlug || null,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch (e) {
    console.warn("RPC overview error, engaging direct table fallback:", e);
  }

  return getDirectOverviewFallback(brandSlug);
}

// Sales metrics
export async function fetchReportingSales(
  range: DateRange,
  interval: ReportInterval,
  tz: string,
  includeHistorical: boolean = false,
  brandSlug?: string,
) {
  try {
    const { data, error } = await (supabase as any).rpc("rpc_reporting_sales", {
      p_start_date: range.from.toISOString(),
      p_end_date: range.to.toISOString(),
      p_interval: interval,
      p_tz: tz,
      p_include_historical: includeHistorical,
      p_brand_slug: brandSlug || null,
    });
    if (!error && data) return data;
  } catch (e) {
    console.warn("RPC sales error:", e);
  }

  return { timeseries: [] };
}

// Products & Inventory metrics
export async function fetchReportingProducts(
  range: DateRange,
  tz: string,
  includeHistorical: boolean = false,
  limit: number = 50,
  offset: number = 0,
  sortBy: string = "units_sold_desc",
  brandSlug?: string,
) {
  try {
    const { data, error } = await (supabase as any).rpc("rpc_reporting_products_inventory", {
      p_start_date: range.from.toISOString(),
      p_end_date: range.to.toISOString(),
      p_tz: tz,
      p_include_historical: includeHistorical,
      p_limit: limit,
      p_offset: offset,
      p_sort_by: sortBy,
      p_brand_slug: brandSlug || null,
    });
    if (!error && data) return data;
  } catch (e) {
    console.warn("RPC products error:", e);
  }

  return { products: [] };
}

// Customers metrics
export async function fetchReportingCustomers(
  range: DateRange,
  tz: string,
  includeHistorical: boolean = false,
  limit: number = 50,
  offset: number = 0,
  brandSlug?: string,
) {
  try {
    const { data, error } = await (supabase as any).rpc("rpc_reporting_customers", {
      p_start_date: range.from.toISOString(),
      p_end_date: range.to.toISOString(),
      p_tz: tz,
      p_include_historical: includeHistorical,
      p_limit: limit,
      p_offset: offset,
      p_brand_slug: brandSlug || null,
    });
    if (!error && data) return data;
  } catch (e) {
    console.warn("RPC customers error:", e);
  }

  return { customers: [] };
}

// Expenses metrics
export async function fetchReportingExpenses(range: DateRange, tz: string, brandSlug?: string) {
  try {
    const { data, error } = await (supabase as any).rpc("rpc_reporting_expenses", {
      p_start_date: range.from.toISOString(),
      p_end_date: range.to.toISOString(),
      p_tz: tz,
      p_brand_slug: brandSlug || null,
    });
    if (!error && data) return data;
  } catch (e) {
    console.warn("RPC expenses error:", e);
  }

  return { expenses: [] };
}

// Export function
export async function exportReportData(
  reportType: "sales" | "products" | "customers",
  range: DateRange,
  tz: string,
  brandSlug?: string,
) {
  return [];
}
