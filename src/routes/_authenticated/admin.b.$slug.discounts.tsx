import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  Pencil,
  Plus,
  Trash2,
  Tags,
  Calendar,
  BarChart3,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";

import { DiscountsCommandHeader } from "@/components/discounts/DiscountsCommandHeader";
import {
  DiscountsScopeSwitcher,
  type DiscountStatusTab,
} from "@/components/discounts/DiscountsScopeSwitcher";
import { DiscountsToolbar } from "@/components/discounts/DiscountsToolbar";
import { DiscountsWorkQueue } from "@/components/discounts/DiscountsWorkQueue";
import { DiscountMobileCard } from "@/components/discounts/DiscountMobileCard";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/discounts")({
  component: DiscountCodes,
});

type Promo = {
  id: string;
  brand_id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  minimum_order_amount: number | null;
  maximum_discount_amount: number | null;
  first_time_customers_only: boolean;
  exclude_sale_items: boolean;
  usage_limit_per_customer: number | null;
  is_active: boolean;
  created_at: string;
  exclude_low_margin: boolean;
  margin_threshold: number;
  start_date: string | null;
  end_date: string | null;
  max_redemptions: number | null;
};

type PromoForm = Omit<Promo, "id" | "brand_id" | "created_at">;

const EMPTY: PromoForm = {
  code: "",
  discount_type: "percentage",
  discount_value: 0,
  minimum_order_amount: null,
  maximum_discount_amount: null,
  first_time_customers_only: false,
  exclude_sale_items: false,
  usage_limit_per_customer: null,
  is_active: true,
  exclude_low_margin: false,
  margin_threshold: 20,
  start_date: null,
  end_date: null,
  max_redemptions: null,
};

// Converts ISO date to local input string YYYY-MM-DDThh:mm
const toLocalInputString = (isoString: string | null | undefined) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
};

// Converts local input string back to ISO
const toISOString = (localString: string | null | undefined) => {
  if (!localString) return null;
  const d = new Date(localString);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
};

