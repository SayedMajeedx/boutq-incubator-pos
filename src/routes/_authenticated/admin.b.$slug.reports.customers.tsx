import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { useI18n, useT } from "@/lib/i18n";
import { fetchReportingCustomers } from "@/lib/reporting.functions";
import { DatePickerWithRange } from "@/components/reports/date-range-picker";
import { ReportsToolbar } from "@/components/reports/ReportsToolbar";
import { KpiCard } from "@/components/reports/kpi-card";
import { formatMoney } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, UserPlus, Users as UsersIcon } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/customers")({
  component: ReportsCustomers,
});

function ReportsCustomers() {
  const { lang } = useI18n();
  const t = useT();
  const { slug } = Route.useParams();

  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(startOfDay(new Date()), 30),
    to: endOfDay(new Date()),
  });

  const [includeHistorical, setIncludeHistorical] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const {
    data: customersData,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      "reports-customers",
      date?.from?.toISOString(),
      date?.to?.toISOString(),
      timezone,
      includeHistorical,
    ],
    queryFn: async () => {
      if (!date?.from || !date?.to) return null;
      return await fetchReportingCustomers(
        { from: date.from, to: date.to },
        timezone,
        includeHistorical,
        50,
        0,
        slug,
      );
    },
    enabled: !!date?.from && !!date?.to,
  });

  const pieData = customersData
    ? [
        {
          name: lang === "ar" ? "عملاء جدد" : "New Customers",
          value: customersData.new_customers_count,
          color: "#6b1d24",
        },
        {
          name: lang === "ar" ? "عملاء متكررون" : "Returning Customers",
          value: customersData.returning_customers_count,
          color: "#c59a66",
        },
      ]
    : [];

  const totalCustomers = customersData
    ? customersData.new_customers_count + customersData.returning_customers_count
    : 0;

  return (
    <div className="space-y-6">
      <ReportsToolbar
        lang={lang === "ar" ? "ar" : "en"}
        date={date}
        setDate={setDate}
        includeHistorical={includeHistorical}
        setIncludeHistorical={setIncludeHistorical}
      />

      {isLoading ? (
        <Card className="animate-pulse">
          <CardHeader className="h-16 bg-muted/50 rounded-t-lg" />
          <CardContent className="h-[400px]" />
        </Card>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load customers data.</AlertDescription>
        </Alert>
      ) : customersData ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <KpiCard
              title={lang === "ar" ? "العملاء الجدد" : "New Customers"}
              value={customersData.new_customers_count}
              icon={<UserPlus />}
              description={
                lang === "ar" ? "أول طلب لهم في هذه الفترة" : "First order within this period"
              }
            />
            <KpiCard
              title={lang === "ar" ? "العملاء المتكررون" : "Returning Customers"}
              value={customersData.returning_customers_count}
              icon={<UsersIcon />}
              description={
                lang === "ar" ? "طلبوا سابقاً قبل هذه الفترة" : "Have ordered before this period"
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>{lang === "ar" ? "نسبة العملاء" : "Customer Split"}</CardTitle>
                <CardDescription>
                  {lang === "ar" ? "الجدد مقابل المتكررين" : "New vs Returning"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  {totalCustomers > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--background))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                          itemStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      {lang === "ar" ? "لا توجد طلبات في هذه الفترة" : "No orders in this period"}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{lang === "ar" ? "أفضل العملاء" : "Top Customers"}</CardTitle>
                <CardDescription>
                  {lang === "ar"
                    ? "العملاء الأعلى إنفاقاً في هذه الفترة"
                    : "Highest spending customers in this period"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {customersData.top_customers && customersData.top_customers.length > 0 ? (
                  <>
                    <div className="space-y-2 sm:hidden">
                      {customersData.top_customers.map((c: any, idx: number) => (
                        <article
                          key={`${c.customer_name}-${idx}`}
                          className="rounded-xl border border-border/60 bg-background/70 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="min-w-0 truncate text-sm font-bold">
                              {c.customer_name}
                            </h3>
                            <strong className="shrink-0 font-mono text-sm">
                              {formatMoney(c.total_pov, c.currency, lang)}
                            </strong>
                          </div>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {c.paid_order_count} {lang === "ar" ? "طلبات مدفوعة" : "paid orders"}
                          </p>
                        </article>
                      ))}
                    </div>
                    <div className="hidden rounded-md border sm:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{lang === "ar" ? "العميل" : "Customer"}</TableHead>
                            <TableHead className="text-center">
                              {lang === "ar" ? "الطلبات" : "Orders"}
                            </TableHead>
                            <TableHead className="text-right">
                              {lang === "ar" ? "إجمالي الإنفاق" : "Total Spent"}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customersData.top_customers.map((c: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{c.customer_name}</TableCell>
                              <TableCell className="text-center">{c.paid_order_count}</TableCell>
                              <TableCell className="text-right">
                                {formatMoney(c.total_pov, c.currency, lang)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-8 border rounded-lg bg-muted/20">
                    <p className="text-muted-foreground">
                      {lang === "ar" ? "لا توجد بيانات للعملاء" : "No customer data available."}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
