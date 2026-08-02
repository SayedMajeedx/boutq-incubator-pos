import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { subDays, startOfDay, endOfDay, format } from "date-fns";
import { DateRange } from "react-day-picker";
import { useI18n } from "@/lib/i18n";
import { DatePickerWithRange } from "@/components/reports/date-range-picker";
import { Button } from "@/components/ui/button";
import {
  Download,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { exportReportData } from "@/lib/reporting.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/export")({
  component: ReportsExport,
});

type ReportType = "sales" | "products" | "customers";
type FormatType = "csv" | "xlsx";

const reportOptions = [
  {
    id: "sales",
    icon: FileText,
    en: "Sales & orders",
    ar: "المبيعات والطلبات",
    descEn: "Transactions, totals, payment and fulfillment",
    descAr: "المعاملات والإجماليات والدفع والاستلام",
  },
  {
    id: "products",
    icon: FileSpreadsheet,
    en: "Product performance",
    ar: "أداء المنتجات",
    descEn: "Units sold, net sales, cost and inventory",
    descAr: "الوحدات والمبيعات والتكلفة والمخزون",
  },
  {
    id: "customers",
    icon: Sparkles,
    en: "Customer insights",
    ar: "تحليلات العملاء",
    descEn: "Privacy-safe customer purchasing insights",
    descAr: "تحليلات شراء العملاء مع حماية الخصوصية",
  },
] as const;

