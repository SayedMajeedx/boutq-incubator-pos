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
  const [activeTab, setActiveTab] = useState<"all" | "active" | "scheduled" | "expired">("all");

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
        ? `تم ${nextActive ? "تفعيل" : "إيقاف مؤقت"} الرمز ${p.code} بنجاح`
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

  // Filter list based on selected tab
  const displayedPromos = allList.filter((p) => {
    const isStarted = !p.start_date || new Date(p.start_date) <= now;
    const isExpired = p.end_date && new Date(p.end_date) < now;
    const usage = analyticsQ.data?.[p.id]?.count || 0;
    const isCapReached = p.max_redemptions != null && usage >= p.max_redemptions;

    if (activeTab === "active") {
      return p.is_active && isStarted && !isExpired && !isCapReached;
    }
    if (activeTab === "scheduled") {
      return p.is_active && !isStarted && !isExpired;
    }
    if (activeTab === "expired") {
      return isExpired || isCapReached;
    }
    return true; // 'all'
  });

  return (
    <div
      className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8 animate-fade-in"
      dir={ar ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 dark:from-slate-50 dark:to-slate-300">
            {ar ? "رموز الخصم" : "Discount Codes"}
          </h1>
          <p className="mt-1.5 text-muted-foreground text-sm max-w-md">
            {ar
              ? "أنشئ عروضاً خاصة وحدد شروط الأهلية والجدولة."
              : "Create and manage promotions, schedules, and limits for this brand."}
          </p>
        </div>
        <Button
          onClick={beginCreate}
          className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-2"
        >
          <Plus className="h-4 w-4" />
          {ar ? "إنشاء رمز خصم" : "Create Promo Code"}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
        <TabsList className="bg-muted/60 p-1 rounded-xl">
          <TabsTrigger
            value="all"
            className="rounded-lg text-xs sm:text-sm font-medium gap-1.5 py-1.5"
          >
            {ar ? "الكل" : "All"}
            <span className="bg-slate-200/80 dark:bg-slate-800/80 px-2 py-0.5 rounded-full text-xs font-semibold">
              {allList.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="active"
            className="rounded-lg text-xs sm:text-sm font-medium gap-1.5 py-1.5 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            {ar ? "النشطة" : "Active"}
            <span className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full text-xs font-semibold">
              {activeCount}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="scheduled"
            className="rounded-lg text-xs sm:text-sm font-medium gap-1.5 py-1.5 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-400"
          >
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            {ar ? "المجدولة" : "Scheduled"}
            <span className="bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full text-xs font-semibold">
              {scheduledCount}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="expired"
            className="rounded-lg text-xs sm:text-sm font-medium gap-1.5 py-1.5 data-[state=active]:text-rose-700 dark:data-[state=active]:text-rose-400"
          >
            <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
            {ar ? "المنتهية" : "Expired"}
            <span className="bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded-full text-xs font-semibold">
              {expiredCount}
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* List Card */}
      <Card className="overflow-hidden border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
        {promos.isLoading || analyticsQ.isLoading ? (
          <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm font-medium">
              {ar ? "جاري تحميل البيانات..." : "Loading promotions..."}
            </span>
          </div>
        ) : !allList.length ? (
          <div className="grid place-items-center gap-4 p-16 text-center">
            <div className="p-4 bg-muted/50 rounded-full">
              <Tags className="h-10 w-10 text-muted-foreground" />
            </div>
            <div>
              <div className="font-semibold text-lg">
                {ar ? "لا توجد رموز خصم حتى الآن" : "No promo codes yet"}
              </div>
              <div className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                {ar
                  ? "أنشئ أول عرض ترويجي لجذب المتسوقين وزيادة مبيعاتك."
                  : "Create your first storefront offer to attract buyers and boost sales."}
              </div>
            </div>
            <Button variant="outline" onClick={beginCreate} className="mt-2 rounded-xl">
              {ar ? "+ إضافة رمز" : "+ Add code"}
            </Button>
          </div>
        ) : !displayedPromos.length ? (
          <div className="grid place-items-center gap-2 p-16 text-center text-muted-foreground">
            <Tags className="h-8 w-8 opacity-40 mb-2" />
            <span className="text-sm font-medium">
              {ar ? "لا توجد نتائج تطابق التبويب المختار." : "No promo codes in this status."}
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm text-left">
              <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                <tr className={ar ? "text-right" : "text-left"}>
                  <th className="px-6 py-4">{ar ? "الرمز" : "Code"}</th>
                  <th className="px-6 py-4">{ar ? "نوع الخصم" : "Discount"}</th>
                  <th className="px-6 py-4">{ar ? "الأداء (المبيعات)" : "Driven Revenue"}</th>
                  <th className="px-6 py-4">{ar ? "معدل الاستهلاك" : "Redemptions"}</th>
                  <th className="px-6 py-4">{ar ? "تاريخ الصلاحية" : "Scheduling"}</th>
                  <th className="px-6 py-4 text-center">{ar ? "الحالة" : "Active"}</th>
                  <th className="px-6 py-4 text-center">{ar ? "الإجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {displayedPromos.map((p) => {
                  const usage = analyticsQ.data?.[p.id]?.count || 0;
                  const revenue = analyticsQ.data?.[p.id]?.revenue || 0;
                  const limit = p.max_redemptions;
                  const percent = limit ? Math.min((usage / limit) * 100, 100) : 0;

                  // Evaluate status classification labels
                  const isStarted = !p.start_date || new Date(p.start_date) <= now;
                  const isExpired = p.end_date && new Date(p.end_date) < now;
                  const isCapReached = limit != null && usage >= limit;

                  let statusBadge = (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                      <CheckCircle2 className="h-3 w-3" />
                      {ar ? "نشط" : "Active"}
                    </span>
                  );
                  if (!p.is_active) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 dark:bg-slate-900/50 dark:text-slate-400 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                        {ar ? "متوقف" : "Paused"}
                      </span>
                    );
                  } else if (!isStarted) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                        <Clock className="h-3 w-3" />
                        {ar ? "مجدول" : "Scheduled"}
                      </span>
                    );
                  } else if (isExpired || isCapReached) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                        <AlertCircle className="h-3 w-3" />
                        {isCapReached
                          ? ar
                            ? "نفذ بالكامل"
                            : "Exhausted"
                          : ar
                            ? "منتهي الصلاحية"
                            : "Expired"}
                      </span>
                    );
                  }

                  return (
                    <tr key={p.id} className="transition-colors hover:bg-muted/20 align-middle">
                      {/* Code */}
                      <td className="px-6 py-4.5">
                        <div className="font-mono font-extrabold text-sm text-foreground tracking-wider bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg inline-block shadow-xs">
                          {p.code}
                        </div>
                      </td>

                      {/* Type/Value */}
                      <td className="px-6 py-4.5">
                        <div className="font-medium text-foreground">
                          {p.discount_type === "percentage"
                            ? `${p.discount_value}%`
                            : formatMoney(Number(p.discount_value), currency, lang)}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {p.discount_type === "percentage"
                            ? ar
                              ? "نسبة مئوية"
                              : "Percentage value"
                            : ar
                              ? `خصم ثابت من السلة`
                              : `Fixed cart discount`}
                        </div>
                      </td>

                      {/* Revenue Driven */}
                      <td className="px-6 py-4.5 font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums text-sm">
                        {formatMoney(Number(revenue), currency, lang)}
                      </td>

                      {/* Usage / Progress Bar */}
                      <td className="px-6 py-4.5">
                        <div className="space-y-1.5 min-w-[140px] max-w-[200px]">
                          <div className="flex justify-between items-center text-[11px] font-semibold">
                            <span className="text-muted-foreground">
                              {ar ? "الاستهلاك" : "Usage"}
                            </span>
                            <span className="font-mono tabular-nums text-foreground">
                              {usage} {limit ? `/ ${limit}` : ` / ∞`}
                            </span>
                          </div>
                          <div className="relative w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ease-out ${
                                isCapReached
                                  ? "bg-rose-500"
                                  : percent >= 85
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                              }`}
                              style={{
                                width: `${limit ? percent : 100}%`,
                                opacity: limit ? 1 : 0.3,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Expiry Dates / Scheduling */}
                      <td className="px-6 py-4.5 text-xs text-muted-foreground">
                        {p.start_date || p.end_date ? (
                          <div className="space-y-0.5">
                            {p.start_date && (
                              <div className="flex items-center gap-1">
                                <span className="font-medium text-[10px] uppercase tracking-wider bg-slate-100 dark:bg-slate-800 px-1 rounded">
                                  {ar ? "بدء" : "From"}
                                </span>
                                <span className="font-mono">
                                  {new Date(p.start_date).toLocaleDateString(
                                    lang === "ar" ? "ar-BH-u-nu-latn" : "en-US",
                                    {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                </span>
                              </div>
                            )}
                            {p.end_date && (
                              <div className="flex items-center gap-1">
                                <span className="font-medium text-[10px] uppercase tracking-wider bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 px-1 rounded">
                                  {ar ? "انتهاء" : "Ends"}
                                </span>
                                <span className="font-mono">
                                  {new Date(p.end_date).toLocaleDateString(
                                    lang === "ar" ? "ar-BH-u-nu-latn" : "en-US",
                                    {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>

                      {/* Status Toggle Switch */}
                      <td className="px-6 py-4.5 text-center">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <Switch
                            checked={p.is_active}
                            onCheckedChange={() => toggleActive(p)}
                            disabled={isExpired || isCapReached}
                            className="data-[state=checked]:bg-emerald-500 scale-90"
                            aria-label="Toggle Status"
                          />
                          {statusBadge}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => beginEdit(p)}
                            className="h-8 w-8 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-muted-foreground hover:text-foreground"
                            aria-label="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive/80 hover:text-destructive hover:bg-destructive/10 rounded-lg"
                            onClick={() => remove(p)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
