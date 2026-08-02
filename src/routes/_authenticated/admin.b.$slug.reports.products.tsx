import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { useI18n, useT } from "@/lib/i18n";
import { fetchReportingProducts } from "@/lib/reporting.functions";
import { DatePickerWithRange } from "@/components/reports/date-range-picker";
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
      <div className="flex flex-col justify-between gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="flex flex-col sm:flex-row gap-4">
          <DatePickerWithRange date={date} setDate={setDate} />
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-11 w-full rounded-xl sm:w-[220px]">
              <SelectValue placeholder={lang === "ar" ? "ترتيب حسب" : "Sort by"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="units_sold_desc">
                {lang === "ar" ? "الأكثر مبيعاً (كمية)" : "Highest Units Sold"}
              </SelectItem>
              <SelectItem value="net_merch_desc">
                {lang === "ar" ? "الأعلى قيمة (صافي البضائع)" : "Highest Net Merchandise"}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="historical-products"
            checked={includeHistorical}
            onCheckedChange={setIncludeHistorical}
          />
          <Label htmlFor="historical-products">
            {lang === "ar" ? "تضمين الأرشيف" : "Include archived"}
          </Label>
        </div>
      </div>

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
              <div className="rounded-md border">
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