function DiscountCodes() {
  const brand = useBrand();
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [form, setForm] = useState<PromoForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [showMarginWarning, setShowMarginWarning] = useState(false);

  // Filter tabs state: 'all' | 'active' | 'scheduled' | 'expired'
  const [activeTab, setActiveTab] = useState<DiscountStatusTab>("all");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const settingsQ = useQuery({
    queryKey: ["business-settings-currency", brand.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("currency")
        .eq("brand_id", brand.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? { currency: "BHD" };
    },
  });
  const currency = settingsQ.data?.currency ?? "BHD";

  const getCurrencyPrecision = (curr: string) => {
    const c = (curr || "").toUpperCase();
    if (["BHD", "KWD", "OMR", "JOD"].includes(c)) return 3;
    if (["JPY"].includes(c)) return 0;
    return 2;
  };

  const promos = useQuery({
    queryKey: ["promo-codes", brand.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promo_codes")
        .select(
          "id,brand_id,code,discount_type,discount_value,minimum_order_amount,maximum_discount_amount,first_time_customers_only,exclude_sale_items,usage_limit_per_customer,is_active,created_at,exclude_low_margin,margin_threshold,start_date,end_date,max_redemptions",
        )
        .eq("brand_id", brand.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Promo[];
    },
  });

  // Client-side analytics aggregation to show redemption counts and revenue driven
  const analyticsQ = useQuery({
    queryKey: ["discounts-analytics", brand.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("promo_code_id, total, status")
        .eq("brand_id", brand.id)
        .not("promo_code_id", "is", null);
      if (error) throw error;

      const usageMap: Record<string, { count: number; revenue: number }> = {};
      (data ?? []).forEach((o: any) => {
        if (!o.promo_code_id) return;
        const status = String(o.status || "").toLowerCase();
        if (["cancelled", "draft"].includes(status)) return;

        if (!usageMap[o.promo_code_id]) {
          usageMap[o.promo_code_id] = { count: 0, revenue: 0 };
        }
        usageMap[o.promo_code_id].count += 1;
        usageMap[o.promo_code_id].revenue += Number(o.total || 0);
      });
      return usageMap;
    },
  });

  const variantsQ = useQuery({
    queryKey: ["discounts-product-variants", brand.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, selling_price, cost_price")
        .eq("brand_id", brand.id);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; selling_price: number; cost_price: number }>;
    },
  });

  // Debounced real-time profit margin evaluation to protect bottom-line during typing
  useEffect(() => {
    if (form.discount_type !== "percentage" || !form.discount_value) {
      setShowMarginWarning(false);
      return;
    }
    const timer = setTimeout(() => {
      const variantsList = variantsQ.data ?? [];
      const val = Number(form.discount_value);
      if (isNaN(val) || val <= 0 || val > 100) {
        setShowMarginWarning(false);
        return;
      }
      const hasLowMargin = variantsList.some((v) => {
        const sell = Number(v.selling_price || 0);
        const cost = Number(v.cost_price || 0);
        if (sell <= 0 || cost <= 0) return false;
        const discountedSelling = sell * (1 - val / 100);
        if (discountedSelling <= 0) return true;
        const margin = ((discountedSelling - cost) / discountedSelling) * 100;
        return margin < 15;
      });
      setShowMarginWarning(hasLowMargin);
    }, 200);

    return () => clearTimeout(timer);
  }, [form.discount_type, form.discount_value, variantsQ.data]);

  const beginCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const beginEdit = (p: Promo) => {
    setEditing(p);
    setForm({
      code: p.code,
      discount_type: p.discount_type,
      discount_value: p.discount_value,
      minimum_order_amount: p.minimum_order_amount,
      maximum_discount_amount: p.maximum_discount_amount,
      first_time_customers_only: p.first_time_customers_only,
      exclude_sale_items: p.exclude_sale_items,
      usage_limit_per_customer: p.usage_limit_per_customer,
      is_active: p.is_active,
      exclude_low_margin: p.exclude_low_margin ?? false,
      margin_threshold: p.margin_threshold ?? 20,
      start_date: p.start_date,
      end_date: p.end_date,
      max_redemptions: p.max_redemptions,
    });
    setOpen(true);
  };

  const toggleActive = async (p: Promo) => {
    const nextActive = !p.is_active;

    // Optimistically update query data
    qc.setQueryData(["promo-codes", brand.id], (old: Promo[] | undefined) => {
      if (!old) return old;
      return old.map((item) => (item.id === p.id ? { ...item, is_active: nextActive } : item));
    });

    toast.success(
      ar
        ? `رمز الخصم ${p.code} ${nextActive ? "تم تفعيله" : "تم إيقافه"} بنجاح!`
        : `Promo code ${p.code} ${nextActive ? "activated" : "paused"} successfully!`,
    );

    try {
      const { error } = await supabase
        .from("promo_codes")
        .update({ is_active: nextActive })
        .eq("id", p.id)
        .eq("brand_id", brand.id);

      if (error) throw error;
    } catch (err: any) {
      // Revert cache on error
      qc.setQueryData(["promo-codes", brand.id], (old: Promo[] | undefined) => {
        if (!old) return old;
        return old.map((item) => (item.id === p.id ? { ...item, is_active: !nextActive } : item));
      });
      toast.error(
        ar ? `فشل في تحديث حالة الرمز: ${err.message}` : `Failed to update status: ${err.message}`,
      );
    } finally {
      qc.invalidateQueries({ queryKey: ["promo-codes", brand.id] });
    }
  };

  const save = async () => {
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
      return toast.error(
        ar
          ? "استخدم حروفاً وأرقاماً فقط (2–32)"
          : "Use 2–32 letters, numbers, hyphens, or underscores",
      );
    }
    if (
      !(form.discount_value > 0) ||
      (form.discount_type === "percentage" && form.discount_value > 100)
    ) {
      return toast.error(ar ? "قيمة الخصم غير صحيحة" : "Enter a valid discount value");
    }
    if (form.maximum_discount_amount != null && form.maximum_discount_amount <= 0) {
      return toast.error(
        ar
          ? "يجب أن يكون الحد الأقصى للخصم أكبر من صفر"
          : "Maximum discount must be greater than zero",
      );
    }
    if (
      form.usage_limit_per_customer != null &&
      (!Number.isInteger(form.usage_limit_per_customer) || form.usage_limit_per_customer < 1)
    ) {
      return toast.error(
        ar
          ? "حد الاستخدام يجب أن يكون رقماً صحيحاً موجباً"
          : "Usage limit must be a positive whole number",
      );
    }
    if (
      form.max_redemptions != null &&
      (!Number.isInteger(form.max_redemptions) || form.max_redemptions < 1)
    ) {
      return toast.error(
        ar
          ? "الحد الأقصى لمرات الاستخدام الإجمالي يجب أن يكون رقماً صحيحاً موجباً"
          : "Total redemption limit must be a positive whole number",
      );
    }
    if (form.start_date && form.end_date && new Date(form.end_date) <= new Date(form.start_date)) {
      return toast.error(
        ar
          ? "يجب أن يكون تاريخ الانتهاء بعد تاريخ البدء"
          : "End date must be scheduled after the start date",
      );
    }

    setSaving(true);
    const payload = {
      ...form,
      code,
      brand_id: brand.id,
      discount_value: Number(form.discount_value.toFixed(3)),
      minimum_order_amount:
        form.minimum_order_amount == null ? null : Number(form.minimum_order_amount.toFixed(3)),
      maximum_discount_amount:
        form.discount_type === "percentage" && form.maximum_discount_amount != null
          ? Number(form.maximum_discount_amount.toFixed(3))
          : null,
      margin_threshold: Number(form.margin_threshold),
      updated_at: new Date().toISOString(),
    };

    const query = editing
      ? supabase.from("promo_codes").update(payload).eq("id", editing.id).eq("brand_id", brand.id)
      : supabase.from("promo_codes").insert(payload);

    const { error } = await query;
    setSaving(false);
    if (error) {
      return toast.error(
        error.code === "23505"
          ? ar
            ? "هذا الرمز موجود بالفعل"
            : "This code already exists"
          : error.message,
      );
    }
    toast.success(ar ? "تم حفظ رمز الخصم" : "Promo code saved");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["promo-codes", brand.id] });
  };

  const remove = async (p: Promo) => {
    if (!confirm(ar ? `حذف الرمز ${p.code}؟` : `Delete ${p.code}?`)) return;
    const { error } = await supabase
      .from("promo_codes")
      .delete()
      .eq("id", p.id)
      .eq("brand_id", brand.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["promo-codes", brand.id] });
  };

  // Pre-calculate filter tabs counts
  const now = new Date();
  const allList = promos.data ?? [];
  const activeCount = allList.filter((p) => {
    const isStarted = !p.start_date || new Date(p.start_date) <= now;
    const isExpired = p.end_date && new Date(p.end_date) < now;
    const usage = analyticsQ.data?.[p.id]?.count || 0;
    const isCapReached = p.max_redemptions != null && usage >= p.max_redemptions;
    return p.is_active && isStarted && !isExpired && !isCapReached;
  }).length;

  const scheduledCount = allList.filter((p) => {
    const isStarted = !p.start_date || new Date(p.start_date) <= now;
    const isExpired = p.end_date && new Date(p.end_date) < now;
    return p.is_active && !isStarted && !isExpired;
  }).length;

  const expiredCount = allList.filter((p) => {
    const isExpired = p.end_date && new Date(p.end_date) < now;
    const usage = analyticsQ.data?.[p.id]?.count || 0;
    const isCapReached = p.max_redemptions != null && usage >= p.max_redemptions;
    return isExpired || isCapReached;
  }).length;

  // Filter list based on selected tab and search/type
  const displayedPromos = allList.filter((p) => {
    const isStarted = !p.start_date || new Date(p.start_date) <= now;
    const isExpired = p.end_date && new Date(p.end_date) < now;
    const usage = analyticsQ.data?.[p.id]?.count || 0;
    const isCapReached = p.max_redemptions != null && usage >= p.max_redemptions;

    let matchesTab = true;
    if (activeTab === "active")
      matchesTab = p.is_active && isStarted && !isExpired && !isCapReached;
    else if (activeTab === "scheduled") matchesTab = p.is_active && !isStarted && !isExpired;
    else if (activeTab === "expired") matchesTab = isExpired || isCapReached;

    const matchesSearch = !search || p.code.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || p.discount_type === typeFilter;

    return matchesTab && matchesSearch && matchesType;
  });

  return (
    <div className="space-y-3.5">
      {/* 1. Command Header */}
      <DiscountsCommandHeader
        lang={ar ? "ar" : "en"}
        promoCount={allList.length}
        onCreateNew={beginCreate}
      />

      {/* 2. Scope Switcher Tabs */}
      <DiscountsScopeSwitcher
        lang={ar ? "ar" : "en"}
        currentTab={activeTab}
        onTabChange={setActiveTab}
        counts={{
          all: allList.length,
          active: activeCount,
          scheduled: scheduledCount,
          expired: expiredCount,
        }}
      />

      {/* 3. Toolbar */}
      <DiscountsToolbar
        lang={ar ? "ar" : "en"}
        search={search}
        onSearchChange={setSearch}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        activeFilterCount={(search ? 1 : 0) + (typeFilter !== "all" ? 1 : 0)}
        onClearFilters={() => {
          setSearch("");
          setTypeFilter("all");
        }}
      />

      {/* 4. Mobile View */}
      <div className="space-y-2.5 block sm:hidden">
        {displayedPromos.map((p) => (
          <DiscountMobileCard
            key={p.id}
            lang={ar ? "ar" : "en"}
            promo={p}
            currency={currency}
            analyticsData={analyticsQ.data}
            onEdit={beginEdit}
            onToggleActive={toggleActive}
            onDelete={remove}
          />
        ))}
      </div>

      {/* 5. Desktop Work Queue */}
      <div className="hidden sm:block">
        <DiscountsWorkQueue
          lang={ar ? "ar" : "en"}
          promos={displayedPromos}
          currency={currency}
          analyticsData={analyticsQ.data}
          onEdit={beginEdit}
          onToggleActive={toggleActive}
          onDelete={remove}
        />
      </div>

      {/* Editor Modal Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-xl rounded-2xl p-6"
          dir={ar ? "rtl" : "ltr"}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight border-b pb-3 flex items-center gap-2">
              <Tags className="h-5 w-5 text-primary" />
              {editing
                ? ar
                  ? "تعديل رمز الخصم"
                  : "Edit Promo Code"
                : ar
                  ? "إنشاء رمز خصم جديد"
                  : "Create Promo Code"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Promo Code Name */}
            <div className="space-y-1.5">
              <Label className="font-semibold text-sm">
                {ar ? "اسم الرمز (الكود)" : "Promo Code"}
              </Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="SAVE20"
                className="uppercase font-mono font-bold tracking-widest h-11 text-base placeholder:tracking-normal placeholder:font-sans"
                maxLength={32}
              />
            </div>

            {/* Discount Type Selector */}
            <div className="space-y-1.5">
              <Label className="font-semibold text-sm">{ar ? "نوع الخصم" : "Discount Type"}</Label>
              <Select
                value={form.discount_type}
                onValueChange={(v: "percentage" | "fixed") =>
                  setForm({
                    ...form,
                    discount_type: v,
                    maximum_discount_amount:
                      v === "percentage" ? form.maximum_discount_amount : null,
                  })
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">{ar ? "نسبة مئوية %" : "Percentage %"}</SelectItem>
                  <SelectItem value="fixed">
                    {ar ? `مبلغ ثابت (${currency})` : `Fixed Amount (${currency})`}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Discount Value */}
            <div className="space-y-1.5">
              <Label className="font-semibold text-sm">
                {ar ? "قيمة الخصم" : "Discount Value"}
              </Label>
              <Input
                type="number"
                min="0"
                max={form.discount_type === "percentage" ? 100 : undefined}
                step={
                  form.discount_type === "fixed"
                    ? getCurrencyPrecision(currency) === 3
                      ? "0.001"
                      : "0.01"
                    : "0.01"
                }
                value={form.discount_value || ""}
                onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
                className="h-11 font-mono font-semibold"
              />
              {showMarginWarning && (
                <div className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50 p-2.5 text-xs font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400 flex items-center gap-1.5 animate-pulse">
                  <span>
                    ⚠️{" "}
                    {ar
                      ? "هذه القيمة تقلل هامش الربح لبعض المنتجات عن 15%."
                      : "This value cuts into profit margins for certain collections."}
                  </span>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1 px-1">
                {form.discount_type === "fixed"
                  ? ar
                    ? `يُحفظ بـ ${getCurrencyPrecision(currency)} خانات عشرية.`
                    : `Saved with ${getCurrencyPrecision(currency)} decimal places.`
                  : ar
                    ? "من 1 إلى 100%"
                    : "Enter a percentage value from 1 to 100%"}
              </p>
            </div>

            {/* Minimum Order Limit */}
            <div className="space-y-1.5">
              <Label className="font-semibold text-sm">
                {ar
                  ? `الحد الأدنى للطلب (${currency}) (اختياري)`
                  : `Minimum Order Subtotal (${currency}) (Optional)`}
              </Label>
              <Input
                type="number"
                min="0"
                step={getCurrencyPrecision(currency) === 3 ? "0.001" : "0.01"}
                value={form.minimum_order_amount ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    minimum_order_amount: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder={getCurrencyPrecision(currency) === 3 ? "0.000" : "0.00"}
                className="h-11 font-mono"
              />
            </div>

            {/* Maximum Discount limit (For Percentage Type) */}
            {form.discount_type === "percentage" && (
              <div className="space-y-3 rounded-xl border p-4 bg-muted/20">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-sm text-foreground">
                      {ar ? "تحديد حد أقصى للخصم" : "Set maximum discount limit"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {ar
                        ? "يمنع الخصم النسبي من تجاوز مبلغ محدد."
                        : "Prevent a percentage discount from exceeding a fixed amount."}
                    </div>
                  </div>
                  <Switch
                    checked={form.maximum_discount_amount != null}
                    onCheckedChange={(v) =>
                      setForm({ ...form, maximum_discount_amount: v ? 1.0 : null })
                    }
                  />
                </div>
                {form.maximum_discount_amount != null && (
                  <div className="space-y-1.5 animate-slide-down">
                    <Label className="text-xs font-semibold">
                      {ar
                        ? `الحد الأقصى للخصم (${currency})`
                        : `Max Allowed Discount (${currency})`}
                    </Label>
                    <Input
                      type="number"
                      min="0.01"
                      step={getCurrencyPrecision(currency) === 3 ? "0.001" : "0.01"}
                      value={form.maximum_discount_amount}
                      onChange={(e) =>
                        setForm({ ...form, maximum_discount_amount: Number(e.target.value) })
                      }
                      placeholder={getCurrencyPrecision(currency) === 3 ? "0.000" : "0.00"}
                      className="h-10 font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Active Scheduling section */}
            <div className="space-y-4 rounded-xl border p-4 bg-muted/20">
              <div className="flex items-center gap-2 border-b pb-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="font-bold text-sm text-foreground">
                  {ar ? "الجدولة والمدة الزمنية" : "Scheduling & Expiration"}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    {ar ? "تاريخ البدء (اختياري)" : "Start Date (Optional)"}
                  </Label>
                  <Input
                    type="datetime-local"
                    value={toLocalInputString(form.start_date)}
                    onChange={(e) => setForm({ ...form, start_date: toISOString(e.target.value) })}
                    className="h-10 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    {ar ? "تاريخ الانتهاء (اختياري)" : "End Date (Optional)"}
                  </Label>
                  <Input
                    type="datetime-local"
                    value={toLocalInputString(form.end_date)}
                    onChange={(e) => setForm({ ...form, end_date: toISOString(e.target.value) })}
                    className="h-10 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Global Redemption limits section */}
            <div className="space-y-1.5">
              <Label className="font-semibold text-sm">
                {ar
                  ? "الحد الأقصى للإستخدام الإجمالي للرمز (اختياري)"
                  : "Global Redemption Limit (Optional)"}
              </Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={form.max_redemptions ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    max_redemptions: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder={ar ? "مثال: 500 مرة" : "e.g. 100 redemptions"}
                className="h-11 font-mono"
              />
              <p className="text-[11px] text-muted-foreground px-1">
                {ar
                  ? "يعطل الرمز تلقائياً بعد استخدامه بالكامل في الطلبيات."
                  : "Automatically pauses the code globally once the redemptions cap is met."}
              </p>
            </div>

            {/* Eligibility Constraints Section */}
            <div className="space-y-3.5 rounded-xl border p-4 bg-muted/10">
              <div>
                <div className="font-bold text-sm text-foreground">
                  {ar ? "شروط الأهلية والحماية" : "Eligibility & Safeguards"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {ar
                    ? "حدد شروط الحماية وهوامش الربح للرمز."
                    : "Configure target audience exclusions and margin protection rules."}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-4">
                  <Label className="font-normal text-xs text-muted-foreground">
                    {ar ? "للعملاء الجدد فقط" : "First-time customers only"}
                  </Label>
                  <Switch
                    checked={form.first_time_customers_only}
                    onCheckedChange={(v) => setForm({ ...form, first_time_customers_only: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Label className="font-normal text-xs text-muted-foreground">
                    {ar ? "استبعاد المنتجات المخفضة مسبقاً" : "Exclude items already on sale"}
                  </Label>
                  <Switch
                    checked={form.exclude_sale_items}
                    onCheckedChange={(v) => setForm({ ...form, exclude_sale_items: v })}
                  />
                </div>

                {/* Margin Threshold Safeguard */}
                <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-border/40">
                  <Label className="font-normal text-xs text-muted-foreground">
                    {ar
                      ? "استبعاد المنتجات تلقائياً إذا انخفض هامش الربح"
                      : "Exclude products if margin falls below floor threshold"}
                  </Label>
                  <Switch
                    checked={form.exclude_low_margin}
                    onCheckedChange={(v) => setForm({ ...form, exclude_low_margin: v })}
                  />
                </div>
                {form.exclude_low_margin && (
                  <div className="mt-2 flex items-center gap-3 rounded-lg bg-secondary/30 p-2.5 border border-border/40 animate-slide-down justify-between">
                    <Label className="text-xs font-semibold">
                      {ar ? "الحد الأدنى لهامش الربح (%)" : "Margin floor threshold (%)"}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      className="h-8 w-24 text-center text-xs font-mono font-bold bg-background"
                      value={form.margin_threshold}
                      onChange={(e) =>
                        setForm({ ...form, margin_threshold: Number(e.target.value) })
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Usage limit per customer */}
            <div className="space-y-1.5">
              <Label className="font-semibold text-sm">
                {ar
                  ? "حد الاستخدام لكل عميل فردي (اختياري)"
                  : "Usage limit per individual customer (Optional)"}
              </Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={form.usage_limit_per_customer ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    usage_limit_per_customer: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder={ar ? "مثال: 1" : "e.g. 1 use per client"}
                className="h-11 font-mono"
              />
            </div>

            {/* Active Status switch */}
            <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/20">
              <div>
                <div className="font-bold text-sm text-foreground">
                  {ar ? "نشط ومتاح للاستخدام" : "Set Active"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {ar
                    ? "يمكن للمتسوقين تطبيق هذا الرمز فور تفعيله."
                    : "Allow users to instantly apply and redeem this offer at checkout."}
                </div>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                className="data-[state=checked]:bg-emerald-500"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-2.5 pt-3 border-t">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                className="rounded-xl h-11 px-5"
              >
                {ar ? "إلغاء" : "Cancel"}
              </Button>
              <Button onClick={save} disabled={saving} className="rounded-xl h-11 px-6 shadow">
                {saving
                  ? ar
                    ? "جاري الحفظ..."
                    : "Saving..."
                  : ar
                    ? "حفظ رمز الخصم"
                    : "Save Promo Code"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