function ReportsExport() {
  const { lang } = useI18n();
  const { slug } = Route.useParams();
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(startOfDay(new Date()), 30),
    to: endOfDay(new Date()),
  });
  const [reportType, setReportType] = useState<ReportType>("sales");
  const [formatType, setFormatType] = useState<FormatType>("xlsx");
  const [isExporting, setIsExporting] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const handleExport = async () => {
    if (!date?.from || !date?.to) return;
    const toastId = "report-export";
    try {
      setIsExporting(true);
      toast.loading(lang === "ar" ? "جاري إعداد الملف..." : "Preparing your file…", {
        id: toastId,
      });

      // This RPC uses the active browser session. The previous server function had no
      // user session, so every legitimate admin export was rejected as anonymous.
      const raw = await exportReportData(
        reportType,
        { from: date.from, to: date.to },
        timezone,
        slug,
      );
      if (!Array.isArray(raw) || raw.length === 0)
        throw new Error(
          lang === "ar"
            ? "لا توجد بيانات للتصدير في هذه الفترة."
            : "No data is available for this period.",
        );

      const limit = formatType === "xlsx" ? 10_000 : 50_000;
      const rows = sanitizeRows(raw.slice(0, limit));
      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Boutq report");
      const fileName = `boutq_${reportType}_${format(new Date(), "yyyy-MM-dd")}.${formatType}`;
      XLSX.writeFile(workbook, fileName, { bookType: formatType });
      toast.success(lang === "ar" ? "تم تنزيل التقرير بنجاح" : "Report downloaded successfully", {
        id: toastId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : lang === "ar" ? "فشل التصدير" : "Export failed";
      toast.error(message, { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
      <section className="rounded-2xl border bg-white p-4 shadow-[0_16px_45px_-34px_rgba(43,23,25,.5)] sm:p-7">
        <div className="mb-5 sm:mb-7">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#6b1d24]/7 px-3 py-1 text-xs font-semibold text-[#6b1d24]">
            <Download className="h-3.5 w-3.5" />
            {lang === "ar" ? "مركز التصدير" : "EXPORT CENTRE"}
          </span>
          <h2 className="mt-3 text-2xl font-semibold">
            {lang === "ar" ? "أنشئ تقريرك" : "Build your report"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {lang === "ar"
              ? "اختر البيانات والفترة والصيغة، وسنجهز ملفاً منظماً للتحليل."
              : "Choose the data, period, and format. We’ll prepare a clean file ready for analysis."}
          </p>
        </div>

        <div className="space-y-5 sm:space-y-7">
          <Field label={lang === "ar" ? "1. الفترة الزمنية" : "1. Date range"}>
            <DatePickerWithRange date={date} setDate={setDate} className="mt-3" />
          </Field>
          <Field label={lang === "ar" ? "2. محتوى التقرير" : "2. Report content"}>
            <div className="mt-3 grid gap-2.5 md:grid-cols-3">
              {reportOptions.map((option) => {
                const Icon = option.icon;
                const selected = reportType === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setReportType(option.id)}
                    className={cn(
                      "rounded-2xl border p-3.5 sm:p-4 text-start transition",
                      selected
                        ? "border-[#6b1d24] bg-[#6b1d24]/5 shadow-[0_8px_22px_-18px_rgba(91,20,26,.8)]"
                        : "hover:border-[#6b1d24]/30 hover:bg-[#faf8f7]",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-10 w-10 place-items-center rounded-xl",
                        selected ? "bg-[#5b141a] text-white" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <strong className="mt-4 block text-sm">
                      {lang === "ar" ? option.ar : option.en}
                    </strong>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {lang === "ar" ? option.descAr : option.descEn}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={lang === "ar" ? "3. صيغة الملف" : "3. File format"}>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FormatButton
                selected={formatType === "xlsx"}
                onClick={() => setFormatType("xlsx")}
                icon={<FileSpreadsheet />}
                title="Excel (.xlsx)"
                subtitle={lang === "ar" ? "موصى به للتحليل" : "Recommended for analysis"}
                tone="emerald"
              />
              <FormatButton
                selected={formatType === "csv"}
                onClick={() => setFormatType("csv")}
                icon={<FileText />}
                title="CSV (.csv)"
                subtitle={lang === "ar" ? "خفيف ومتوافق" : "Lightweight and compatible"}
                tone="blue"
              />
            </div>
          </Field>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {formatType === "xlsx"
              ? lang === "ar"
                ? "حتى 10,000 صف لكل ملف Excel"
                : "Up to 10,000 rows per Excel file"
              : lang === "ar"
                ? "حتى 50,000 صف لكل ملف CSV"
                : "Up to 50,000 rows per CSV file"}
          </p>
          <Button
            onClick={handleExport}
            disabled={!date?.from || !date?.to || isExporting}
            className="h-12 rounded-xl bg-[#5b141a] px-7 text-white hover:bg-[#741f27]"
          >
            {isExporting ? (
              <span className="me-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <Download className="me-2 h-4 w-4" />
            )}
            {isExporting
              ? lang === "ar"
                ? "جاري التصدير..."
                : "Exporting…"
              : lang === "ar"
                ? "تنزيل التقرير"
                : "Download report"}
          </Button>
        </div>
      </section>

      <aside className="grid gap-3 sm:grid-cols-2 xl:block xl:space-y-4">
        <div className="rounded-2xl bg-[linear-gradient(145deg,#481015,#6d2027)] p-6 text-white shadow-[0_20px_50px_-30px_rgba(72,16,21,.85)]">
          <ShieldCheck className="h-8 w-8 text-[#e8cda8]" />
          <h3 className="mt-5 text-xl font-semibold">
            {lang === "ar" ? "الخصوصية مدمجة" : "Privacy built in"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/75">
            {lang === "ar"
              ? "يتم حذف البريد الإلكتروني ورقم الهاتف تلقائياً من ملفات التصدير."
              : "Email addresses and phone numbers are automatically removed from exported files."}
          </p>
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <LockKeyhole className="h-5 w-5 text-[#6b1d24]" />
          <h3 className="mt-3 font-semibold">{lang === "ar" ? "وصول محمي" : "Protected access"}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {lang === "ar"
              ? "التصدير متاح فقط للمسؤولين والموظفين المخولين بعرض البيانات المالية."
              : "Exports are available only to administrators and staff with financial reporting permission."}
          </p>
        </div>
      </aside>
    </div>
  );
}

function sanitizeRows(rows: Record<string, unknown>[]) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).flatMap(([key, value]) => {
        if (/email|phone/i.test(key)) return [];
        if (typeof value === "string" && /^[=+\-@]/.test(value)) return [[key, `'${value}`]];
        return [[key, value]];
      }),
    ),
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{label}</h3>
      {children}
    </div>
  );
}
function FormatButton({ selected, onClick, icon, title, subtitle, tone }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4 text-start transition",
        selected ? "border-[#6b1d24] bg-[#6b1d24]/5" : "hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "grid h-10 w-10 place-items-center rounded-xl [&>svg]:h-5 [&>svg]:w-5",
          tone === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700",
        )}
      >
        {icon}
      </span>
      <span>
        <b className="block text-sm">{title}</b>
        <small className="text-muted-foreground">{subtitle}</small>
      </span>
      {selected && (
        <span className="ms-auto h-3 w-3 rounded-full bg-[#6b1d24] ring-4 ring-[#6b1d24]/10" />
      )}
    </button>
  );
}
