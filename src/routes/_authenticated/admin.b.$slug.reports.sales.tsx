import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { useI18n } from "@/lib/i18n";
import { fetchReportingSales, ReportInterval } from "@/lib/reporting.functions";
import { DatePickerWithRange } from "@/components/reports/date-range-picker";
import { KpiCard } from "@/components/reports/kpi-card";
import { formatMoney } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertCircle, Banknote, CreditCard, RefreshCw, ShoppingBag, Truck } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/sales")({
  component: ReportsSales,
});

function ReportsSales() {
  const { lang } = useI18n();
  const { slug } = Route.useParams();
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(startOfDay(new Date()), 30),
    to: endOfDay(new Date()),
  });
  const [interval, setInterval] = useState<ReportInterval>("day");
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const query = useQuery({
    queryKey: [
      "reports-sales",
      date?.from?.toISOString(),
      date?.to?.toISOString(),
      interval,
      timezone,
      includeHistorical,
    ],
    queryFn: () =>
      fetchReportingSales(
        { from: date!.from!, to: date!.to! },
        interval,
        timezone,
        includeHistorical,
        slug,
      ),
    enabled: !!date?.from && !!date?.to,
  });

  const chartData = useMemo(() => {
    const rows = (query.data as any)?.timeseries || [];
    return [...rows]
      .sort((a, b) => new Date(a.time_bucket).getTime() - new Date(b.time_bucket).getTime())
      .map((row) => ({
        ...row,
        displayDate: new Date(row.time_bucket).toLocaleDateString("en-GB", {
          day: interval === "year" ? undefined : "2-digit",
          month: "short",
          year: interval === "year" ? "numeric" : undefined,
        }),
      }));
  }, [query.data, interval]);

  const currency = chartData[0]?.currency || "BHD";
  const totalRevenue = chartData.reduce((sum, row) => sum + Number(row.pov || 0), 0);
  const totalMerchandise = chartData.reduce((sum, row) => sum + Number(row.net_merch || 0), 0);
  const orderCount = chartData.reduce(
    (sum, row) => sum + Number(row.paid_order_count || row.order_count || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <DatePickerWithRange date={date} setDate={setDate} />
          <Select value={interval} onValueChange={(value) => setInterval(value as ReportInterval)}>
            <SelectTrigger className="h-11 w-full rounded-xl bg-white sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{lang === "ar" ? "يومي" : "Daily"}</SelectItem>
              <SelectItem value="week">{lang === "ar" ? "أسبوعي" : "Weekly"}</SelectItem>
              <SelectItem value="month">{lang === "ar" ? "شهري" : "Monthly"}</SelectItem>
              <SelectItem value="year">{lang === "ar" ? "سنوي" : "Yearly"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-[#faf7f6] px-3 py-2">
          <Switch
            id="historical-sales"
            checked={includeHistorical}
            onCheckedChange={setIncludeHistorical}
          />
          <Label htmlFor="historical-sales" className="text-sm">
            {lang === "ar" ? "تضمين الطلبات المؤرشفة" : "Include archived orders"}
          </Label>
        </div>
      </div>

      {query.isLoading ? (
        <ReportSkeleton />
      ) : query.error ? (
        <ErrorState lang={lang} onRetry={() => query.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              title={lang === "ar" ? "إجمالي المبيعات" : "Total revenue"}
              value={formatMoney(totalRevenue, currency, lang)}
              icon={<Banknote />}
            />
            <KpiCard
              title={lang === "ar" ? "صافي مبيعات المنتجات" : "Net merchandise"}
              value={formatMoney(totalMerchandise, currency, lang)}
              icon={<ShoppingBag />}
              accent="emerald"
            />
            <KpiCard
              title={lang === "ar" ? "الطلبات المدفوعة" : "Paid orders"}
              value={orderCount}
              icon={<CreditCard />}
              accent="blue"
            />
          </div>

          <section className="rounded-2xl border bg-white p-5 shadow-[0_16px_45px_-34px_rgba(43,23,25,.5)] sm:p-7">
            <div className="mb-7 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  {lang === "ar" ? "اتجاه المبيعات" : "Sales trend"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {lang === "ar"
                    ? "الإيرادات وصافي مبيعات المنتجات خلال الفترة المحددة"
                    : "Revenue and net merchandise across the selected period"}
                </p>
              </div>
              <div className="mt-2 text-xs font-medium text-muted-foreground">
                {chartData.length} {lang === "ar" ? "نقطة بيانات" : "data points"}
              </div>
            </div>
            <div className="h-[360px] w-full sm:h-[430px]">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6b1d24" stopOpacity=".28" />
                        <stop offset="100%" stopColor="#6b1d24" stopOpacity=".02" />
                      </linearGradient>
                      <linearGradient id="merchFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#c59a66" stopOpacity=".22" />
                        <stop offset="100%" stopColor="#c59a66" stopOpacity=".01" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#eee8e6" strokeDasharray="4 6" />
                    <XAxis
                      dataKey="displayDate"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#766a6b", fontSize: 12 }}
                      minTickGap={28}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#766a6b", fontSize: 12 }}
                      width={48}
                    />
                    <Tooltip
                      content={<SalesTooltip currency={currency} lang={lang} />}
                      cursor={{ stroke: "#6b1d24", strokeOpacity: 0.18 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: 18, fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="pov"
                      name={lang === "ar" ? "الإيرادات" : "Revenue"}
                      stroke="#6b1d24"
                      strokeWidth={3}
                      fill="url(#revenueFill)"
                      activeDot={{ r: 5, fill: "#6b1d24", stroke: "#fff", strokeWidth: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="net_merch"
                      name={lang === "ar" ? "صافي المنتجات" : "Net merchandise"}
                      stroke="#c59a66"
                      strokeWidth={2.5}
                      fill="url(#merchFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState lang={lang} />
              )}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <BreakdownCard
              title={lang === "ar" ? "طرق الدفع" : "Payment methods"}
              icon={<CreditCard />}
              rows={(query.data as any)?.payment_methods}
              keyName="payment_method"
              currency={currency}
              lang={lang}
            />
            <BreakdownCard
              title={lang === "ar" ? "طرق الاستلام" : "Fulfillment methods"}
              icon={<Truck />}
              rows={(query.data as any)?.fulfillment_methods}
              keyName="fulfillment_method"
              currency={currency}
              lang={lang}
            />
          </div>
        </>
      )}
    </div>
  );
}

function SalesTooltip({ active, payload, label, currency, lang }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-52 rounded-xl border border-black/10 bg-white p-4 shadow-xl">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {payload.map((item: any) => (
        <div key={item.dataKey} className="mt-2 flex items-center justify-between gap-6 text-sm">
          <span className="flex items-center gap-2">
            <i className="h-2 w-2 rounded-full" style={{ background: item.stroke }} />
            {item.name}
          </span>
          <b className="tabular-nums">{formatMoney(item.value, currency, lang)}</b>
        </div>
      ))}
    </div>
  );
}

