import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { importCustomerDatabase } from "@/lib/customer-importer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  Star,
  Check,
  Loader2,
  Upload,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useT, useI18n } from "@/lib/i18n";
import {
  BAHRAIN_REGIONS,
  regionLabel,
  formatAddressLine,
  type StructuredAddress,
} from "@/lib/bahrain-regions";
import { PhoneInput } from "@/components/phone-input";
import { useBrand } from "@/lib/brand-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatMoney } from "@/lib/format";
import { buildCustomerCrmStats, type CustomerMetricOrder } from "@/lib/commerce-metrics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/customers")({
  component: CustomersRoute,
});

function CustomersRoute() {
  const { slug } = Route.useParams();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const listPath = `/admin/b/${encodeURIComponent(slug)}/customers`;
  if (pathname.replace(/\/+$/, "") !== listPath) return <Outlet />;
  return <CustomersPage />;
}

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  region: string | null;
  block: string | null;
  road: string | null;
  house: string | null;
  flat: string | null;
};

type Address = {
  id: string;
  customer_id: string;
  label: string | null;
  region: string | null;
  block: string | null;
  road: string | null;
  house: string | null;
  flat: string | null;
  is_default: boolean;
};

function DeleteAction({
  message,
  onConfirm,
  mobile = false,
}: {
  message: string;
  onConfirm: () => unknown | Promise<unknown>;
  mobile?: boolean;
}) {
  const t = useT();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          className={mobile ? "h-11 w-11 touch-manipulation text-destructive" : "text-destructive"}
          variant="ghost"
          size="icon"
          aria-label={t("common.delete")}
        >
          <Trash2 className={mobile ? "h-5 w-5" : "h-4 w-4"} />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => void onConfirm()}
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentVal = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      row.push(currentVal.trim());
      lines.push(row);
      row = [];
      currentVal = "";
    } else {
      currentVal += char;
    }
  }
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    lines.push(row);
  }
  return lines.filter((r) => r.length > 0 && r.some((val) => val !== ""));
}

function parseVCard(
  vcardText: string,
): Array<{ name: string; phone: string | null; email: string | null }> {
  const contacts: Array<{ name: string; phone: string | null; email: string | null }> = [];
  const blocks = vcardText.split("BEGIN:VCARD");
  for (const block of blocks) {
    if (!block.trim()) continue;
    let name = "";
    let phone: string | null = null;
    let email: string | null = null;

    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith("FN:")) {
        name = cleanLine.slice(3).trim();
      } else if (cleanLine.startsWith("N:") && !name) {
        const parts = cleanLine.slice(2).split(";");
        const first = parts[1] || "";
        const last = parts[0] || "";
        name = `${first} ${last}`.trim();
      } else if (cleanLine.startsWith("TEL")) {
        const parts = cleanLine.split(":");
        const phoneNum = parts[1] ? parts[1].replace(/[^\d+]/g, "").trim() : "";
        if (phoneNum) phone = phoneNum;
      } else if (cleanLine.startsWith("EMAIL")) {
        const parts = cleanLine.split(":");
        const emailAddr = parts[1] ? parts[1].trim() : "";
        if (emailAddr) email = emailAddr;
      }
    }
    if (name || phone || email) {
      contacts.push({ name: name || "WhatsApp Contact", phone, email });
    }
  }
  return contacts;
}

function sanitizeGCCPhone(phoneStr: string | null): string | null {
  if (!phoneStr) return null;
  let clean = phoneStr.replace(/[^\d]/g, "");
  clean = clean.replace(/^0+/, "");

  if (clean.length === 8) {
    return `+973${clean}`;
  }
  if (clean.length === 9 && clean.startsWith("5")) {
    return `+966${clean}`;
  }
  if (clean.startsWith("973") || clean.startsWith("966")) {
    return `+${clean}`;
  }
  return `+${clean}`;
}

const CUSTOMER_HEADER_MAPS = {
  name: [
    "first name",
    "last name",
    "name",
    "اسم العميل",
    "الاسم",
    "client name",
    "customer name",
    "customer_name",
  ],
  phone: [
    "phone",
    "phone number",
    "tel",
    "mobile",
    "رقم الجوال",
    "رقم الهاتف",
    "الجوال",
    "phone_number",
  ],
  email: ["email", "email address", "البريد الإلكتروني", "البريد", "email_address"],
  orders: ["total orders", "orders", "عدد الطلبات", "الطلبات", "total_orders"],
  spend: [
    "total spend",
    "spend",
    "إجمالي المشتريات",
    "المشتريات",
    "إجمالي المبيعات",
    "total_spend",
    "total_spent",
  ],
};

