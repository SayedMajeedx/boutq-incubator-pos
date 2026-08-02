import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Wallet,
  Sparkles,
  Loader2,
  Store as StoreIcon,
  Calendar,
  Clock,
  Receipt,
  Check,
  ChevronsUpDown,
  UploadCloud,
  FileText,
  X,
  Download,
  ChevronDown,
  ChevronRight,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { useI18n, useT } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { cn } from "@/lib/utils";
import { deletePublicMediaUrl, uploadPublicMedia } from "@/lib/r2-upload";

import { ExpensesCommandHeader } from "@/components/expenses/ExpensesCommandHeader";
import { ExpensesScopeSwitcher } from "@/components/expenses/ExpensesScopeSwitcher";
import { ExpensesToolbar } from "@/components/expenses/ExpensesToolbar";
import { ExpensesWorkQueue } from "@/components/expenses/ExpensesWorkQueue";
import { ExpenseMobileCard } from "@/components/expenses/ExpenseMobileCard";

const MAX_SCANNER_REQUEST_BYTES = 2_500_000;

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

async function prepareReceiptForScanning(
  file: File,
): Promise<{ dataUrl: string; mimeType: string }> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_SCANNER_REQUEST_BYTES) throw new Error("PDF_TOO_LARGE");
    return { dataUrl: await fileToDataUrl(file), mimeType: file.type };
  }

  if (!file.type.startsWith("image/")) throw new Error("UNSUPPORTED_FILE");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    let maxDimension = 1800;
    let quality = 0.82;
    let output: Blob | null = null;

    // Camera photos can be 10–30 MB. Resize and progressively compress until
    // the base64 request remains safely below the Worker request body limit.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("IMAGE_PROCESSING_FAILED");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      output = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!output) throw new Error("IMAGE_PROCESSING_FAILED");
      if (output.size <= MAX_SCANNER_REQUEST_BYTES) break;
      maxDimension = Math.round(maxDimension * 0.8);
      quality = Math.max(0.55, quality - 0.08);
    }

    if (!output || output.size > MAX_SCANNER_REQUEST_BYTES) throw new Error("IMAGE_TOO_LARGE");
    return { dataUrl: await fileToDataUrl(output), mimeType: "image/jpeg" };
  } finally {
    bitmap.close();
  }
}
import {
  scanReceipt,
  type ScannedExpense,
  type ScannedLineItem,
} from "@/lib/scan-receipt.functions";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/expenses")({
  beforeLoad: async ({ context: { queryClient }, params }) => {
    const user = await queryClient.ensureQueryData({
      queryKey: ["auth_user"],
      queryFn: async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw redirect({ to: "/auth" });
        return data.user;
      },
      staleTime: 1000 * 60 * 5,
    });

    const profile = await queryClient.ensureQueryData({
      queryKey: ["caller_permissions", user.id],
      queryFn: async () => {
        const { data } = await (supabase as any)
          .from("profiles")
          .select("role, status, email, permissions")
          .eq("id", user.id)
          .maybeSingle();
        return data ?? null;
      },
      staleTime: 1000 * 60 * 5,
    });

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === "majeed@hotmail.it";
    const role = profile?.role;
    const status = profile?.status ?? "active";
    const permissions = (profile?.permissions as string[]) || [];
    const hasFinancials = permissions.includes("view_financials");
    const allowed =
      isFixedSuperAdmin ||
      ((role === "admin" ||
        role === "super_admin" ||
        role === "brand_admin" ||
        (role === "staff" && hasFinancials)) &&
        status === "active");

    if (!allowed) {
      throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: params.slug } });
    }
  },
  component: ExpensesPage,
});

type Expense = {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  currency: string;
  expense_date: string;
  notes: string | null;
  store_name?: string | null;
  receipt_time?: string | null;
  tax_amount?: number | null;
  tax_rate?: number | null;
  line_items?: ScannedLineItem[] | null;
  receipt_url?: string | null;
};