function BreakdownCard({ title, icon, rows = [], keyName, currency, lang }: any) {
  const max = Math.max(...rows.map((row: any) => Number(row.pov || 0)), 1);
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#6b1d24]/8 text-[#6b1d24] [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
        {title}
      </h3>
      {rows.length ? (
        <div className="space-y-5">
          {rows.map((row: any, index: number) => (
            <div key={`${row[keyName]}-${index}`}>
              <div className="mb-2 flex justify-between gap-4 text-sm">
                <span className="font-medium capitalize">
                  {String(row[keyName] || "Unknown").replace(/_/g, " ")}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatMoney(row.pov, row.currency || currency, lang)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#f2eceb]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#5b141a,#9e4b52)]"
                  style={{ width: `${Math.max(4, (Number(row.pov || 0) / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState lang={lang} compact />
      )}
    </section>
  );
}

function ErrorState({ lang, onRetry }: { lang: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center">
      <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
      <h2 className="mt-3 font-semibold">
        {lang === "ar" ? "تعذر تحميل بيانات المبيعات" : "Sales data could not be loaded"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "ar" ? "تحقق من الاتصال ثم أعد المحاولة." : "Check the connection and try again."}
      </p>
      <Button variant="outline" className="mt-5 rounded-xl bg-white" onClick={onRetry}>
        <RefreshCw className="me-2 h-4 w-4" />
        {lang === "ar" ? "إعادة المحاولة" : "Try again"}
      </Button>
    </div>
  );
}
function EmptyState({ lang, compact = false }: { lang: string; compact?: boolean }) {
  return (
    <div
      className={`grid place-items-center text-center text-sm text-muted-foreground ${compact ? "min-h-32" : "h-full"}`}
    >
      {lang === "ar" ? "لا توجد مبيعات في هذه الفترة" : "No sales in this period"}
    </div>
  );
}
function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[430px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
