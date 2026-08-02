import { supabase } from "@/integrations/supabase/client";

export type DateRange = {
  from: Date;
  to: Date;
};

export type ReportInterval = "day" | "week" | "month" | "year";

// Overview metrics
export async function fetchReportingOverview(
  range: DateRange,
  tz: string,
  includeHistorical: boolean = false,
  brandSlug?: string,
) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_overview", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
    p_include_historical: includeHistorical,
    p_brand_slug: brandSlug || null,
  });
  if (error) {
    // Some early reporting deployments shipped the sales RPC before the overview
    // RPC. Keep the dashboard useful in that state without hiding real permission,
    // tenancy, or database errors.
    if (
      error.code === "PGRST202" ||
      /rpc_reporting_overview.*(not find|does not exist)/i.test(error.message || "")
    ) {
      const sales = (await fetchReportingSales(
        range,
        "day",
        tz,
        includeHistorical,
        brandSlug,
      )) as any;
      const series = Array.isArray(sales?.timeseries) ? sales.timeseries : [];
      const currency = series.find((row: any) => row.currency)?.currency || "BHD";
      return [
        {
          currency,
          paid_order_value: series.reduce((sum: number, row: any) => sum + Number(row.pov || 0), 0),
          net_merch_sales: series.reduce(
            (sum: number, row: any) => sum + Number(row.net_merch || 0),
            0,
          ),
          paid_order_count: series.reduce(
            (sum: number, row: any) => sum + Number(row.paid_order_count || row.order_count || 0),
            0,
          ),
          discounts: series.reduce((sum: number, row: any) => sum + Number(row.discounts || 0), 0),
          shipping_collected: series.reduce(
            (sum: number, row: any) => sum + Number(row.shipping_collected || 0),
            0,
          ),
          vat_collected: series.reduce(
            (sum: number, row: any) => sum + Number(row.vat_collected || 0),
            0,
          ),
          expenses: 0,
          partial_amount: 0,
          refunded_total: 0,
          free_completed_order_count: 0,
          known_cogs: 0,
          missing_cost_item_count: 0,
          missing_cost_exposure: 0,
          overview_fallback: true,
        },
      ];
    }
    throw error;
  }
  const { data: feeRows, error: feeError } = await (supabase as any).rpc(
    "rpc_reporting_processing_fees",
    {
      p_start_date: range.from.toISOString(),
      p_end_date: range.to.toISOString(),
      p_include_historical: includeHistorical,
      p_brand_slug: brandSlug || null,
    },
  );
  if (feeError) throw feeError;
  const feesByCurrency = new Map(
    (Array.isArray(feeRows) ? feeRows : []).map((row: any) => [
      row.currency,
      Number(row.processing_fees || 0),
    ]),
  );
  return (Array.isArray(data) ? data : []).map((row: any) => {
    const processingFees = feesByCurrency.get(row.currency) ?? 0;
    const manualExpenses = Number(row.expenses || 0);
    return {
      ...row,
      manual_expenses: manualExpenses,
      processing_fees: processingFees,
      expenses: manualExpenses + processingFees,
    };
  });
}

// Sales metrics
export async function fetchReportingSales(
  range: DateRange,
  interval: ReportInterval,
  tz: string,
  includeHistorical: boolean = false,
  brandSlug?: string,
) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_sales", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_interval: interval,
    p_tz: tz,
    p_include_historical: includeHistorical,
    p_brand_slug: brandSlug || null,
  });
  if (error) throw error;
  return data;
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
  if (error) throw error;
  return data;
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
  const { data, error } = await (supabase as any).rpc("rpc_reporting_customers", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
    p_include_historical: includeHistorical,
    p_limit: limit,
    p_offset: offset,
    p_brand_slug: brandSlug || null,
  });
  if (error) throw error;
  return data;
}

// Expenses metrics
export async function fetchReportingExpenses(range: DateRange, tz: string, brandSlug?: string) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_expenses", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
    p_brand_slug: brandSlug || null,
  });
  if (error) throw error;
  return data;
}

// Export function
export async function exportReportData(
  reportType: "sales" | "products" | "customers",
  range: DateRange,
  tz: string,
  brandSlug?: string,
) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_export", {
    p_report_type: reportType,
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
    p_brand_slug: brandSlug || null,
  });
  if (error) throw error;
  return data;
}