type DatePreset = "today" | "week" | "month" | "custom";

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function presetRange(preset: Exclude<DatePreset, "custom">) {
  const now = new Date();
  if (preset === "today") {
    const today = localDateKey(now);
    return { from: today, to: today };
  }
  if (preset === "week") {
    const monday = new Date(now);
    const weekday = monday.getDay() || 7;
    monday.setDate(monday.getDate() - weekday + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: localDateKey(monday), to: localDateKey(sunday) };
  }
  return {
    from: localDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function ExpensesPage() {
  const t = useT();
  const { lang } = useI18n();
  const locale = lang === "ar" ? "ar-BH-u-nu-latn" : "en-US";
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;

  const q = useQuery({
    queryKey: ["expenses", brandId],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase.from("expenses") as any)
          .select("*")
          .eq("brand_id", brandId)
          .order("expense_date", { ascending: false });
        if (error) {
          console.error("[expenses]", error);
          return [] as Expense[];
        }
        return (data ?? []) as Expense[];
      } catch (err) {
        console.error("[expenses]", err);
        return [] as Expense[];
      }
    },
    retry: false,
  });

  const [editing, setEditing] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scanned, setScanned] = useState<ScannedExpense | null>(null);
  const [scanning, setScanning] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const initialMonth = useMemo(() => presetRange("month"), []);
  const [customRange, setCustomRange] = useState(initialMonth);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scanFn = useServerFn(scanReceipt);

  const rawList = q.data;
  const list = useMemo(() => rawList ?? [], [rawList]);
  const categories = useMemo(() => {
    const canonical = new Map<string, string>();
    list.forEach((expense) => {
      const value = expense.category.trim();
      if (value && !canonical.has(value.toLocaleLowerCase()))
        canonical.set(value.toLocaleLowerCase(), value);
    });
    return [...canonical.values()].sort((a, b) => a.localeCompare(b, locale));
  }, [list, locale]);
  const activeRange = datePreset === "custom" ? customRange : presetRange(datePreset);
  const filteredList = useMemo(
    () =>
      list.filter((expense) => {
        const key = expense.expense_date.slice(0, 10);
        const matchesDate =
          (!activeRange.from || key >= activeRange.from) &&
          (!activeRange.to || key <= activeRange.to);

        const matchesSearch =
          !search ||
          [expense.description, expense.store_name, expense.notes, expense.category].some((field) =>
            String(field ?? "")
              .toLowerCase()
              .includes(search.toLowerCase()),
          );

        const matchesCategory = categoryFilter === "all" || expense.category === categoryFilter;

        return matchesDate && matchesSearch && matchesCategory;
      }),
    [list, activeRange.from, activeRange.to, search, categoryFilter],
  );
  const currency = list[0]?.currency ?? "BHD";
  const total = useMemo(
    () => filteredList.reduce((s, e) => s + Number(e.amount || 0), 0),
    [filteredList],
  );

  const settingsQ = useQuery({
    queryKey: ["expenses-business-settings", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("card_processing_fee, benefit_processing_fee")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      return data ?? { card_processing_fee: 0, benefit_processing_fee: 0 };
    },
  });

  // ── COGS: fetch orders in the active date range and join variant cost_price ──
  const cogsQ = useQuery({
    queryKey: ["cogs", brandId, activeRange.from, activeRange.to],
    queryFn: async () => {
      let q2 = (supabase as any)
        .from("orders")
        .select(
          "id, invoice_number, created_at, currency, total, payment_method, order_items(id, description, quantity, unit_price, line_total, variant_id, product_variants:variant_id(cost_price))",
        )
        .eq("brand_id", brandId)
        .in("status", ["confirmed", "paid", "shipped", "completed"])
        .order("created_at", { ascending: false });
      if (activeRange.from) q2 = q2.gte("created_at", activeRange.from);
      if (activeRange.to) {
        // Include the whole last day
        const endDay = new Date(activeRange.to);
        endDay.setDate(endDay.getDate() + 1);
        q2 = q2.lt("created_at", endDay.toISOString().slice(0, 10));
      }
      const { data, error } = await q2;
      if (error) {
        console.error("[cogs]", error);
        return [];
      }
      return (data ?? []) as CogOrder[];
    },
  });

  const downloadCogsCsv = () => {
    const rows = cogsQ.data ?? [];
    const lines: string[] = [
      lang === "ar"
        ? "التاريخ,رقم الطلب,المنتج,الكمية,تكلفة الوحدة,إجمالي التكلفة"
        : "Date,Order #,Product,Qty,Unit Cost,Total Cost",
    ];
    let grandTotal = 0;
    for (const order of rows) {
      for (const item of order.order_items ?? []) {
        const cost = Number((item as any).product_variants?.cost_price ?? 0);
        const itemTotal = cost * Number(item.quantity);
        grandTotal += itemTotal;
        lines.push(
          [
            new Date(order.created_at).toLocaleDateString(locale),
            `#${order.invoice_number}`,
            `"${(item.description ?? "").replace(/"/g, '""')}"`,
            item.quantity,
            cost.toFixed(3),
            itemTotal.toFixed(3),
          ].join(","),
        );
      }
    }
    lines.push("");
    lines.push(
      lang === "ar"
        ? `,,,,الإجمالي,${grandTotal.toFixed(3)}`
        : `,,,,Total,${grandTotal.toFixed(3)}`,
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const from = activeRange.from || "start";
    const to = activeRange.to || "end";
    a.download = `cogs_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const del = async (id: string) => {
    setDeleting(true);
    try {
      const target = list.find((expense) => expense.id === id);
      const { error } = await (supabase.from("expenses") as any).delete().eq("id", id);
      if (error) toast.error(error.message);
      else {
        toast.success(t("common.delete"));
        setDeleteTargetId(null);
        if (target?.receipt_url)
          void deletePublicMediaUrl(brandId, target.receipt_url).catch(() => undefined);
        await qc.invalidateQueries({ queryKey: ["expenses"] });
      }
    } finally {
      setDeleting(false);
    }
  };

  const onFilePicked = async (file: File | null) => {
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) {
      toast.error(
        lang === "ar" ? "الملف كبير جداً (الحد 40 ميغابايت)" : "File too large (max 40MB)",
      );
      return;
    }
    setScanning(true);
    try {
      const prepared = await prepareReceiptForScanning(file);
      const result = await scanFn({
        data: {
          dataUrl: prepared.dataUrl,
          mimeType: prepared.mimeType,
          targetLang: lang === "ar" ? "ar" : "en",
        },
      });
      setScanned(result);
      setEditing(null);
      setReviewOpen(true);
      toast.success(lang === "ar" ? "تم استخراج بيانات الفاتورة" : "Receipt data extracted");
    } catch (e: any) {
      const msg =
        e?.message === "RATE_LIMITED"
          ? lang === "ar"
            ? "تجاوزت الحد. حاول لاحقاً"
            : "Rate limited, try again"
          : e?.message === "GEMINI_MODEL_UNAVAILABLE"
            ? lang === "ar"
              ? "نموذج الذكاء الاصطناعي غير متاح حالياً"
              : "The AI scanner model is currently unavailable"
            : e?.message === "PDF_TOO_LARGE"
              ? lang === "ar"
                ? "ملف PDF كبير جداً. الحد 2.5 ميغابايت"
                : "PDF is too large (max 2.5MB)"
              : e?.message === "IMAGE_TOO_LARGE" || e?.message === "IMAGE_PROCESSING_FAILED"
                ? lang === "ar"
                  ? "تعذر ضغط الصورة. يرجى التقاط صورة أوضح وأقرب"
                  : "Could not prepare the image. Try a closer, clearer photo"
                : (e?.message ?? (lang === "ar" ? "فشل مسح الفاتورة" : "Failed to scan receipt"));
      toast.error(msg);
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Calculation of Retail Standard Profit & Loss Metrics ──
  const totalRevenue = useMemo(() => {
    return (cogsQ.data ?? []).reduce((s, o) => s + Number(o.total || 0), 0);
  }, [cogsQ.data]);

  const totalCogs = useMemo(() => {
    let sum = 0;
    (cogsQ.data ?? []).forEach((order) => {
      (order.order_items ?? []).forEach((item) => {
        const cost = Number((item as any).product_variants?.cost_price ?? 0);
        sum += cost * Number(item.quantity);
      });
    });
    return sum;
  }, [cogsQ.data]);

  const cardFeePercent = Number((settingsQ.data as any)?.card_processing_fee ?? 0);
  const benefitFeePercent = Number((settingsQ.data as any)?.benefit_processing_fee ?? 0);

  const paymentProcessingFees = useMemo(() => {
    let sum = 0;
    (cogsQ.data ?? []).forEach((o) => {
      const totalVal = Number(o.total || 0);
      if (o.payment_method === "card") {
        sum += totalVal * (cardFeePercent / 100);
      } else if (o.payment_method === "benefit") {
        sum += totalVal * (benefitFeePercent / 100);
      }
    });
    return sum;
  }, [cogsQ.data, cardFeePercent, benefitFeePercent]);

  const totalOpex = total + paymentProcessingFees;
  const netProfit = totalRevenue - (totalCogs + totalOpex);
  const marginPercentage = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-3.5">
      {/* Hidden File Input for Scanner */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => void onFilePicked(e.target.files?.[0] ?? null)}
      />

      {/* 1. Command Header */}
      <ExpensesCommandHeader
        lang={lang === "ar" ? "ar" : "en"}
        expenseCount={filteredList.length}
        scanning={scanning}
        onScanReceipt={() => fileRef.current?.click()}
        onCreateNew={() => {
          setEditing(null);
          setOpen(true);
        }}
      />

      {/* 2. P&L Financial Scope Switcher */}
      <ExpensesScopeSwitcher
        lang={lang === "ar" ? "ar" : "en"}
        currency={currency}
        totalRevenue={totalRevenue}
        totalCogs={totalCogs}
        manualOpex={total}
        processingFees={paymentProcessingFees}
        netProfit={netProfit}
        marginPercentage={marginPercentage}
      />

      {/* 3. Toolbar */}
      <ExpensesToolbar
        lang={lang === "ar" ? "ar" : "en"}
        search={search}
        onSearchChange={setSearch}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        categories={categories}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        activeFilterCount={(search ? 1 : 0) + (categoryFilter !== "all" ? 1 : 0)}
        onClearFilters={() => {
          setSearch("");
          setCategoryFilter("all");
        }}
        onDownloadCogsCsv={downloadCogsCsv}
      />

      {/* 4. Mobile View */}
      <div className="space-y-2.5 block sm:hidden">
        {filteredList.map((e) => (
          <ExpenseMobileCard
            key={e.id}
            lang={lang === "ar" ? "ar" : "en"}
            expense={e}
            currency={currency}
            onEdit={(item) => {
              setEditing(item);
              setOpen(true);
            }}
            onDelete={(id) => setDeleteTargetId(id)}
          />
        ))}
      </div>

      {/* 5. Desktop High-Density Work Queue */}
      <div className="hidden sm:block">
        <ExpensesWorkQueue
          lang={lang === "ar" ? "ar" : "en"}
          expenses={filteredList}
          currency={currency}
          onEdit={(item) => {
            setEditing(item);
            setOpen(true);
          }}
          onDelete={(id) => setDeleteTargetId(id)}
        />
      </div>

      {/* Manual Expense Modal */}
      {open && (
        <ExpenseDialog
          key={editing?.id ?? "new-expense"}
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) setEditing(null);
          }}
          expense={editing}
          categories={categories}
          onSaved={() => {
            setOpen(false);
            void qc.invalidateQueries({ queryKey: ["expenses"] });
          }}
        />
      )}

      {/* AI Scanned Review Dialog */}
      {scanned && (
        <ReceiptReviewDialog
          open={reviewOpen}
          onOpenChange={(v) => {
            setReviewOpen(v);
            if (!v) setScanned(null);
          }}
          scanned={scanned}
          onSaved={() => {
            setReviewOpen(false);
            setScanned(null);
            qc.invalidateQueries({ queryKey: ["expenses"] });
          }}
        />
      )}

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(val) => !val && setDeleteTargetId(null)}>
        <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("expenses.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={() => deleteTargetId && void del(deleteTargetId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin me-2" />
              ) : (
                <Trash2 className="h-4 w-4 me-2" />
              )}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Basic (manual) add/edit dialog
// ============================================================================
function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
  categories: string[];
  onSaved: () => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const brand = useBrand();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category: expense?.category ?? "",
    description: expense?.description ?? "",
    amount: expense ? String(expense.amount) : "0",
    currency: expense?.currency ?? "BHD",
    expense_date: expense?.expense_date ?? new Date().toISOString().slice(0, 10),
    notes: expense?.notes ?? "",
  });

  const chooseReceipt = (file: File | null) => {
    if (!file) return;
    if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
      toast.error(lang === "ar" ? "اختر صورة أو ملف PDF" : "Choose an image or PDF file");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error(
        lang === "ar" ? "حجم الملف يجب ألا يتجاوز 12 ميغابايت" : "File must be 12MB or smaller",
      );
      return;
    }
    setReceiptFile(file);
  };

  const save = async () => {
    if (!form.category.trim()) return toast.error(t("expenses.category"));
    setSaving(true);
    let uploadedUrl: string | null = null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    try {
      if (receiptFile)
        uploadedUrl = await uploadPublicMedia(brand.id, receiptFile, "expense-receipt");
      const normalized = form.category.trim().replace(/\s+/g, " ");
      const category =
        categories.find((item) => item.toLocaleLowerCase() === normalized.toLocaleLowerCase()) ??
        normalized;
      const payload = {
        user_id: user.id,
        brand_id: brand.id,
        category,
        description: form.description.trim() || null,
        amount: Number(form.amount) || 0,
        currency: form.currency,
        expense_date: form.expense_date,
        notes: form.notes.trim() || null,
        receipt_url: uploadedUrl ?? expense?.receipt_url ?? null,
      };
      const { error } = expense
        ? await (supabase.from("expenses") as any).update(payload).eq("id", expense.id)
        : await (supabase.from("expenses") as any).insert(payload);
      if (error) throw error;
      if (uploadedUrl && expense?.receipt_url && uploadedUrl !== expense.receipt_url) {
        void deletePublicMediaUrl(brand.id, expense.receipt_url).catch(() => undefined);
      }
      toast.success(t("common.save"));
      onSaved();
    } catch (error: any) {
      if (uploadedUrl) void deletePublicMediaUrl(brand.id, uploadedUrl).catch(() => undefined);
      toast.error(
        error?.message ?? (lang === "ar" ? "تعذر حفظ المصروف" : "Failed to save expense"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? t("expenses.edit") : t("expenses.add")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("expenses.category")}</Label>
            <CreatableCategorySelect
              value={form.category}
              categories={categories}
              lang={lang}
              onChange={(category) => setForm({ ...form, category })}
            />
          </div>
          <div>
            <Label>{t("expenses.description")}</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("expenses.amount")}</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("expenses.date")}</Label>
              <Input
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>{t("expenses.notes")}</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div>
            <Label>
              {lang === "ar" ? "إرفاق إيصال (اختياري)" : "Upload receipt file (optional)"}
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf"
              onChange={(event) => chooseReceipt(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                chooseReceipt(event.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                "mt-1 flex min-h-28 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-secondary/30",
              )}
            >
              <UploadCloud className="mb-2 h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium">
                {lang === "ar"
                  ? "اسحب الملف هنا أو اضغط للاختيار"
                  : "Drop a file here or click to browse"}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {lang === "ar" ? "صور أو PDF، حتى 12 ميغابايت" : "Images or PDF, up to 12MB"}
              </span>
            </button>
            {(receiptFile || expense?.receipt_url) && (
              <div className="mt-2 flex items-center justify-between rounded-md border bg-secondary/30 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {receiptFile?.name ?? (lang === "ar" ? "الإيصال الحالي" : "Current receipt")}
                  </span>
                </span>
                {receiptFile ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setReceiptFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : (
                  <a
                    href={expense?.receipt_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {lang === "ar" ? "عرض" : "View"}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreatableCategorySelect({
  value,
  categories,
  lang,
  onChange,
}: {
  value: string;
  categories: string[];
  lang: "en" | "ar";
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  const exactMatch = categories.find(
    (category) => category.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase(),
  );
  const select = (category: string) => {
    onChange(category);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="mt-1 w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || (lang === "ar" ? "اختر أو أنشئ فئة" : "Select or create a category")}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={
              lang === "ar" ? "ابحث أو اكتب فئة جديدة..." : "Search or type a new category..."
            }
            dir={lang === "ar" ? "rtl" : "ltr"}
          />
          <CommandList>
            {!categories.length && !normalizedQuery && (
              <CommandEmpty>
                {lang === "ar" ? "لا توجد فئات بعد" : "No categories yet"}
              </CommandEmpty>
            )}
            <CommandGroup heading={lang === "ar" ? "الفئات المستخدمة" : "Existing categories"}>
              {categories
                .filter((category) =>
                  category.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase()),
                )
                .map((category) => (
                  <CommandItem key={category} value={category} onSelect={() => select(category)}>
                    <Check
                      className={cn("h-4 w-4", value === category ? "opacity-100" : "opacity-0")}
                    />{" "}
                    {category}
                  </CommandItem>
                ))}
              {normalizedQuery && !exactMatch && (
                <CommandItem
                  value={`create-${normalizedQuery}`}
                  onSelect={() => select(normalizedQuery)}
                >
                  <Plus className="h-4 w-4" />{" "}
                  {lang === "ar" ? `إنشاء «${normalizedQuery}»` : `Create “${normalizedQuery}”`}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// AI Receipt Review Dialog — professional commercial-receipt layout
// ============================================================================
function ReceiptReviewDialog({
  open,
  onOpenChange,
  scanned,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scanned: ScannedExpense | null;
  onSaved: () => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const locale = lang === "ar" ? "ar-BH-u-nu-latn" : "en-US";
  const brand = useBrand();

  const [form, setForm] = useState<ScannedExpense | null>(scanned);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(scanned);
  }, [scanned]);

  if (!form) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const setF = (patch: Partial<ScannedExpense>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  const setItem = (idx: number, patch: Partial<ScannedLineItem>) => {
    setForm((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((it, i) => {
        if (i !== idx) return it;
        const merged = { ...it, ...patch };
        // Recompute line_total if quantity or unit_price changed
        if (patch.quantity !== undefined || patch.unit_price !== undefined) {
          merged.line_total = Number((merged.quantity * merged.unit_price).toFixed(3));
        }
        return merged;
      });
      return { ...prev, items };
    });
  };

  const addItem = () =>
    setF({ items: [...form.items, { name: "", quantity: 1, unit_price: 0, line_total: 0 }] });
  const removeItem = (idx: number) => setF({ items: form.items.filter((_, i) => i !== idx) });

  const computedSubtotal = form.items.reduce((s, i) => s + Number(i.line_total || 0), 0);
  const subtotal = form.subtotal || computedSubtotal;
  const grand = Number(form.amount) || subtotal + Number(form.tax_amount || 0);

  const save = async () => {
    if (!form.category.trim())
      return toast.error(lang === "ar" ? "الفئة مطلوبة" : "Category required");
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const payload = {
        user_id: user.id,
        brand_id: brand.id,
        category: form.category.trim(),
        description: form.description.trim() || null,
        amount: Number(grand) || 0,
        currency: form.currency,
        expense_date: form.expense_date,
        notes: form.notes.trim() || null,
        store_name: form.store_name.trim() || null,
        receipt_time: form.receipt_time || null,
        tax_amount: Number(form.tax_amount) || 0,
        tax_rate: Number(form.tax_rate) || 0,
        line_items: form.items,
      };
      const { error } = await (supabase.from("expenses") as any).insert(payload);
      if (error) throw error;
      toast.success(t("common.save"));
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            {lang === "ar" ? "مراجعة الفاتورة الممسوحة" : "Review scanned receipt"}
            <Badge variant="secondary" className="gap-1 ms-2">
              <Sparkles className="h-3 w-3" />
              {lang === "ar" ? "مستخرج بالذكاء الاصطناعي" : "AI extracted"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Header block: store, date, time */}
        <div className="rounded-lg border bg-secondary/30 p-4 space-y-3">
          <div>
            <Label className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
              <StoreIcon className="h-3.5 w-3.5" />
              {lang === "ar" ? "اسم المتجر" : "Store name"}
            </Label>
            <Input
              value={form.store_name}
              onChange={(e) => setF({ store_name: e.target.value })}
              className="text-base font-semibold"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
                <Calendar className="h-3.5 w-3.5" />
                {lang === "ar" ? "التاريخ" : "Date"}
              </Label>
              <Input
                type="date"
                value={form.expense_date}
                onChange={(e) => setF({ expense_date: e.target.value })}
              />
            </div>
            <div>
              <Label className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
                <Clock className="h-3.5 w-3.5" />
                {lang === "ar" ? "الوقت" : "Time"}
              </Label>
              <Input
                type="time"
                value={form.receipt_time}
                onChange={(e) => setF({ receipt_time: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">
              {lang === "ar" ? `المنتجات (${form.items.length})` : `Items (${form.items.length})`}
            </h3>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-3.5 w-3.5 me-1" />
              {lang === "ar" ? "إضافة بند" : "Add item"}
            </Button>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-[1fr_70px_100px_100px_36px] gap-2 px-3 py-2 bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <div>{lang === "ar" ? "المنتج" : "Item"}</div>
              <div className="text-center">{lang === "ar" ? "الكمية" : "Qty"}</div>
              <div className="text-end">{lang === "ar" ? "سعر الوحدة" : "Unit price"}</div>
              <div className="text-end">{lang === "ar" ? "الإجمالي" : "Total"}</div>
              <div />
            </div>
            {form.items.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {lang === "ar"
                  ? "لا توجد بنود مستخرجة. أضف يدوياً."
                  : "No items extracted. Add manually."}
              </div>
            ) : (
              form.items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_70px_100px_100px_36px] gap-2 px-3 py-2 border-t items-center"
                >
                  <Input
                    value={it.name}
                    onChange={(e) => setItem(idx, { name: e.target.value })}
                    className="h-9"
                  />
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={it.quantity}
                    onChange={(e) => setItem(idx, { quantity: Number(e.target.value) || 0 })}
                    className="h-9 text-center"
                  />
                  <Input
                    type="number"
                    min={0}
                    step={0.001}
                    value={it.unit_price}
                    onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) || 0 })}
                    className="h-9 text-end"
                  />
                  <div className="text-end text-sm font-medium tabular-nums">
                    {formatMoney(it.line_total, form.currency, locale)}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => removeItem(idx)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Totals block — commercial receipt style */}
        <div className="mt-4 rounded-lg border p-4 bg-secondary/20">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{lang === "ar" ? "العملة" : "Currency"}</Label>
              <Input
                value={form.currency}
                onChange={(e) => setF({ currency: e.target.value.toUpperCase().slice(0, 3) })}
              />
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "الفئة" : "Category"}</Label>
              <Input value={form.category} onChange={(e) => setF({ category: e.target.value })} />
            </div>
          </div>

          <Separator className="my-4" />

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {lang === "ar" ? "المجموع الفرعي" : "Subtotal"}
              </span>
              <span className="tabular-nums">{formatMoney(subtotal, form.currency, locale)}</span>
            </div>

            <div className="grid grid-cols-[1fr_90px_1fr] gap-2 items-center">
              <span className="text-muted-foreground">
                {lang === "ar" ? "الضريبة / VAT" : "Tax / VAT"}
              </span>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={form.tax_rate}
                  onChange={(e) => setF({ tax_rate: Number(e.target.value) || 0 })}
                  className="h-8 text-end"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <Input
                type="number"
                min={0}
                step={0.001}
                value={form.tax_amount}
                onChange={(e) => setF({ tax_amount: Number(e.target.value) || 0 })}
                className="h-8 text-end"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between text-base font-bold pt-1">
              <span>{lang === "ar" ? "الإجمالي النهائي" : "Grand Total"}</span>
              <Input
                type="number"
                min={0}
                step={0.001}
                value={form.amount}
                onChange={(e) => setF({ amount: Number(e.target.value) || 0 })}
                className="h-10 w-40 text-end text-base font-bold"
              />
            </div>
          </div>
        </div>

        {/* Description + notes */}
        <div className="mt-4 grid gap-3">
          <div>
            <Label>{lang === "ar" ? "الوصف" : "Description"}</Label>
            <Input
              value={form.description}
              onChange={(e) => setF({ description: e.target.value })}
            />
          </div>
          <div>
            <Label>{lang === "ar" ? "ملاحظات" : "Notes"}</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setF({ notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {lang === "ar" ? "حفظ المصروف" : "Save expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Types for COGS
// ============================================================================
type CogItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  variant_id: string | null;
  product_variants?: { cost_price: number } | null;
};
type CogOrder = {
  id: string;
  invoice_number: number;
  created_at: string;
  currency: string;
  total: number;
  payment_method: string | null;
  order_items: CogItem[];
};

// ============================================================================
// COGS Section Component
// ============================================================================
function CogsSection({
  orders,
  loading,
  currency,
  locale,
  lang,
  onDownload,
}: {
  orders: CogOrder[];
  loading: boolean;
  currency: string;
  locale: string;
  lang: "en" | "ar";
  onDownload: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const { totalCogs, ordersWithCogs } = useMemo(() => {
    let totalCogs = 0;
    const ordersWithCogs = orders
      .map((order) => {
        const items = (order.order_items ?? []).map((item) => {
          const cost = Number(item.product_variants?.cost_price ?? 0);
          const itemCogs = cost * Number(item.quantity);
          return { ...item, cost, itemCogs };
        });
        const orderCogs = items.reduce((s, i) => s + i.itemCogs, 0);
        totalCogs += orderCogs;
        return { ...order, items, orderCogs };
      })
      .filter((o) => o.orderCogs > 0);
    return { totalCogs, ordersWithCogs };
  }, [orders]);

  const hasCogs = ordersWithCogs.length > 0;

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex items-center justify-between p-4 sm:p-5">
        <button
          type="button"
          className="flex items-center gap-2 text-start flex-1"
          onClick={() => setExpanded((v) => !v)}
        >
          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-semibold">
              {lang === "ar" ? "تكلفة البضاعة المباعة (COGS)" : "Cost of Goods Sold (COGS)"}
            </p>
            <p className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "محسوبة تلقائياً من تكلفة المتغيرات في الطلبات المكتملة"
                : "Auto-calculated from variant cost prices of completed orders"}
            </p>
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 ms-auto text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 ms-auto text-muted-foreground" />
          )}
        </button>
        <div className="flex items-center gap-3 ms-4">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-xl font-display tabular-nums">
              {formatMoney(totalCogs, currency, locale)}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasCogs}
            onClick={onDownload}
            className="shrink-0"
          >
            <Download className="h-3.5 w-3.5 me-1.5" />
            {lang === "ar" ? "تنزيل CSV" : "Download CSV"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t">
          {!hasCogs && !loading && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {lang === "ar"
                ? "لا توجد بيانات تكلفة للطلبات في هذه الفترة. تأكد من إدخال تكلفة المتغيرات في المخزون."
                : "No cost data found for orders in this period. Make sure variant cost prices are set in Inventory."}
            </p>
          )}
          {ordersWithCogs.map((order) => (
            <div key={order.id} className="border-b last:border-b-0">
              <div className="flex items-center justify-between px-4 py-2 bg-secondary/30">
                <span className="text-xs font-semibold text-muted-foreground">
                  #{order.invoice_number} &nbsp;·&nbsp;{" "}
                  {new Date(order.created_at).toLocaleDateString(locale)}
                </span>
                <span className="text-xs font-bold tabular-nums">
                  {formatMoney(order.orderCogs, order.currency, locale)}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-1.5 text-start font-medium">
                      {lang === "ar" ? "المنتج" : "Product"}
                    </th>
                    <th className="px-4 py-1.5 text-center font-medium">
                      {lang === "ar" ? "الكمية" : "Qty"}
                    </th>
                    <th className="px-4 py-1.5 text-end font-medium">
                      {lang === "ar" ? "تكلفة الوحدة" : "Unit cost"}
                    </th>
                    <th className="px-4 py-1.5 text-end font-medium">
                      {lang === "ar" ? "إجمالي التكلفة" : "Total cost"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {order.items
                    .filter((i) => i.itemCogs > 0)
                    .map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-4 py-2 max-w-[200px] truncate">{item.description}</td>
                        <td className="px-4 py-2 text-center tabular-nums">{item.quantity}</td>
                        <td className="px-4 py-2 text-end tabular-nums">
                          {formatMoney(item.cost, currency, locale)}
                        </td>
                        <td className="px-4 py-2 text-end tabular-nums font-medium">
                          {formatMoney(item.itemCogs, currency, locale)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
          {hasCogs && (
            <div className="flex justify-between items-center px-4 py-3 bg-secondary/20 font-bold text-sm">
              <span>{lang === "ar" ? "إجمالي تكلفة البضاعة" : "Total COGS"}</span>
              <span className="tabular-nums">{formatMoney(totalCogs, currency, locale)}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
