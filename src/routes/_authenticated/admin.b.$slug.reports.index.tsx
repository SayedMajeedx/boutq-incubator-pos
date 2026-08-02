import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { useI18n } from "@/lib/i18n";
import { fetchReportingOverview } from "@/lib/reporting.functions";
import { DatePickerWithRange } from "@/components/reports/date-range-picker";
import { KpiCard } from "@/components/reports/kpi-card";
import { formatMoney } from "@/lib/format";
import {
  Banknote,
  ShoppingBag,
  Percent,
  ReceiptText,
  PackageCheck,
  CircleDollarSign,
  WalletCards,
  AlertCircle,
  RefreshCw,
  Info,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/")({
  component: ReportsOverview,
});

function ReportsOverview() {
  const { lang } = useI18n();
  const { slug } = Route.useParams();
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(startOfDay(new Date()), 30),
    to: endOfDay(new Date()),
  });
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const query = useQuery({
    queryKey: [
      "reports-overview",
      date?.from?.toISOString(),
      date?.to?.toISOString(),
      timezone,
      includeHistorical,
    ],
    queryFn: () =>
      fetchReportingOverview(
        { from: date!.from!, to: date!.to! },
        timezone,
        includeHistorical,
        slug,
      ),
    enabled: !!date?.from && !!date?.to,
    retry: 1,
  });

  const rows = Array.isArray(query.data) ? query.data : query.data ? [query.data] : [];
  const data = rows[0] as any;
  const money = (value: unknown) => formatMoney(Number(value || 0), data?.currency || "BHD", lang);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <DatePickerWithRange date={date} setDate={setDate} />
        <div className="flex items-center gap-3 rounded-xl bg-[#faf7f6] px-3 py-2">
          <Switch
            id="historical"
            checked={includeHistorical}
            onCheckedChange={setIncludeHistorical}
          />
          <Label htmlFor="historical" className="text-sm">
            {lang === "ar" ? "تضمين الطلبات المؤرشفة" : "Include archived orders"}
          </Label>
        </div>
      </div>

      {query.isLoading ? (
        <Skeleton />
      ) : query.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center">
          <AlertCircle className="mx-auto h-9 w-9 text-rose-600" />
          <h2 className="mt-4 text-lg font-semibold">
            {lang === "ar" ? "تعذر تحميل النظرة العامة" : "Overview could not be loaded"}
          </h2>
          <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
            {lang === "ar"
              ? "لم تتغير بياناتك. أعد المحاولة، وإذا استمرت المشكلة فتحقق من ترحيل دوال التقارير في قاعدة البيانات."
              : "Your data is safe. Retry now; if this persists, the reporting database functions need to be synchronized."}
          </p>
          <Button
            variant="outline"
            onClick={() => query.refetch()}
            className="mt-5 rounded-xl bg-white"
          >
            <RefreshCw className="me-2 h-4 w-4" />
            {lang === "ar" ? "إعادة المحاولة" : "Try again"}
          </Button>
        </div>
      ) : data ? (
        <>
          {data.overview_fallback && (
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {lang === "ar"
                  ? "يتم عرض مؤشرات المبيعات الأساسية مؤقتاً. يجب مزامنة ترحيل النظرة العامة لإظهار التكلفة والمصروفات بالكامل."
                  : "Core sales metrics are available. Synchronize the overview database migration to restore complete cost and expense metrics."}
              </span>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title={lang === "ar" ? "قيمة الطلبات المدفوعة" : "Paid order value"}
              value={money(data.paid_order_value)}
              icon={<Banknote />}
              description={lang === "ar" ? "الإيراد المحصل" : "Revenue collected"}
            />
            <KpiCard
              title={lang === "ar" ? "صافي مبيعات المنتجات" : "Net merchandise"}
              value={money(data.net_merch_sales)}
              icon={<ShoppingBag />}
              accent="emerald"
              description={lang === "ar" ? "بعد الخصومات" : "After discounts"}
            />
            <KpiCard
              title={lang === "ar" ? "الطلبات المدفوعة" : "Paid orders"}
              value={Number(data.paid_order_count || 0)}
              icon={<PackageCheck />}
              accent="blue"
            />
            <KpiCard
              title={lang === "ar" ? "الخصومات" : "Discounts"}
              value={money(data.discounts)}
              icon={<Percent />}
              accent="amber"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              title={lang === "ar" ? "الشحن المحصل" : "Shipping collected"}
              value={money(data.shipping_collected)}
              icon={<ReceiptText />}
            />
            <KpiCard
              title={lang === "ar" ? "ضريبة القيمة المضافة" : "VAT collected"}
              value={money(data.vat_collected)}
              icon={<CircleDollarSign />}
              accent="blue"
            />
            <KpiCard
              title={lang === "ar" ? "المصروفات" : "Expenses"}
              value={money(data.expenses)}
              icon={<WalletCards />}
              accent="amber"
              description={
                lang === "ar"
                  ? `يدوية ${money(data.manual_expenses)} + رسوم ${money(data.processing_fees)}`
                  : `Manual ${money(data.manual_expenses)} + fees ${money(data.processing_fees)}`
              }
            />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <DetailCard
              title={lang === "ar" ? "تفاصيل التحصيل" : "Collection details"}
              rows={[
                [lang === "ar" ? "المبالغ الجزئية" : "Partial amounts", money(data.partial_amount)],
                [lang === "ar" ? "المبالغ المستردة" : "Refunded total", money(data.refunded_total)],
                [
                  lang === "ar" ? "طلبات مجانية مكتملة" : "Free completed orders",
                  Number(data.free_completed_order_count || 0),
                ],
              ]}
            />
            <DetailCard
              title={lang === "ar" ? "صحة بيانات التكلفة" : "Cost data health"}
              rows={[
                [lang === "ar" ? "تكلفة البضاعة المعروفة" : "Known COGS", money(data.known_cogs)],
                [
                  lang === "ar" ? "عناصر بلا تكلفة" : "Items missing cost",
                  Number(data.missing_cost_item_count || 0),
                ],
                [
                  lang === "ar" ? "قيمة المبيعات المتأثرة" : "Sales value affected",
                  money(data.missing_cost_exposure),
                ],
              ]}
              warning={Number(data.missing_cost_item_count || 0) > 0}
            />
          </div>
        </>
      ) : (
        <div className="rounded-2xl border bg-white p-14 text-center text-sm text-muted-foreground">
          {lang === "ar" ? "لا توجد بيانات في هذه الفترة" : "No data for this period"}
        </div>
      )}
    </div>
  );
}

function DetailCard({
  title,
  rows,
  warning,
}: {
  title: string;
  rows: [string, string | number][];
  warning?: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {warning && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            Action required
          </span>
        )}
      </div>
      <div className="mt-5 divide-y">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-5 py-3 first:pt-0 last:pb-0"
          >
            <span className="text-sm text-muted-foreground">{label}</span>
            <strong className="text-sm tabular-nums">{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
function Skeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  );
}
