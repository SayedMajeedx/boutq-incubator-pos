import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { useI18n, useT } from "@/lib/i18n";
import { fetchReportingProducts } from "@/lib/reporting.functions";
import { DatePickerWithRange } from "@/components/reports/date-range-picker";
import { ReportsToolbar } from "@/components/reports/ReportsToolbar";
import { formatMoney } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/products")({
  component: ReportsProducts,
});

function ReportsProducts() {
  const { lang } = useI18n();
  const t = useT();
  const { slug } = Route.useParams();

  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(startOfDay(new Date()), 30),
    to: endOfDay(new Date()),
  });

  const [includeHistorical, setIncludeHistorical] = useState(false);
  const [sortBy, setSortBy] = useState("units_sold_desc");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const {
    data: productsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      "reports-products",
      date?.from?.toISOString(),
      date?.to?.toISOString(),
      timezone,
      includeHistorical,
      sortBy,
    ],
    queryFn: async () => {
      if (!date?.from || !date?.to) return null;
      return await fetchReportingProducts(
        { from: date.from, to: date.to },
        timezone,
        includeHistorical,
        50,
        0,
        sortBy,
        slug,
      );
    },
    enabled: !!date?.from && !!date?.to,
  });

  return (
    <div className="space-y-6">
      <ReportsToolbar
        lang={lang === "ar" ? "ar" : "en"}
        date={date}
        setDate={setDate}
        sortBy={sortBy}
        setSortBy={setSortBy}
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
          <AlertDescription>Failed to load products data.</AlertDescription>
        </Alert>
      ) : productsData ? (
        <Card className="rounded-2xl border-black/[.07] shadow-[0_16px_45px_-34px_rgba(43,23,25,.5)]">
          <CardHeader>
            <CardTitle>
              {lang === "ar" ? "أداء المنتجات والمخزون" : "Product Performance & Inventory"}
            </CardTitle>
            <CardDescription>
              {lang === "ar"
                ? "تفاصيل المبيعات والمخزون لكل منتج"
                : "Sales and stock details per product variant"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {productsData.length > 0 ? (
              <>
                <div className="space-y-2 sm:hidden">
                  {productsData.map((p: any, idx: number) => (
                    <article
                      key={`${p.sku || p.product_name}-${idx}`}
                      className="rounded-xl border border-border/60 bg-background/70 p-3 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold">{p.product_name}</h3>
                          <p
                            className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                            dir="ltr"
                          >
                            {p.sku || "—"}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                          {p.units_sold} {lang === "ar" ? "وحدة" : "units"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {[p.color, p.size, p.fabric].filter(Boolean).map((value: string) => (
                          <Badge key={value} variant="outline" className="text-[10px] font-normal">
                            {value}
                          </Badge>
                        ))}
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border/50 pt-3 text-xs">
                        <div>
                          <dt className="text-[10px] text-muted-foreground">
                            {lang === "ar" ? "صافي المبيعات" : "Net sales"}
                          </dt>
                          <dd className="mt-0.5 font-mono font-bold">
                            {formatMoney(p.net_merch_sales, p.currency, lang)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-muted-foreground">
                            {lang === "ar" ? "تكلفة البضاعة" : "COGS"}
                          </dt>
                          <dd className="mt-0.5 font-mono font-bold">
                            {p.is_missing_cost ? "—" : formatMoney(p.known_cogs, p.currency, lang)}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5">
                        <span className="text-[11px] text-muted-foreground">
                          {lang === "ar" ? "المخزون الحالي" : "Current stock"}
                        </span>
                        {p.is_out_of_stock ? (
                          <Badge variant="destructive">
                            <PackageX className="me-1 h-3 w-3" />0
                          </Badge>
                        ) : (
                          <Badge variant={p.is_low_stock ? "secondary" : "outline"}>
                            {p.current_stock}
                          </Badge>
                        )}
                      </div>
                      {p.is_missing_cost && (
                        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-800">
                          {lang === "ar" ? "بيانات التكلفة غير متوفرة" : "Cost data is unavailable"}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
                <div className="hidden rounded-md border sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{lang === "ar" ? "المنتج" : "Product"}</TableHead>
                        <TableHead>{lang === "ar" ? "SKU" : "SKU"}</TableHead>
                        <TableHead>{lang === "ar" ? "المتغير" : "Variant"}</TableHead>
                        <TableHead className="text-right">
                          {lang === "ar" ? "الوحدات المباعة" : "Units Sold"}
                        </TableHead>
                        <TableHead className="text-right">
                          {lang === "ar" ? "صافي المبيعات" : "Net Sales"}
                        </TableHead>
                        <TableHead className="text-right">
                          {lang === "ar" ? "تكلفة البضاعة" : "COGS"}
                        </TableHead>
                        <TableHead className="text-right">
                          {lang === "ar" ? "المخزون الحالي" : "Current Stock"}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productsData.map((p: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">
                            {p.product_name}
                            {p.is_missing_cost && (
                              <Badge
                                variant="destructive"
                                className="ml-2 mt-1 text-[10px]"
                                title={
                                  lang === "ar"
                                    ? "بيانات التكلفة مفقودة لهذا المنتج"
                                    : "Missing cost data for this product"
                                }
                              >
                                {lang === "ar" ? "بدون تكلفة" : "No Cost"}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{p.sku || "—"}</TableCell>
                          <TableCell>
                            <div className="flex max-w-[220px] flex-wrap gap-1">
                              {[p.color, p.size, p.fabric].filter(Boolean).map((value: string) => (
                                <Badge key={value} variant="outline" className="font-normal">
                                  {value}
                                </Badge>
                              ))}
                              {![p.color, p.size, p.fabric].some(Boolean) && (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold">{p.units_sold}</TableCell>
                          <TableCell className="text-right">
                            {formatMoney(p.net_merch_sales, p.currency, lang)}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.is_missing_cost ? "—" : formatMoney(p.known_cogs, p.currency, lang)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {p.is_out_of_stock ? (
                                <Badge variant="destructive" className="flex gap-1">
                                  <PackageX className="w-3 h-3" /> 0
                                </Badge>
                              ) : p.is_low_stock ? (
                                <Badge
                                  variant="secondary"
                                  className="text-amber-500 border-amber-500/20 bg-amber-500/10"
                                >
                                  {p.current_stock}
                                </Badge>
                              ) : (
                                <span>{p.current_stock}</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="text-center p-12 border rounded-lg bg-muted/20">
                <p className="text-muted-foreground">
                  {lang === "ar"
                    ? "لا توجد بيانات لهذه الفترة"
                    : "No product sales data available for this period."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