function CustomerImporterModal({
  brandId,
  onComplete,
}: {
  brandId: string;
  onComplete: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"preset" | "mapper" | "importing" | "success">("preset");
  const [preset, setPreset] = useState<
    "shopify" | "salla" | "zid" | "woocommerce" | "whatsapp" | "custom"
  >("custom");
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>({
    name: -1,
    phone: -1,
    email: -1,
    orders: -1,
    spend: -1,
  });
  const [progress, setProgress] = useState("");
  const [successCount, setSuccessCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;

      // Handle vCard / VCF Phone contacts directly!
      if (file.name.endsWith(".vcf") || text.includes("BEGIN:VCARD")) {
        setPreset("whatsapp");
        const contacts = parseVCard(text);
        if (contacts.length === 0) {
          toast.error(
            isAr
              ? "لم نتمكن من العثور على أي جهات اتصال صالحة في ملف vCard."
              : "No valid contacts found in this vCard file.",
          );
          return;
        }
        startImportDirect(
          contacts.map((c) => ({
            name: c.name,
            phone: sanitizeGCCPhone(c.phone),
            email: c.email,
            notes: "Imported from WhatsApp Contacts vCard",
            totalOrders: 0,
            totalSpend: 0,
            tags: ["imported_from_whatsapp"],
          })),
        );
        return;
      }

      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error(isAr ? "ملف الـ CSV فارغ أو غير صالح." : "CSV file is empty or invalid.");
        return;
      }

      const fileHeaders = rows[0].map((h) => h.trim());
      setParsedRows(rows.slice(1));
      setHeaders(fileHeaders);

      // Smart Header Matcher
      const newMappings = { name: -1, phone: -1, email: -1, orders: -1, spend: -1 };
      Object.entries(CUSTOMER_HEADER_MAPS).forEach(([field, aliases]) => {
        const foundIdx = fileHeaders.findIndex((h) =>
          aliases.some(
            (alias) =>
              h.toLowerCase() === alias.toLowerCase() ||
              h.toLowerCase().includes(alias.toLowerCase()),
          ),
        );
        newMappings[field as keyof typeof newMappings] = foundIdx;
      });

      setMappings(newMappings);

      const mandatoryMapped = newMappings.name !== -1 && newMappings.phone !== -1;
      if (mandatoryMapped && preset !== "custom") {
        startImportCSV(rows.slice(1), newMappings, fileHeaders);
      } else {
        setStep("mapper");
      }
    };
    reader.readAsText(file);
  };

  const startImportDirect = async (customersList: any[]) => {
    setStep("importing");
    setTotalCount(customersList.length);
    setProgress(isAr ? "بدء عملية الاستيراد الشاملة..." : "Starting contact ingestion process...");

    try {
      const batchSize = 25;
      let totalSuccess = 0;

      for (let i = 0; i < customersList.length; i += batchSize) {
        const chunk = customersList.slice(i, i + batchSize);
        setProgress(
          isAr
            ? `جاري استيراد وتطهير جهات الاتصال: ${i} من أصل ${customersList.length} عميل...`
            : `Ingested & sanitized ${i} / ${customersList.length} customer contacts...`,
        );

        const result = await importCustomerDatabase({
          data: {
            brandId,
            customers: chunk,
          },
        });
        totalSuccess += result.successCount;
        setSuccessCount(totalSuccess);
      }

      setStep("success");
      onComplete();
    } catch (err) {
      console.error(err);
      toast.error(
        isAr ? "فشل استيراد قاعدة البيانات" : "Customer database migration pipeline failed",
      );
      setStep("preset");
    }
  };

  const startImportCSV = (
    dataRows: string[][],
    finalMappings: Record<string, number>,
    headersList: string[] = headers,
  ) => {
    const findHeaderIdx = (names: string[]) => {
      return headersList.findIndex((h) =>
        names.some((name) => h.trim().toLowerCase() === name.toLowerCase()),
      );
    };

    const findHeaderIdxContains = (names: string[]) => {
      return headersList.findIndex((h) =>
        names.some((name) => h.trim().toLowerCase().includes(name.toLowerCase())),
      );
    };

    const parsedCustomers = dataRows.map((row) => {
      let nameVal = "";
      let phoneVal: string | null = null;
      let emailVal: string | null = null;
      let ordersVal = 0;
      let spendVal = 0;

      if (preset === "shopify") {
        const firstNameIdx = findHeaderIdx(["first name"]);
        const lastNameIdx = findHeaderIdx(["last name"]);
        const emailIdx = findHeaderIdx(["email"]);
        const defaultPhoneIdx = findHeaderIdx(["default address phone"]);
        const phoneIdx = findHeaderIdx(["phone"]);
        const totalSpentIdx = findHeaderIdx(["total spent", "total spend"]);
        const totalOrdersIdx = findHeaderIdx(["total orders"]);

        const first = firstNameIdx !== -1 ? row[firstNameIdx] : "";
        const last = lastNameIdx !== -1 ? row[lastNameIdx] : "";
        nameVal = `${first} ${last}`.trim();

        if (!nameVal) {
          const custIdx = findHeaderIdx(["customer", "customer name", "name"]);
          if (custIdx !== -1) {
            nameVal = row[custIdx]?.replace(/^\d+\s+/, "").trim() || "";
          }
        }

        const rawPhone =
          (defaultPhoneIdx !== -1 ? row[defaultPhoneIdx] : null) ||
          (phoneIdx !== -1 ? row[phoneIdx] : null);
        phoneVal = sanitizeGCCPhone(rawPhone);

        emailVal = emailIdx !== -1 ? row[emailIdx] : null;
        ordersVal =
          totalOrdersIdx !== -1
            ? parseInt(row[totalOrdersIdx]?.replace(/[^\d]/g, "") || "0") || 0
            : 0;
        spendVal =
          totalSpentIdx !== -1
            ? parseFloat(row[totalSpentIdx]?.replace(/[^\d.]/g, "") || "0") || 0
            : 0;
      } else if (preset === "woocommerce") {
        const firstNameIdx = findHeaderIdx([
          "first name",
          "billing_first_name",
          "shipping_first_name",
        ]);
        const lastNameIdx = findHeaderIdx(["last name", "billing_last_name", "shipping_last_name"]);
        const emailIdx = findHeaderIdx(["email", "billing_email", "user_email"]);
        const phoneIdx = findHeaderIdx(["phone", "billing_phone"]);
        const totalSpentIdx = findHeaderIdx(["total spend", "total_spent", "spent"]);
        const totalOrdersIdx = findHeaderIdx(["total orders", "orders_count", "orders"]);

        const first = firstNameIdx !== -1 ? row[firstNameIdx] : "";
        const last = lastNameIdx !== -1 ? row[lastNameIdx] : "";
        nameVal = `${first} ${last}`.trim();

        phoneVal = sanitizeGCCPhone(phoneIdx !== -1 ? row[phoneIdx] : null);
        emailVal = emailIdx !== -1 ? row[emailIdx] : null;
        ordersVal =
          totalOrdersIdx !== -1
            ? parseInt(row[totalOrdersIdx]?.replace(/[^\d]/g, "") || "0") || 0
            : 0;
        spendVal =
          totalSpentIdx !== -1
            ? parseFloat(row[totalSpentIdx]?.replace(/[^\d.]/g, "") || "0") || 0
            : 0;
      } else if (preset === "salla" || preset === "zid") {
        const nameIdx = findHeaderIdx([
          "اسم العميل",
          "الاسم الكامل",
          "الاسم",
          "client name",
          "customer name",
          "name",
        ]);
        const phoneIdx = findHeaderIdx([
          "رقم الجوال",
          "رقم الهاتف",
          "الجوال",
          "الهاتف",
          "mobile",
          "phone",
        ]);
        const emailIdx = findHeaderIdx(["البريد الإلكتروني", "البريد", "email", "email address"]);
        const ordersIdx = findHeaderIdx([
          "عدد الطلبات",
          "عدد الطلبات الناجحة",
          "الطلبات",
          "orders",
          "total orders",
        ]);
        const spendIdx = findHeaderIdx([
          "إجمالي المشتريات",
          "إجمالي المبيعات",
          "المشتريات",
          "spend",
          "total spend",
          "total spent",
        ]);

        nameVal = nameIdx !== -1 ? row[nameIdx] : "";
        phoneVal = sanitizeGCCPhone(phoneIdx !== -1 ? row[phoneIdx] : null);
        emailVal = emailIdx !== -1 ? row[emailIdx] : null;
        ordersVal =
          ordersIdx !== -1 ? parseInt(row[ordersIdx]?.replace(/[^\d]/g, "") || "0") || 0 : 0;
        spendVal =
          spendIdx !== -1 ? parseFloat(row[spendIdx]?.replace(/[^\d.]/g, "") || "0") || 0 : 0;
      } else {
        nameVal = row[finalMappings.name] || "";
        phoneVal = sanitizeGCCPhone(row[finalMappings.phone] || null);
        emailVal = finalMappings.email !== -1 ? row[finalMappings.email] : null;
        ordersVal =
          finalMappings.orders !== -1
            ? parseInt(row[finalMappings.orders]?.replace(/[^\d]/g, "") || "0") || 0
            : 0;
        spendVal =
          finalMappings.spend !== -1
            ? parseFloat(row[finalMappings.spend]?.replace(/[^\d.]/g, "") || "0") || 0
            : 0;
      }

      if (!nameVal) {
        nameVal = isAr ? "عميل مستورد" : "Imported Customer";
      }

      const tags = [`migrated_${preset}`];

      return {
        name: nameVal,
        phone: phoneVal,
        email: emailVal,
        notes: isAr ? `مستورد من ${preset}` : `Imported from ${preset}`,
        totalOrders: ordersVal,
        totalSpend: spendVal,
        tags,
      };
    });

    startImportDirect(parsedCustomers);
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setIsOpen(true);
          setStep("preset");
        }}
        className="border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all text-primary"
      >
        <Plus className="h-4 w-4 me-2" />
        {isAr ? "استيراد العملاء وجهات الاتصال" : "Import Customers"}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-xl border-zinc-100 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              <Users className="h-5 w-5 text-primary" />
              {isAr ? "مساعد هجرة العملاء الفاخر" : "Universal Customer Migration Suite"}
            </DialogTitle>
          </DialogHeader>

          {step === "preset" && (
            <div className="space-y-4 pt-2 select-none">
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "اختر المنصة التي تريد الهجرة منها. سنقوم تلقائياً بتطهير وتنسيق أرقام الهواتف وتفادي التكرار ووسم العملاء المميزين VIP."
                  : "Select your export source. We will automatically sanitize GCC phone numbers, prevent duplicates, and apply automatic VIP tagging."}
              </p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    id: "shopify",
                    name: "Shopify Customers",
                    desc: "customers_export.csv",
                    color: "hover:border-emerald-500/30",
                  },
                  {
                    id: "salla",
                    name: "Salla (سلة)",
                    desc: "عملاء سلة إكسل",
                    color: "hover:border-green-500/30",
                  },
                  {
                    id: "zid",
                    name: "Zid (زد)",
                    desc: "عملاء زد إكسل",
                    color: "hover:border-purple-500/30",
                  },
                  {
                    id: "woocommerce",
                    name: "WooCommerce",
                    desc: "WooCommerce CSV",
                    color: "hover:border-blue-500/30",
                  },
                  {
                    id: "whatsapp",
                    name: "WhatsApp / Contacts",
                    desc: ".vcf vCard format",
                    color: "hover:border-amber-500/30",
                  },
                  {
                    id: "custom",
                    name: isAr ? "CSV مخصص" : "Custom CSV / Sheets",
                    desc: "Any custom sheet",
                    color: "hover:border-primary/30",
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setPreset(item.id as any)}
                    className={`flex flex-col items-start p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 text-left transition-all ${item.color} ${
                      preset === item.id
                        ? "border-primary ring-2 ring-primary/10 bg-primary/5 dark:bg-primary/5"
                        : ""
                    }`}
                  >
                    <span className="text-sm font-semibold font-display text-foreground block">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                <label className="relative cursor-pointer">
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-xs rounded-xl shadow-lg shadow-primary/10 hover:shadow-xl hover:bg-primary/95 transition-all">
                    <Upload className="h-4 w-4" />
                    {isAr ? "رفع الملف وبدء الهجرة" : "Upload File & Import"}
                  </span>
                  <input
                    type="file"
                    accept=".csv,.vcf"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}

          {step === "mapper" && (
            <div className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "يرجى تعيين ومطابقة أعمدة ملف الـ CSV الخاص بك مع الحقول المطلوبة لقاعدة بيانات العملاء:"
                  : "Please map your CSV columns to the appropriate fields in our customer database:"}
              </p>

              <div className="space-y-3">
                {[
                  {
                    key: "name",
                    label: isAr ? "الاسم الكامل للعميل" : "Customer Full Name",
                    required: true,
                  },
                  {
                    key: "phone",
                    label: isAr ? "رقم الجوال / الواتساب" : "Phone/WhatsApp Number",
                    required: true,
                  },
                  {
                    key: "email",
                    label: isAr ? "البريد الإلكتروني" : "Email Address",
                    required: false,
                  },
                  {
                    key: "orders",
                    label: isAr ? "إجمالي الطلبات" : "Total Orders",
                    required: false,
                  },
                  {
                    key: "spend",
                    label: isAr ? "إجمالي المشتريات (د.ب)" : "Total Spend (BHD)",
                    required: false,
                  },
                ].map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center justify-between gap-4 p-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-xl border border-zinc-100 dark:border-zinc-800"
                  >
                    <span className="text-xs font-semibold text-foreground">
                      {field.label} {field.required && <span className="text-rose-500">*</span>}
                    </span>
                    <Select
                      value={mappings[field.key]?.toString() || "-1"}
                      onValueChange={(val) =>
                        setMappings((m) => ({ ...m, [field.key]: parseInt(val) }))
                      }
                    >
                      <SelectTrigger className="w-[200px] h-9 text-xs">
                        <SelectValue placeholder={isAr ? "اختر العمود..." : "Select column..."} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="-1">
                          -- {isAr ? "تخطي العمود" : "Skip Field"} --
                        </SelectItem>
                        {headers.map((h, idx) => (
                          <SelectItem key={idx} value={idx.toString()}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                <Button
                  onClick={() => {
                    if (mappings.name === -1 || mappings.phone === -1) {
                      toast.error(
                        isAr
                          ? "يجب مطابقة الاسم الكامل ورقم الجوال."
                          : "Full Name and Phone Number are mandatory.",
                      );
                      return;
                    }
                    startImportCSV(parsedRows, mappings);
                  }}
                  className="bg-primary text-xs text-primary-foreground font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-primary/10 hover:shadow-xl transition-all"
                >
                  {isAr ? "تأكيد واستيراد الآن" : "Confirm & Import Database"}
                </Button>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
                <div className="relative h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Loader2 className="h-7 w-7 text-primary animate-spin" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground font-display">
                  {isAr
                    ? "جاري ترحيل وتطهير قاعدة بيانات العملاء..."
                    : "Migrating & Sanitizing Customer Profiles..."}
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm font-sans mx-auto leading-relaxed">
                  {progress}
                </p>
              </div>
              <div className="w-full max-w-xs bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${totalCount > 0 ? (successCount / totalCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-10 space-y-5 text-center">
              <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
                <Check className="h-7 w-7 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold font-display text-zinc-900 dark:text-zinc-100">
                  {isAr
                    ? "تم استيراد قاعدة بيانات العملاء بنجاح!"
                    : "Customer Database Migrated Successfully!"}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                  {isAr
                    ? `تم استيراد وتطهير ${successCount} جهة اتصال بنجاح، وتوسيم العملاء المميزين VIP وتفادي جهات الاتصال المكررة بالكامل!`
                    : `Successfully imported & sanitized ${successCount} customer profiles! Deduplicated existing phone numbers, and auto-applied VIP customer tags!`}
                </p>
              </div>
              <Button
                onClick={() => setIsOpen(false)}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-xl transition-all"
              >
                {isAr ? "عرض قائمة العملاء" : "View Customer Database"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CustomersPage() {
  const t = useT();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(1);

  useRealtimeInvalidate(
    [
      { table: "customers", brandId, queryKey: ["customers", brandId] },
      { table: "customer_addresses", brandId, queryKey: ["customer_addresses", brandId] },
    ],
    `customers-list-${brandId}`,
  );

  const { data } = useQuery({
    queryKey: ["customers", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Customer[];
    },
  });

  const addressesQ = useQuery({
    queryKey: ["customer_addresses", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("brand_id", brandId);
      if (error) throw error;
      return data as Address[];
    },
  });
  const defaultByCustomer = new Map<string, Address>();
  (addressesQ.data ?? []).forEach((a) => {
    if (a.is_default) defaultByCustomer.set(a.customer_id, a);
  });

  const businessName = useQuery({
    queryKey: ["business-name", brandId],
    queryFn: async () => {
      const { data } = await supabase
        .from("business_settings")
        .select("business_name, currency")
        .eq("brand_id", brandId)
        .maybeSingle();
      return data ?? null;
    },
  });
  const currency = businessName.data?.currency ?? "BHD";

  const ordersQ = useQuery({
    queryKey: ["customer-orders", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_id, total, created_at, status, payment_status, fulfillment_status")
        .eq("brand_id", brandId);
      if (error) throw error;
      return data as Array<CustomerMetricOrder & { id: string }>;
    },
  });

  const customerCrmStats = useMemo(() => buildCustomerCrmStats(ordersQ.data ?? []), [ordersQ.data]);

  const del = async (id: string) => {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(t("common.delete"));
      qc.invalidateQueries({ queryKey: ["customers"] });
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredCustomers = (data ?? []).filter((customer) => {
    const defaultAddress = defaultByCustomer.get(customer.id);
    const customerRegion = defaultAddress?.region || customer.region || customer.city || "";
    const matchesSearch =
      !normalizedSearch ||
      [customer.name, customer.phone, customer.email].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(normalizedSearch),
      );
    return matchesSearch && (regionFilter === "all" || customerRegion === regionFilter);
  });
  const pageCount = Math.max(1, Math.ceil(filteredCustomers.length / rowsPerPage));
  const safePage = Math.min(page, pageCount);
  const visibleCustomers = filteredCustomers.slice(
    (safePage - 1) * rowsPerPage,
    safePage * rowsPerPage,
  );

  useEffect(() => setPage(1), [search, regionFilter, rowsPerPage]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-4 pt-7 sm:p-6 lg:p-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 dark:from-slate-50 dark:to-slate-300 sm:text-4xl">
            {t("customers.title")}
          </h1>
          <p className="mt-1.5 text-muted-foreground text-sm max-w-md">{t("customers.subtitle")}</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center">
          <CustomerImporterModal
            brandId={brandId}
            onComplete={() => qc.invalidateQueries({ queryKey: ["customers"] })}
          />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="w-full shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 sm:w-auto">
                <Plus className="h-4 w-4 me-2" /> {t("customers.new")}
              </Button>
            </DialogTrigger>
            <CustomerDialog
              customer={null}
              onSaved={() => {
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["customers"] });
              }}
            />
          </Dialog>
        </div>
      </div>

      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(260px,1fr)_220px]">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="ps-9 bg-background/50"
              placeholder={
                lang === "ar"
                  ? "ابحث بالاسم أو الهاتف أو البريد الإلكتروني"
                  : "Search by name, phone, or email"
              }
            />
          </div>
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "كل المناطق" : "All regions"}</SelectItem>
              {BAHRAIN_REGIONS.map((region) => (
                <SelectItem key={region.value} value={region.value}>
                  {lang === "ar" ? region.ar : region.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {filteredCustomers.length}{" "}
          {lang === "ar" ? "عميل" : filteredCustomers.length === 1 ? "customer" : "customers"}
        </p>
      </Card>

      {(data ?? []).length === 0 ? (
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-12 text-center animate-fade-in">
          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3 animate-pulse" />
          <p className="text-muted-foreground">{t("customers.none")}</p>
        </Card>
      ) : filteredCustomers.length === 0 ? (
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-10 text-center animate-fade-in">
          <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground animate-pulse" />
          <p className="font-medium text-lg text-foreground">
            {lang === "ar" ? "لا يوجد عملاء مطابقون" : "No matching customers"}
          </p>
          <Button
            variant="ghost"
            className="mt-4 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
            onClick={() => {
              setSearch("");
              setRegionFilter("all");
            }}
          >
            {lang === "ar" ? "مسح البحث والتصفية" : "Clear search and filters"}
          </Button>
        </Card>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {visibleCustomers.map((c) => {
              const def = defaultByCustomer.get(c.id);
              const address = def
                ? formatAddressLine(def, lang) || regionLabel(def.region, lang)
                : regionLabel(c.region, lang) || c.city;
              const stats = customerCrmStats.get(c.id) || {
                totalOrders: 0,
                lifetimeSpend: 0,
                lastOrderDate: null,
                badge: null,
              };
              return (
                <Card
                  key={c.id}
                  className="overflow-hidden border border-border/60 shadow-md rounded-2xl bg-card/40 backdrop-blur-sm p-4 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:scale-[1.005] cursor-pointer"
                  onClick={() =>
                    navigate({
                      to: "/admin/b/$slug/customers/$customerId",
                      params: { slug, customerId: c.id },
                    })
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{c.name}</span>
                        {(() => {
                          if (stats.badge === "VIP") {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/60 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                                <Star className="h-2.5 w-2.5 fill-amber-500 stroke-amber-500" />
                                {lang === "ar" ? "مميز" : "VIP"}
                              </span>
                            );
                          }
                          if (stats.badge === "Churn Risk") {
                            return (
                              <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                                {lang === "ar" ? "راكد" : "Churn"}
                              </span>
                            );
                          }
                          if (stats.badge === "New Buyer") {
                            return (
                              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                                {lang === "ar" ? "جديد" : "New"}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div
                        className={`mt-1 flex flex-col ${lang === "ar" ? "items-end" : "items-start"}`}
                      >
                        {c.phone && (
                          <div className="text-sm text-muted-foreground" dir="ltr">
                            {c.phone}
                          </div>
                        )}
                        {c.email && (
                          <div
                            className="max-w-full break-all text-sm text-muted-foreground"
                            dir="ltr"
                          >
                            {c.email}
                          </div>
                        )}
                      </div>
                      {address && (
                        <div className="mt-2 text-xs text-muted-foreground">{address}</div>
                      )}
                      {c.notes &&
                        !/(migrated_shopify|(?:^|\|)\s*(?:tags|notes):)/i.test(c.notes) && (
                          <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                            {c.notes}
                          </div>
                        )}

                      <div className="mt-2 flex items-center gap-3 text-xs border-t border-border/50 pt-2 text-muted-foreground">
                        <span>
                          {lang === "ar" ? "الطلبات:" : "Orders:"}{" "}
                          <b className="text-foreground">{stats.totalOrders}</b>
                        </span>
                        <span>•</span>
                        <span>
                          {lang === "ar" ? "الإنفاق:" : "Spend:"}{" "}
                          <b className="text-foreground">
                            {formatMoney(stats.lifetimeSpend, currency)}
                          </b>
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className={cn(
                        "mt-1 h-5 w-5 shrink-0 text-muted-foreground",
                        lang === "ar" && "rotate-180",
                      )}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
          <Card className="hidden overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                  <tr>
                    <th className="p-4 text-start font-semibold text-xs uppercase tracking-wider">
                      {t("customers.name")}
                    </th>
                    <th className="p-4 text-start font-semibold text-xs uppercase tracking-wider">
                      {t("customers.contact")}
                    </th>
                    <th className="p-4 text-center font-semibold text-xs uppercase tracking-wider">
                      {lang === "ar" ? "الطلبات" : "Total Orders"}
                    </th>
                    <th className="p-4 text-center font-semibold text-xs uppercase tracking-wider">
                      {lang === "ar" ? "إجمالي الإنفاق" : "Lifetime Spend"}
                    </th>
                    <th className="p-4 text-center font-semibold text-xs uppercase tracking-wider">
                      {lang === "ar" ? "التصنيف" : "Segment"}
                    </th>
                    <th className="p-4 text-end font-semibold text-xs uppercase tracking-wider">
                      <span className="sr-only">{lang === "ar" ? "الإجراءات" : "Actions"}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCustomers.map((c) => {
                    const stats = customerCrmStats.get(c.id) || {
                      totalOrders: 0,
                      lifetimeSpend: 0,
                      lastOrderDate: null,
                      badge: null,
                    };
                    return (
                      <tr
                        key={c.id}
                        tabIndex={0}
                        className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                        onClick={() =>
                          navigate({
                            to: "/admin/b/$slug/customers/$customerId",
                            params: { slug, customerId: c.id },
                          })
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ")
                            navigate({
                              to: "/admin/b/$slug/customers/$customerId",
                              params: { slug, customerId: c.id },
                            });
                        }}
                      >
                        <td className="p-4 text-start">
                          <p className="font-medium text-foreground">{c.name}</p>
                          {c.notes &&
                            !/(migrated_shopify|(?:^|\|)\s*(?:tags|notes):)/i.test(c.notes) && (
                              <p className="mt-1 max-w-[200px] truncate text-xs text-muted-foreground">
                                {c.notes}
                              </p>
                            )}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          <div
                            className={`flex flex-col ${lang === "ar" ? "items-end" : "items-start"}`}
                          >
                            {c.phone && (
                              <div className="text-xs font-mono" dir="ltr">
                                {c.phone}
                              </div>
                            )}
                            {c.email && (
                              <div
                                className="max-w-[180px] truncate text-xs"
                                dir="ltr"
                                title={c.email}
                              >
                                {c.email}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-center font-medium text-foreground">
                          {stats.totalOrders}
                        </td>
                        <td className="p-4 text-center font-semibold text-foreground">
                          {formatMoney(stats.lifetimeSpend, currency)}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex justify-center items-center">
                            {(() => {
                              if (stats.badge === "VIP") {
                                return (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/60 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                                    <Star className="h-3 w-3 fill-amber-500 stroke-amber-500" />
                                    {lang === "ar" ? "مميز" : "VIP"}
                                  </span>
                                );
                              }
                              if (stats.badge === "Churn Risk") {
                                return (
                                  <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                                    {lang === "ar" ? "راكد" : "Churn Risk"}
                                  </span>
                                );
                              }
                              if (stats.badge === "New Buyer") {
                                return (
                                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                                    {lang === "ar" ? "جديد" : "New Buyer"}
                                  </span>
                                );
                              }
                              return <span className="text-xs text-muted-foreground">—</span>;
                            })()}
                          </div>
                        </td>
                        <td
                          className="p-4 text-end whitespace-nowrap"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <DeleteAction
                            message={t("customers.deleteConfirm")}
                            onConfirm={() => del(c.id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm px-4 py-3 sm:flex-row shadow-sm">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{lang === "ar" ? "صفوف في الصفحة" : "Rows per page"}</span>
              <Select
                value={String(rowsPerPage)}
                onValueChange={(value) => setRowsPerPage(Number(value))}
              >
                <SelectTrigger className="h-8 w-20 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50].map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {count}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {lang === "ar"
                  ? `الصفحة ${safePage} من ${pageCount}`
                  : `Page ${safePage} of ${pageCount}`}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="bg-background/50 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                disabled={safePage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                {lang === "ar" ? "السابق" : "Previous"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-background/50 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                disabled={safePage >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                {lang === "ar" ? "التالي" : "Next"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CustomerDialog({ customer, onSaved }: { customer: Customer | null; onSaved: () => void }) {
  const t = useT();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const brand = useBrand();
  const [f, setF] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    notes: customer?.notes ?? "",
  });

  // For NEW customers we require one initial address inside the dialog.
  const [initialAddr, setInitialAddr] = useState({
    label: "",
    region: "",
    block: "",
    road: "",
    house: "",
    flat: "",
  });

  useEffect(() => {
    setF({
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      notes: customer?.notes ?? "",
    });
    setInitialAddr({ label: "", region: "", block: "", road: "", house: "", flat: "" });
  }, [customer]);

  const addressesQ = useQuery({
    queryKey: ["customer_addresses", customer?.id ?? "new"],
    queryFn: async () => {
      if (!customer) return [] as Address[];
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at");
      if (error) throw error;
      return data as Address[];
    },
    enabled: !!customer,
  });

  const save = async () => {
    if (!f.name.trim()) return toast.error(t("customers.name"));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const normalizedPhone = f.phone.replace(/\D/g, "");
    const normalizedEmail = f.email.trim().toLowerCase();
    if (normalizedPhone || normalizedEmail) {
      const { data: phoneRows, error: phoneError } = await supabase
        .from("customers")
        .select("id, phone, email")
        .eq("brand_id", brand.id);
      if (phoneError) return toast.error(phoneError.message);
      const duplicatePhone =
        normalizedPhone &&
        (phoneRows ?? []).some(
          (row) =>
            row.id !== customer?.id &&
            String(row.phone ?? "").replace(/\D/g, "") === normalizedPhone,
        );
      const duplicateEmail =
        normalizedEmail &&
        (phoneRows ?? []).some(
          (row) =>
            row.id !== customer?.id &&
            String(row.email ?? "")
              .trim()
              .toLowerCase() === normalizedEmail,
        );
      if (duplicatePhone)
        return toast.error(
          lang === "ar"
            ? "رقم الهاتف مرتبط بملف عميل موجود بالفعل."
            : "A customer with this phone number already exists. Open the existing profile instead.",
        );
      if (duplicateEmail)
        return toast.error(
          lang === "ar"
            ? "البريد الإلكتروني مرتبط بملف عميل موجود بالفعل."
            : "A customer with this email already exists. Open the existing profile instead.",
        );
    }

    if (!customer) {
      if (
        !initialAddr.region.trim() ||
        !initialAddr.block.trim() ||
        !initialAddr.road.trim() ||
        !initialAddr.house.trim()
      ) {
        return toast.error(t("customers.requiredError"));
      }
      const composedAddress = [
        initialAddr.block && `Block ${initialAddr.block}`,
        initialAddr.road && `Road ${initialAddr.road}`,
        initialAddr.house && `House ${initialAddr.house}`,
        initialAddr.flat && `Flat ${initialAddr.flat}`,
      ]
        .filter(Boolean)
        .join(" · ");
      const { data: created, error } = await (supabase.from("customers") as any)
        .insert({
          name: f.name.trim(),
          phone: normalizedPhone || null,
          email: normalizedEmail || null,
          notes: f.notes,
          brand_id: brand.id,
          region: initialAddr.region,
          block: initialAddr.block,
          road: initialAddr.road,
          house: initialAddr.house,
          flat: initialAddr.flat || null,
          city: initialAddr.region,
          address: composedAddress,
          user_id: user.id,
        })
        .select("id")
        .single();
      if (error || !created) return toast.error(error?.message ?? "Failed");
      const { error: aerr } = await (supabase.from("customer_addresses") as any).insert({
        user_id: user.id,
        customer_id: created.id,
        label: initialAddr.label || "Primary",
        region: initialAddr.region,
        block: initialAddr.block,
        road: initialAddr.road,
        house: initialAddr.house,
        flat: initialAddr.flat || null,
        is_default: true,
      });
      if (aerr) return toast.error(aerr.message);
    } else {
      const { error } = await supabase
        .from("customers")
        .update({
          name: f.name.trim(),
          phone: normalizedPhone || null,
          email: normalizedEmail || null,
          notes: f.notes,
        })
        .eq("brand_id", brand.id)
        .eq("id", customer.id);
      if (error) return toast.error(error.message);
    }
    toast.success(t("common.save"));
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["customer_addresses"] });
    qc.invalidateQueries({ queryKey: ["order"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
    onSaved();
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{customer ? t("customers.editTitle") : t("customers.newTitle")}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>
            {t("customers.name")} <span className="text-destructive">*</span>
          </Label>
          <Input
            className="text-start"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>{t("customers.phone")}</Label>
            <PhoneInput value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
          </div>
          <div>
            <Label>{t("customers.email")}</Label>
            <Input
              className="text-start"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>{t("customers.notes")}</Label>
          <Textarea
            className="text-start"
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
          />
        </div>

        <div className="pt-3 border-t border-border">
          <h3 className="font-medium mb-2">{t("customers.addresses")}</h3>
          {!customer ? (
            <AddressFields value={initialAddr} onChange={setInitialAddr} lang={lang} />
          ) : (
            <AddressManager
              customerId={customer.id}
              addresses={addressesQ.data ?? []}
              lang={lang}
            />
          )}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save}>{t("common.save")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AddressFields({
  value,
  onChange,
  lang,
  showLabel = true,
}: {
  value: {
    label: string;
    region: string;
    block: string;
    road: string;
    house: string;
    flat: string;
  };
  onChange: (v: {
    label: string;
    region: string;
    block: string;
    road: string;
    house: string;
    flat: string;
  }) => void;
  lang: "en" | "ar";
  showLabel?: boolean;
}) {
  const t = useT();
  return (
    <div className="space-y-3">
      {showLabel && (
        <div>
          <Label>{t("customers.addressLabel")}</Label>
          <Input
            className="text-start"
            value={value.label}
            onChange={(e) => onChange({ ...value, label: e.target.value })}
          />
        </div>
      )}
      <div>
        <Label>
          {t("customers.region")} <span className="text-destructive">*</span>
        </Label>
        <Select value={value.region} onValueChange={(v) => onChange({ ...value, region: v })}>
          <SelectTrigger className="text-start">
            <SelectValue placeholder={t("customers.regionPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {BAHRAIN_REGIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {lang === "ar" ? r.ar : r.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>
            {t("customers.block")} <span className="text-destructive">*</span>
          </Label>
          <Input
            className="text-start"
            placeholder={t("customers.blockPlaceholder")}
            value={value.block}
            onChange={(e) => onChange({ ...value, block: e.target.value })}
          />
        </div>
        <div>
          <Label>
            {t("customers.road")} <span className="text-destructive">*</span>
          </Label>
          <Input
            className="text-start"
            placeholder={t("customers.roadPlaceholder")}
            value={value.road}
            onChange={(e) => onChange({ ...value, road: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>
            {t("customers.house")} <span className="text-destructive">*</span>
          </Label>
          <Input
            className="text-start"
            placeholder={t("customers.housePlaceholder")}
            value={value.house}
            onChange={(e) => onChange({ ...value, house: e.target.value })}
          />
        </div>
        <div>
          <Label>{t("customers.flat")}</Label>
          <Input
            className="text-start"
            placeholder={t("customers.flatPlaceholder")}
            value={value.flat}
            onChange={(e) => onChange({ ...value, flat: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

function AddressManager({
  customerId,
  addresses,
  lang,
}: {
  customerId: string;
  addresses: Address[];
  lang: "en" | "ar";
}) {
  const t = useT();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    label: "",
    region: "",
    block: "",
    road: "",
    house: "",
    flat: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["customer_addresses"] });
    qc.invalidateQueries({ queryKey: ["customer_addresses", customerId] });
    qc.invalidateQueries({ queryKey: ["order"] });
  };

  const setDefault = async (id: string) => {
    await supabase
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("customer_id", customerId);
    const { error } = await supabase
      .from("customer_addresses")
      .update({ is_default: true })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("customers.setDefault"));
    invalidate();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("customer_addresses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const saveDraft = async () => {
    if (!draft.region.trim() || !draft.block.trim() || !draft.road.trim() || !draft.house.trim()) {
      return toast.error(t("customers.requiredError"));
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      user_id: user.id,
      customer_id: customerId,
      label: draft.label || null,
      region: draft.region,
      block: draft.block,
      road: draft.road,
      house: draft.house,
      flat: draft.flat || null,
    };
    let error;
    if (editingId) {
      ({ error } = await supabase.from("customer_addresses").update(payload).eq("id", editingId));
    } else {
      const shouldBeDefault = addresses.length === 0;
      ({ error } = await (supabase.from("customer_addresses") as any).insert({
        ...payload,
        is_default: shouldBeDefault,
      }));
    }
    if (error) return toast.error(error.message);
    setAdding(false);
    setEditingId(null);
    setDraft({ label: "", region: "", block: "", road: "", house: "", flat: "" });
    invalidate();
  };

  const startEdit = (a: Address) => {
    setEditingId(a.id);
    setAdding(true);
    setDraft({
      label: a.label ?? "",
      region: a.region ?? "",
      block: a.block ?? "",
      road: a.road ?? "",
      house: a.house ?? "",
      flat: a.flat ?? "",
    });
  };

  return (
    <div className="space-y-3">
      {addresses.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground italic">{t("customers.noAddresses")}</p>
      )}
      <ul className="space-y-2">
        {addresses.map((a) => (
          <li key={a.id} className="flex items-start gap-2 border border-border rounded-md p-3">
            <div className="flex-1 min-w-0 text-start">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{a.label || t("customers.address")}</p>
                {a.is_default && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                    <Star className="h-3 w-3" /> {t("customers.default")}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatAddressLine(a as StructuredAddress, lang) || "—"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {!a.is_default && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDefault(a.id)}
                  title={t("customers.setDefault")}
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => startEdit(a)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <DeleteAction
                message={t("customers.deleteAddressConfirm")}
                onConfirm={() => remove(a.id)}
              />
            </div>
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="border border-border rounded-md p-3 space-y-3">
          <AddressFields value={draft} onChange={setDraft} lang={lang} />
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(false);
                setEditingId(null);
                setDraft({ label: "", region: "", block: "", road: "", house: "", flat: "" });
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={saveDraft}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 me-1" /> {t("customers.addAddress")}
        </Button>
      )}
    </div>
  );
}
