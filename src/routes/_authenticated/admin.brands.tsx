import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Store,
  ExternalLink,
  Crown,
  Pencil,
  Trash2,
  AlertTriangle,
  DollarSign,
  Users,
  Clock as ClockIcon,
  Eye,
  CheckCircle,
  XCircle,
  TrendingUp,
  Loader2,
  CalendarRange,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n, useT } from "@/lib/i18n";
import { SUPER_ADMIN_EMAIL } from "@/lib/profile-context";
import { startImpersonationSession } from "@/lib/impersonation.functions";
import { purgeBrandPublicMedia } from "@/lib/r2-upload";
import { purgeBrandPrivateReceipts } from "@/lib/benefit-receipt.functions";
import { META_DESCRIPTION_LIMIT, META_TITLE_LIMIT, sanitizeMetaText } from "@/lib/seo";
import {
  getSubscriptionReceiptViewUrl,
  approveSubscriptionSaaS,
  rejectSubscriptionSaaS,
} from "@/lib/saas-subscription.functions";

export const Route = createFileRoute("/_authenticated/admin/brands")({
  beforeLoad: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const email = (user.email || "").toLowerCase();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const isSuperAdmin = email === SUPER_ADMIN_EMAIL || profile?.role === "super_admin";
    if (!isSuperAdmin) throw redirect({ to: "/admin" });
  },
  component: BrandsPage,
});

type Brand = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  primary_color: string | null;
  about_ar: string | null;
  about_en: string | null;
  meta_title: string | null;
  meta_description: string | null;
  subscription_tier: "basic" | "growth" | "enterprise" | null;
  subscription_status: "active" | "pending_verification" | "suspended" | null;
  subscription_expires_at: string | null;
  payment_receipt_url: string | null;
  payment_receipt_uploaded_at: string | null;
  custom_domain: string | null;
  plan_type: "lifetime" | "trial" | null;
  trial_ends_at: string | null;
  support_access_enabled: boolean;
};

function BrandsPage() {
  const t = useT();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleImpersonate = async (brandId: string, slug: string) => {
    const toastId = toast.loading(
      lang === "ar"
        ? "جاري تفعيل قناة محاكاة المسؤول الخارق..."
        : "Initializing Superadmin Impersonation session...",
    );
    try {
      const res = await startImpersonationSession({ data: { targetTenantId: brandId } });
      if (res && "token" in res && res.token) {
        document.cookie = `boutq_impersonation_token=${res.token}; path=/; max-age=${60 * 60 * 24}; samesite=lax${window.location.protocol === "https:" ? "; secure" : ""}`;
      }
      toast.success(
        lang === "ar"
          ? "تم تسجيل الجلسة في سجل التدقيق الموثق! جاري التحويل..."
          : "Audit log recorded! Redirecting to merchant dashboard...",
        { id: toastId },
      );
      window.location.href = `/admin/b/${slug}/dashboard`;
    } catch (err: any) {
      console.error(err);
      toast.error(
        err.message ||
          (lang === "ar"
            ? "فشل تفعيل جلسة المحاكاة. يرجى مراجعة الصلاحيات."
            : "Impersonation launch blocked. Verify operator permissions."),
        { id: toastId },
      );
    }
  };
  const [editing, setEditing] = useState<Brand | null>(null);
  const [deleting, setDeleting] = useState<Brand | null>(null);
  const [activeTab, setActiveTab] = useState("all-stores");

  // Approval Dialog States
  const [approvingBrand, setApprovingBrand] = useState<Brand | null>(null);
  const [approveTier, setApproveTier] = useState<"basic" | "growth" | "enterprise">("basic");
  const [approveMonths, setApproveMonths] = useState<number>(1);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Brand[];
    },
  });

  const brands = q.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["brands"] });

  // Filter pending approvals
  const pendingApprovals = brands.filter(
    (b) => b.subscription_status === "pending_verification" && b.payment_receipt_url,
  );

  // Compute Platform KPI Stats
  const activeSaaSCount = brands.filter((b) => b.subscription_status === "active").length;

  // Calculate SaaS MRR in BHD
  const totalMRR = brands.reduce((sum, b) => {
    if (b.subscription_status !== "active") return sum;
    if (b.subscription_tier === "growth") return sum + 49;
    if (b.subscription_tier === "basic" || !b.subscription_tier) return sum + 19;
    return sum;
  }, 0);

  const handleViewReceipt = async (objectKey: string) => {
    try {
      const { viewUrl } = await getSubscriptionReceiptViewUrl({ data: { objectKey } });
      window.open(viewUrl, "_blank");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate private view URL.");
    }
  };

  const handleApprove = async () => {
    if (!approvingBrand) return;
    setApproving(true);
    try {
      await approveSubscriptionSaaS({
        data: {
          brandId: approvingBrand.id,
          tier: approveTier,
          months: approveMonths,
        },
      });
      toast.success(
        lang === "ar"
          ? "تم تفعيل الاشتراك وتمديد الصلاحية بنجاح!"
          : "Subscription approved and extended successfully!",
      );
      setApprovingBrand(null);
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve subscription.");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (brandId: string) => {
    if (
      !confirm(
        lang === "ar"
          ? "هل أنت متأكد من رفض هذا الإيصال؟ سيتم حذف الملف وتعليق المتجر."
          : "Are you sure you want to reject this receipt? The file will be purged and account suspended.",
      )
    )
      return;
    setRejecting(brandId);
    try {
      await rejectSubscriptionSaaS({ data: { brandId } });
      toast.success(
        lang === "ar" ? "تم رفض وإزالة الإيصال بنجاح." : "Receipt rejected and storage cleaned.",
      );
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject subscription.");
    } finally {
      setRejecting(null);
    }
  };

  return (
    <div
      className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8 animate-fade-in"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary mb-1">
            <Crown className="h-3.5 w-3.5 text-amber-500 animate-pulse" />{" "}
            {lang === "ar" ? "المدير الأعلى" : "Super Admin Cockpit"}
          </div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 dark:from-slate-50 dark:to-slate-300">
            {lang === "ar" ? "لوحة تحكم بوتك SaaS" : "Boutq SaaS Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "ar"
              ? "مراقبة مستأجري المنصة، الموافقة على الطلبات، وإدارة المحلات متعددة المستأجرين."
              : "Monitor platform tenants, approve requests, and manage multi-tenant shops."}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-11 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95">
              <Plus className="h-4 w-4 me-2" />{" "}
              {lang === "ar" ? "إطلاق بوتيك جديد" : "Deploy New Boutique"}
            </Button>
          </DialogTrigger>
          <NewBrandDialog
            onSaved={() => {
              setOpen(false);
              refresh();
            }}
          />
        </Dialog>
      </div>

      {/* Modern SaaS KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI: Total Brands */}
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 flex items-center gap-4 relative">
          <div className="p-3 rounded-full bg-primary/5 text-primary">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
              {lang === "ar" ? "إجمالي البوتيكات" : "Total Boutique Tenants"}
            </span>
            <span className="text-2xl font-bold font-display mt-0.5 block">{brands.length}</span>
          </div>
        </Card>

        {/* KPI: Active SaaS Subscriptions */}
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 flex items-center gap-4 relative">
          <div className="p-3 rounded-full bg-emerald-500/5 text-emerald-500">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
              {lang === "ar" ? "الاشتراكات النشطة" : "Active SaaS Subscriptions"}
            </span>
            <span className="text-2xl font-bold font-display text-emerald-600 dark:text-emerald-500 mt-0.5 block">
              {activeSaaSCount}
            </span>
          </div>
        </Card>

        {/* KPI: SaaS Platform MRR */}
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 flex items-center gap-4 relative">
          <div className="p-3 rounded-full bg-blue-500/5 text-blue-500">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
              {lang === "ar" ? "الإيراد الشهري المتكرر (MRR)" : "Monthly Recurring Revenue"}
            </span>
            <span className="text-2xl font-bold font-display text-blue-600 dark:text-blue-500 mt-0.5 block">
              {totalMRR} BHD
            </span>
          </div>
        </Card>
      </div>

      {/* Interactive Tabs Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md h-11 mb-6 bg-muted/60 p-1">
          <TabsTrigger value="all-stores" className="h-9 font-medium text-xs">
            {lang === "ar" ? "المحلات المتاحة" : "All Shops"} ({brands.length})
          </TabsTrigger>
          <TabsTrigger value="receipt-approvals" className="h-9 font-medium text-xs relative">
            {lang === "ar" ? "إيصالات الاشتراكات" : "Receipt Approvals"}
            {pendingApprovals.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-rose-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold animate-bounce">
                {pendingApprovals.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* TAB CONTENT: All Registered Tenants */}
        <TabsContent value="all-stores" className="space-y-4">
          {brands.length === 0 ? (
            <Card className="p-12 text-center">
              <Store className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {lang === "ar" ? "لم يتم إنشاء أي علامة تجارية بعد." : "No brands yet."}
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {brands.map((b) => (
                <Card
                  key={b.id}
                  className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 relative flex flex-col justify-between h-56 transition-all duration-200 hover:shadow-xl hover:scale-[1.01]"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      {b.logo_url ? (
                        <img
                          src={b.logo_url}
                          alt={b.name_en}
                          className="h-10 w-10 rounded object-contain bg-secondary border border-border/60"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-secondary grid place-items-center border border-border/60">
                          <Store className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-display font-medium text-lg truncate flex items-center gap-2">
                          <span>{lang === "ar" ? b.name_ar || b.name_en : b.name_en}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate font-mono">
                          {b.slug}.boutq.store
                        </div>
                      </div>

                      {/* Subscription status badges */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {b.support_access_enabled === false && (
                          <Badge
                            variant="destructive"
                            className="bg-rose-500 hover:bg-rose-600 text-white text-[9px] font-semibold py-0 h-4"
                          >
                            {lang === "ar" ? "الخصوصية مفعلة" : "Privacy Lock"}
                          </Badge>
                        )}
                        {b.subscription_status === "active" ? (
                          <Badge className="bg-emerald-500 text-white hover:bg-emerald-600 text-[10px]">
                            {b.subscription_tier === "growth" ? "Growth VIP" : "Basic"}
                          </Badge>
                        ) : b.subscription_status === "pending_verification" ? (
                          <Badge className="bg-amber-500 text-white hover:bg-amber-600 text-[10px] animate-pulse">
                            Pending
                          </Badge>
                        ) : (
                          <Badge className="bg-zinc-400 text-white hover:bg-zinc-500 text-[10px]">
                            Unpaid
                          </Badge>
                        )}
                        {b.subscription_expires_at && (
                          <span className="text-[9px] text-muted-foreground font-semibold flex items-center gap-0.5">
                            <ClockIcon className="h-2.5 w-2.5" />
                            {new Date(b.subscription_expires_at).toLocaleDateString(
                              lang === "ar" ? "ar-BH-u-nu-latn" : "en-US",
                              { month: "short", day: "numeric" },
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                    {b.support_access_enabled === false ? (
                      <div className="flex-1 flex flex-col gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full h-9 opacity-50 cursor-not-allowed"
                          disabled
                        >
                          <Shield className="h-3.5 w-3.5 me-1 text-zinc-400" />
                          {lang === "ar" ? "المحاكاة معطلة" : "Impersonation Disabled"}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 h-9 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                        onClick={() => handleImpersonate(b.id, b.slug)}
                      >
                        <Shield className="h-3.5 w-3.5 me-1 text-amber-500 animate-pulse" />
                        {lang === "ar" ? "محاكاة اللوحة" : "Impersonate"}
                      </Button>
                    )}
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="flex-1 h-9 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                    >
                      <Link to="/$slug" params={{ slug: b.slug }}>
                        <ExternalLink className="h-3.5 w-3.5 me-1" />
                        {lang === "ar" ? "المتجر" : "Storefront"}
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                      onClick={() => setEditing(b)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 h-9 shadow-sm transition-all duration-200 hover:scale-[1.01] active:scale-95"
                      onClick={() => setDeleting(b)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB CONTENT: Subscription Receipt Approvals Queue */}
        <TabsContent value="receipt-approvals" className="space-y-4">
          {pendingApprovals.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-zinc-200 dark:border-zinc-800">
              <CheckCircle className="h-10 w-10 mx-auto text-emerald-500 mb-3 animate-bounce" />
              <h3 className="font-display font-medium text-lg">
                {lang === "ar" ? "قائمة المراجعة فارغة تماماً!" : "Inbox is perfectly clean!"}
              </h3>
              <p className="text-muted-foreground text-xs mt-1">
                {lang === "ar"
                  ? "لا توجد إيصالات دفع معلقة للمراجعة في الوقت الحالي."
                  : "No boutique payment receipts are awaiting approval at the moment."}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingApprovals.map((b) => (
                <Card
                  key={b.id}
                  className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-amber-500/5 grid place-items-center text-amber-500">
                      <ClockIcon className="h-5 w-5 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="font-display font-medium text-base text-zinc-900 dark:text-zinc-100">
                        {lang === "ar" ? b.name_ar || b.name_en : b.name_en}
                      </h4>
                      <p className="text-xs text-muted-foreground font-mono">
                        /{b.slug} • ID: {b.id.substring(0, 8)}...
                      </p>
                      {b.payment_receipt_uploaded_at && (
                        <p className="text-[10px] text-zinc-400 mt-1">
                          {lang === "ar" ? "تم الرفع:" : "Uploaded:"}{" "}
                          {new Date(b.payment_receipt_uploaded_at).toLocaleString(
                            lang === "ar" ? "ar-BH-u-nu-latn" : "en-US",
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* View R2 Receipt Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs font-medium shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                      onClick={() =>
                        b.payment_receipt_url && handleViewReceipt(b.payment_receipt_url)
                      }
                    >
                      <Eye className="h-4 w-4 text-primary" />
                      <span>{lang === "ar" ? "عرض إيصال R2" : "View Receipt"}</span>
                    </Button>

                    {/* Open Approve Dialog */}
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs font-medium shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                      onClick={() => {
                        setApprovingBrand(b);
                        setApproveTier("basic");
                        setApproveMonths(1);
                      }}
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>{lang === "ar" ? "اعتماد" : "Approve"}</span>
                    </Button>

                    {/* Reject Receipt */}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={rejecting === b.id}
                      className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/5 gap-1 text-xs font-medium transition-all duration-200 hover:scale-[1.01] active:scale-95"
                      onClick={() => handleReject(b.id)}
                    >
                      {rejecting === b.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      <span>{lang === "ar" ? "رفض" : "Reject"}</span>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* DIALOG: Approve Subscription & Assign Tier/Expires Date */}
      {approvingBrand && (
        <Dialog open={!!approvingBrand} onOpenChange={(v) => !v && setApprovingBrand(null)}>
          <DialogContent className="max-w-md bg-background/95 backdrop-blur-md border border-border/60 text-foreground p-6 rounded-2xl shadow-xl">
            <DialogHeader>
              <DialogTitle className="font-display font-medium flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                <span>{lang === "ar" ? "اعتماد اشتراك البوتيك" : "Approve SaaS Subscription"}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div className="p-3 bg-muted/40 border border-border/40 rounded-xl font-mono text-xs">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest">
                  {lang === "ar" ? "المحل المختار" : "Boutique Brand"}
                </p>
                <p className="font-display font-semibold mt-0.5 text-foreground text-sm">
                  {approvingBrand.name_en}
                </p>
              </div>

              {/* Tier Selection */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {lang === "ar" ? "تحديد باقة الاشتراك" : "Assign Plan Tier"}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setApproveTier("basic")}
                    className={`p-3 rounded-lg border text-left flex flex-col justify-between h-20 transition-all ${
                      approveTier === "basic"
                        ? "border-primary bg-primary/[0.02] ring-1 ring-primary"
                        : "border-border/60 bg-background hover:border-zinc-300"
                    }`}
                  >
                    <span className="font-semibold text-xs text-foreground">
                      {lang === "ar" ? "الباقة الأساسية" : "Basic Boutique"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">19 BHD/month</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setApproveTier("growth")}
                    className={`p-3 rounded-lg border text-left flex flex-col justify-between h-20 transition-all ${
                      approveTier === "growth"
                        ? "border-primary bg-primary/[0.02] ring-1 ring-primary"
                        : "border-border/60 bg-background hover:border-zinc-300"
                    }`}
                  >
                    <span className="font-semibold text-xs text-foreground">
                      {lang === "ar" ? "الباقة المتقدمة" : "Growth VIP"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">49 BHD/month</span>
                  </button>
                </div>
              </div>

              {/* Month Selection */}
              <div className="space-y-2">
                <Label
                  htmlFor="approve-months"
                  className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {lang === "ar" ? "مدة الترخيص (أشهر)" : "SaaS License Duration (Months)"}
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 3, 6, 12].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setApproveMonths(m)}
                      className={`h-10 rounded-lg border font-medium text-xs transition-all ${
                        approveMonths === m
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border/60 bg-background hover:border-zinc-300"
                      }`}
                    >
                      {m} {lang === "ar" ? "شهر" : "M"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setApprovingBrand(null)}
                disabled={approving}
                className="shadow-sm transition-all duration-200 hover:scale-[1.01] active:scale-95"
              >
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                onClick={handleApprove}
                disabled={approving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm transition-all duration-200 hover:scale-[1.01] active:scale-95"
              >
                {approving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{lang === "ar" ? "جاري الاعتماد..." : "Activating..."}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>{lang === "ar" ? "تفعيل الحساب الآن" : "Authorize & Activate"}</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialogs: Edit / Delete */}
      {editing && (
        <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
          <EditBrandDialog
            brand={editing}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
          />
        </Dialog>
      )}
      {deleting && (
        <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
          <DeleteBrandDialog
            brand={deleting}
            onDone={() => {
              setDeleting(null);
              refresh();
            }}
          />
        </Dialog>
      )}
    </div>
  );
}

function NewBrandDialog({ onSaved }: { onSaved: () => void }) {
  const { lang } = useI18n();
  const [form, setForm] = useState({ slug: "", name_en: "", name_ar: "", logo_url: "" });
  const [planType, setPlanType] = useState<"lifetime" | "trial">("lifetime");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const slug = form.slug.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(slug)) {
      toast.error(lang === "ar" ? "معرّف غير صالح (a-z, 0-9، -)" : "Invalid slug (a-z, 0-9, -)");
      return;
    }
    if (!form.name_en.trim()) {
      toast.error(lang === "ar" ? "الاسم بالإنجليزية مطلوب" : "English name is required");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Deploying tenant using RPC for instant, correct seeding!
      const { error } = await supabase.rpc("create_tenant_with_defaults" as any, {
        p_slug: slug,
        p_name_en: form.name_en.trim(),
        p_name_ar: form.name_ar.trim() || null,
        p_primary_color: "#800020",
        p_owner_id: user?.id ?? "00000000-0000-0000-0000-000000000000",
        p_owner_email: user?.email ?? "super_admin@pura.bh",
        p_owner_name: "Super Admin Deployment",
      });

      if (error) throw error;

      // Update plan_type and trial_ends_at on the newly created brand row
      const trialEndsAt =
        planType === "trial" ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() : null;
      const { data: brandRow } = await supabase
        .from("brands")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (brandRow) {
        const { error: brandUpdateErr } = await supabase
          .from("brands")
          .update({
            plan_type: planType,
            trial_ends_at: trialEndsAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", brandRow.id);

        if (brandUpdateErr) {
          console.error("Failed to set custom plan on newly deployed brand:", brandUpdateErr);
        }
      }

      toast.success(
        lang === "ar" ? "تم تهيئة المتجر وإطلاقه بنجاح!" : "Tenant database provisioned and live!",
      );
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-md bg-background/95 backdrop-blur-md border border-border/60 text-foreground p-6 rounded-2xl shadow-xl">
      <DialogHeader>
        <DialogTitle className="font-display font-bold text-lg">
          {lang === "ar" ? "علامة تجارية جديدة" : "New Brand"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>
            {lang === "ar" ? "الاسم بالإنجليزية (يدوي)" : "Brand Name — English (manual)"}
          </Label>
          <Input
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={form.name_en}
            onChange={(e) => setForm({ ...form, name_en: e.target.value })}
            placeholder={lang === "ar" ? "اكتب الاسم يدويًا" : "Type the brand name manually"}
          />
        </div>
        <div>
          <Label>{lang === "ar" ? "الاسم بالعربية (يدوي)" : "Brand Name — Arabic (manual)"}</Label>
          <Input
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={form.name_ar}
            onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
            placeholder={lang === "ar" ? "اكتب الاسم يدويًا" : "Type the brand name manually"}
          />
        </div>
        <div>
          <Label>{lang === "ar" ? "المعرّف (الرابط) — يدوي" : "URL slug (manual)"}</Label>
          <Input
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="pura"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {lang === "ar"
              ? "يُكتب يدويًا ولا يُشتق من الاسم. سيظهر في /admin/b/{المعرّف} و /{المعرّف}."
              : "Typed manually — never auto-generated from the name. Used in /admin/b/{slug} and /{slug}."}
          </p>
        </div>
        <div>
          <Label>{lang === "ar" ? "باقة تفعيل المتجر" : "Deployment Access Plan"}</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              onClick={() => setPlanType("lifetime")}
              className={`p-2.5 text-xs rounded border font-semibold text-center cursor-pointer transition-all ${
                planType === "lifetime"
                  ? "border-primary bg-primary/[0.02] ring-1 ring-primary text-primary"
                  : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              }`}
            >
              {lang === "ar" ? "ترخيص مدى الحياة" : "Lifetime Access"}
            </button>
            <button
              type="button"
              onClick={() => setPlanType("trial")}
              className={`p-2.5 text-xs rounded border font-semibold text-center cursor-pointer transition-all ${
                planType === "trial"
                  ? "border-primary bg-primary/[0.02] ring-1 ring-primary text-primary"
                  : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              }`}
            >
              {lang === "ar" ? "تجربة 3 أيام" : "3-Day Free Trial"}
            </button>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={submit}
          disabled={saving}
          className="shadow-sm transition-all duration-200 hover:scale-[1.01] active:scale-95"
        >
          {lang === "ar" ? "إنشاء" : "Create"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditBrandDialog({ brand, onSaved }: { brand: Brand; onSaved: () => void }) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [form, setForm] = useState({
    name_en: brand.name_en,
    name_ar: brand.name_ar ?? "",
    logo_url: brand.logo_url ?? "",
    primary_color: brand.primary_color ?? "#8b6f47",
    about_ar: brand.about_ar ?? "",
    about_en: brand.about_en ?? "",
    meta_title: brand.meta_title ?? "",
    meta_description: brand.meta_description ?? "",
    is_active: brand.is_active,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      name_en: brand.name_en,
      name_ar: brand.name_ar ?? "",
      logo_url: brand.logo_url ?? "",
      primary_color: brand.primary_color ?? "#8b6f47",
      about_ar: brand.about_ar ?? "",
      about_en: brand.about_en ?? "",
      meta_title: brand.meta_title ?? "",
      meta_description: brand.meta_description ?? "",
      is_active: brand.is_active,
    });
  }, [brand]);

  const save = async () => {
    if (!form.name_en.trim()) {
      toast.error(isAr ? "الاسم بالإنجليزية مطلوب" : "English name is required");
      return;
    }
    setSaving(true);
    const { error } = await (supabase.from("brands") as any)
      .update({
        name_en: form.name_en.trim(),
        name_ar: form.name_ar.trim() || null,
        logo_url: form.logo_url.trim() || null,
        primary_color: form.primary_color || null,
        about_ar: form.about_ar.trim() || null,
        about_en: form.about_en.trim() || null,
        meta_title: sanitizeMetaText(form.meta_title, META_TITLE_LIMIT) || null,
        meta_description: sanitizeMetaText(form.meta_description, META_DESCRIPTION_LIMIT) || null,
        is_active: form.is_active,
      })
      .eq("id", brand.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("brands.updateSuccess"));
    onSaved();
  };

  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-md border border-border/60 text-foreground p-6 rounded-2xl shadow-xl">
      <DialogHeader>
        <DialogTitle className="font-display font-bold text-lg">
          {t("brands.editTitle")} — {brand.name_en}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>{isAr ? "المعرّف" : "Slug"}</Label>
          <Input value={brand.slug} readOnly disabled />
          <p className="text-xs text-muted-foreground mt-1">
            {isAr
              ? "لا يمكن تغيير المعرّف لأنه مستخدم في الروابط والفواتير."
              : "Slug can't be changed — it's used in URLs and invoice links."}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</Label>
            <Input
              value={form.name_en}
              onChange={(e) => setForm({ ...form, name_en: e.target.value })}
            />
          </div>
          <div>
            <Label>{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</Label>
            <Input
              value={form.name_ar}
              onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>{isAr ? "رابط الشعار" : "Logo URL"}</Label>
          <Input
            value={form.logo_url}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <div>
          <Label>{isAr ? "لون العلامة" : "Brand color"}</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.primary_color}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              className="h-9 w-12 rounded border border-border cursor-pointer"
            />
            <Input
              value={form.primary_color}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>{isAr ? "نبذة (عربي)" : "About (Arabic)"}</Label>
            <Textarea
              rows={3}
              value={form.about_ar}
              onChange={(e) => setForm({ ...form, about_ar: e.target.value })}
            />
          </div>
          <div>
            <Label>{isAr ? "نبذة (إنجليزي)" : "About (English)"}</Label>
            <Textarea
              rows={3}
              value={form.about_en}
              onChange={(e) => setForm({ ...form, about_en: e.target.value })}
            />
          </div>
        </div>
        <Card className="space-y-4 p-4 border border-border/60 shadow rounded-xl bg-card/40">
          <div>
            <div className="flex items-center justify-between gap-3">
              <Label>{isAr ? "عنوان محركات البحث" : "Meta Title"}</Label>
              <span className="text-xs text-muted-foreground">
                {form.meta_title.length}/{META_TITLE_LIMIT}
              </span>
            </div>
            <Input
              value={form.meta_title}
              maxLength={META_TITLE_LIMIT}
              onChange={(event) => setForm({ ...form, meta_title: event.target.value })}
              placeholder={
                isAr ? "عنوان المتجر في نتائج البحث" : "Store title shown in search results"
              }
              dir={isAr ? "rtl" : "ltr"}
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <Label>{isAr ? "وصف محركات البحث" : "Meta Description"}</Label>
              <span className="text-xs text-muted-foreground">
                {form.meta_description.length}/{META_DESCRIPTION_LIMIT}
              </span>
            </div>
            <Textarea
              rows={3}
              value={form.meta_description}
              maxLength={META_DESCRIPTION_LIMIT}
              onChange={(event) => setForm({ ...form, meta_description: event.target.value })}
              placeholder={
                isAr ? "وصف مختصر وجذاب للمتجر" : "A concise description of this storefront"
              }
              dir={isAr ? "rtl" : "ltr"}
            />
          </div>
        </Card>
        <div className="flex items-center justify-between border border-border/60 rounded-xl p-3 bg-muted/20">
          <div>
            <p className="text-sm font-medium">{isAr ? "نشط" : "Active"}</p>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "إذا كانت غير نشطة، لن تظهر في المتجر."
                : "Inactive brands are hidden from the storefront."}
            </p>
          </div>
          <Switch
            checked={form.is_active}
            onCheckedChange={(v) => setForm({ ...form, is_active: v })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={save}
          disabled={saving}
          className="shadow-sm transition-all duration-200 hover:scale-[1.01] active:scale-95"
        >
          {t("common.save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DeleteBrandDialog({ brand, onDone }: { brand: Brand; onDone: () => void }) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [confirm, setConfirm] = useState("");
  const [hard, setHard] = useState(false);
  const [working, setWorking] = useState(false);
  const [databasePurged, setDatabasePurged] = useState(false);

  const countsQ = useQuery({
    queryKey: ["brand-delete-counts", brand.id],
    queryFn: async () => {
      const [{ count: orders }, { count: products }, { count: customers }] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { head: true, count: "exact" })
          .eq("brand_id", brand.id),
        supabase
          .from("products")
          .select("id", { head: true, count: "exact" })
          .eq("brand_id", brand.id),
        supabase
          .from("customers")
          .select("id", { head: true, count: "exact" })
          .eq("brand_id", brand.id),
      ]);
      return { orders: orders ?? 0, products: products ?? 0, customers: customers ?? 0 };
    },
  });
  const counts = countsQ.data;
  const run = async () => {
    if (confirm.trim().toLowerCase() !== brand.slug.toLowerCase()) {
      toast.error(isAr ? "المعرّف غير مطابق" : "Slug does not match");
      return;
    }
    setWorking(true);
    if (!databasePurged) {
      const { error } = await supabase.rpc("delete_brand", { p_brand_id: brand.id, p_hard: hard });
      if (error) {
        setWorking(false);
        return toast.error(error.message);
      }
      if (hard) setDatabasePurged(true);
    }
    if (hard) {
      try {
        await Promise.all([
          purgeBrandPublicMedia(brand.id),
          purgeBrandPrivateReceipts({ data: { brandId: brand.id } }),
        ]);
      } catch (error: any) {
        setWorking(false);
        toast.error(
          isAr
            ? "تم حذف بيانات العلامة، لكن تعذر تنظيف ملفات R2. اضغط إعادة المحاولة."
            : "Brand data was deleted, but R2 cleanup failed. Click retry to finish media cleanup.",
          { duration: 10000 },
        );
        return;
      }
    }
    setWorking(false);
    toast.success(t("brands.deleteSuccess"));
    onDone();
  };

  return (
    <DialogContent className="max-w-md bg-background/95 backdrop-blur-md border border-border/60 text-foreground p-6 rounded-2xl shadow-xl">
      <DialogHeader>
        <DialogTitle className="text-destructive flex items-center gap-2 font-display font-bold text-lg">
          <AlertTriangle className="h-5 w-5" /> {t("brands.delete")} — {brand.name_en}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {hard
            ? isAr
              ? "سيؤدي الحذف النهائي إلى إزالة جميع المنتجات والطلبات والفواتير والعملاء والإعدادات والملفات نهائياً. لا يمكن التراجع."
              : "Permanent deletion removes all products, orders, invoices, customers, settings, and media. This cannot be undone."
            : t("brands.deleteWarning")}
        </p>
        {counts && (
          <div className="grid grid-cols-3 text-center rounded-md border border-border p-3 text-sm">
            <div>
              <div className="font-display text-lg">{counts.orders}</div>
              <div className="text-xs text-muted-foreground">{isAr ? "طلبات" : "Orders"}</div>
            </div>
            <div>
              <div className="font-display text-lg">{counts.products}</div>
              <div className="text-xs text-muted-foreground">{isAr ? "منتجات" : "Products"}</div>
            </div>
            <div>
              <div className="font-display text-lg">{counts.customers}</div>
              <div className="text-xs text-muted-foreground">{isAr ? "عملاء" : "Customers"}</div>
            </div>
          </div>
        )}
        <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={hard}
            onChange={(e) => setHard(e.target.checked)}
          />
          <span>{t("brands.deleteHardOption")}</span>
        </label>
        <div>
          <Label>{t("brands.deleteConfirmText")}</Label>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={brand.slug}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="destructive"
          onClick={run}
          className="shadow-sm transition-all duration-200 hover:scale-[1.01] active:scale-95"
          disabled={working || confirm.trim().toLowerCase() !== brand.slug.toLowerCase()}
        >
          {working
            ? "…"
            : databasePurged
              ? isAr
                ? "إعادة محاولة تنظيف الملفات"
                : "Retry media cleanup"
              : hard
                ? isAr
                  ? "حذف كل شيء نهائياً"
                  : "Permanently delete everything"
                : isAr
                  ? "تعطيل ومسح"
                  : "Deactivate and remove"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
