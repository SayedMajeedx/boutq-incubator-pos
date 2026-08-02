import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { SUPER_ADMIN_EMAIL } from "@/lib/profile-context";
import {
  approveTenantRequest,
  rejectTenantRequest,
  getOnboardingPrice,
  updateRegistrationPrice,
} from "@/lib/onboarding.functions";
import { getSubscriptionReceiptViewUrl } from "@/lib/saas-subscription.functions";
import {
  Clock as ClockIcon,
  Crown,
  CheckCircle2,
  XCircle,
  Loader2,
  DollarSign,
  RefreshCw,
  ExternalLink,
  Building2,
  Tag,
  Percent,
  Settings,
  Sparkles,
  User,
  Mail,
  Phone,
  LayoutGrid,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { SuperCommandHeader } from "@/components/super/SuperCommandHeader";
import { SuperScopeSwitcher, type SuperScope } from "@/components/super/SuperScopeSwitcher";

export const Route = createFileRoute("/_authenticated/admin/super/requests")({
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
  component: SuperRequestsPage,
});

type TenantRequest = {
  id: string;
  full_name: string;
  email: string;
  contact_number: string;
  desired_subdomain: string;
  request_type: "trial" | "paid";
  status: "pending" | "approved" | "rejected";
  payment_verified: boolean;
  benefit_receipt_url: string | null;
  business_type?: string;
  created_at: string;
};

function SuperRequestsPage() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const [activeScope, setActiveScope] = useState<SuperScope>("requests");

  // Onboarding price states
  const [priceInput, setPriceInput] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  // Modal receipt viewer states
  const [selectedReceiptKey, setSelectedReceiptKey] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptViewUrl, setReceiptViewUrl] = useState<string | null>(null);

  // Approval Dialog States
  const [approvingRequest, setApprovingRequest] = useState<TenantRequest | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<"lifetime" | "trial">("lifetime");
  const [deploying, setDeploying] = useState(false);

  // Queries
  const requestsQuery = useQuery({
    queryKey: ["tenant-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as TenantRequest[];
    },
  });

  const priceQuery = useQuery({
    queryKey: ["onboarding-price"],
    queryFn: async () => {
      return await getOnboardingPrice();
    },
  });

  // Keep input in sync with live dynamic price
  useEffect(() => {
    if (priceQuery.data) {
      setPriceInput(priceQuery.data);
    }
  }, [priceQuery.data]);

  // Handle Save Price Changes
  const getFriendlyErrorMessage = (err: any): string => {
    if (!err) return "An unexpected error occurred.";
    const message = err.message || String(err);
    try {
      if (message.startsWith("[") && message.endsWith("]")) {
        const parsed = JSON.parse(message);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].message) {
          return parsed
            .map((issue: any) => {
              const pathStr = issue.path?.join(".") ? `(${issue.path.join(".")}) ` : "";
              return `${pathStr}${issue.message}`;
            })
            .join(", ");
        }
      }
    } catch (e) {
      // ignore
    }
    return message;
  };

  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!priceInput.trim()) return;

    setSavingPrice(true);
    const toastId = toast.loading(
      lang === "ar" ? "جاري حفظ وتعميم السعر الجديد..." : "Broadcasting custom price change...",
    );

    try {
      await updateRegistrationPrice({ data: { newPrice: priceInput.trim() } });
      toast.success(
        lang === "ar"
          ? "تم تعميم السعر والتخفيض الجديد فورياً!"
          : "Onboarding discount override published live!",
        { id: toastId },
      );
      void qc.invalidateQueries({ queryKey: ["onboarding-price"] });
    } catch (err: any) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Failed to update dynamic price.", {
        id: toastId,
      });
    } finally {
      setSavingPrice(false);
    }
  };

  // Helper calculation presets (inline percentages)
  const applyPresetDiscount = (percent: number) => {
    // Extract numerical digits from baseline
    const baseline = 55;
    const discounted = Math.round(baseline * (1 - percent / 100));
    setPriceInput(`${discounted} BHD`);
  };

  // View private R2 payment screenshot receipt
  const handleViewReceipt = async (objectKey: string) => {
    setSelectedReceiptKey(objectKey);
    setReceiptLoading(true);
    setReceiptViewUrl(null);

    try {
      const { viewUrl } = await getSubscriptionReceiptViewUrl({ data: { objectKey } });
      setReceiptViewUrl(viewUrl);
    } catch (err: any) {
      console.error(err);
      toast.error(
        lang === "ar"
          ? "فشل استرجاع رابط معاينة الإيصال."
          : "Failed to load pre-signed receipt viewer URL.",
      );
    } finally {
      setReceiptLoading(false);
    }
  };

  // Action: Open Approval Dialog Configuration
  const handleApprove = (request: TenantRequest) => {
    setApprovingRequest(request);
    // Pre-select plan based on initial request type
    setSelectedPlan(request.request_type === "trial" ? "trial" : "lifetime");
  };

  // Action: Approve & Mark Deployed on Confirmed dialog
  const executeApproval = async () => {
    if (!approvingRequest) return;
    setDeploying(true);
    const toastId = toast.loading(
      lang === "ar"
        ? "جاري تفعيل المساحة ونشر قواعد البيانات..."
        : "Deploying workspace structures...",
    );

    try {
      await approveTenantRequest({
        data: {
          requestId: approvingRequest.id,
          planType: selectedPlan,
        },
      });
      toast.success(
        lang === "ar"
          ? "تم تفعيل المتجر ونشر المساحة يدوياً بنجاح!"
          : "Workspace deployed successfully!",
        { id: toastId },
      );
      setApprovingRequest(null);
      void qc.invalidateQueries({ queryKey: ["tenant-requests"] });
    } catch (err: any) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Approval failed.", { id: toastId });
    } finally {
      setDeploying(false);
    }
  };

  // Action: Reject/Dismiss Request
  const handleReject = async (id: string, subdomain: string) => {
    const confirmReject = window.confirm(
      lang === "ar"
        ? `هل أنت متأكد من رفض طلب متجر "${subdomain}"؟`
        : `Are you sure you want to dismiss the tenant request for "${subdomain}"?`,
    );
    if (!confirmReject) return;

    const toastId = toast.loading(
      lang === "ar" ? "جاري رفض الطلب وأرشفته..." : "Dismissing request...",
    );

    try {
      await rejectTenantRequest({ data: { requestId: id } });
      toast.success(
        lang === "ar" ? "تم رفض وأرشفة الطلب بنجاح." : "Request dismissed and archived.",
        { id: toastId },
      );
      void qc.invalidateQueries({ queryKey: ["tenant-requests"] });
    } catch (err: any) {
      console.error(err);
      toast.error(getFriendlyErrorMessage(err) || "Rejection failed.", { id: toastId });
    }
  };

  const pendingRequests = requestsQuery.data ?? [];

  return (
    <div className="space-y-3.5">
      {/* 1. Command Header */}
      <SuperCommandHeader
        lang={lang === "ar" ? "ar" : "en"}
        pendingCount={pendingRequests.length}
        onRefresh={() => {
          void qc.invalidateQueries();
        }}
      />

      {/* 2. Scope Switcher */}
      <SuperScopeSwitcher
        lang={lang === "ar" ? "ar" : "en"}
        activeScope={activeScope}
        onScopeChange={(scope) => setActiveScope(scope)}
        pendingCount={pendingRequests.length}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Admin Live Pricing Control Panel */}
        <div className="space-y-6">
          <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm relative">
            <div className="absolute top-0 right-0 p-4 opacity-5 select-none pointer-events-none text-primary">
              <Percent className="h-24 w-24" />
            </div>
            <CardHeader className="pb-3 border-b border-border/60">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Settings className="h-4.5 w-4.5 text-primary" />
                <span>
                  {lang === "ar" ? "متحكم أسعار التسجيل" : "Live Onboarding Price overrides"}
                </span>
              </CardTitle>
              <CardDescription className="text-xs">
                {lang === "ar"
                  ? "تعديل وتخفيض رسوم تفعيل المتاجر الرسمية التي تظهر للزوار فوراً."
                  : "Override baseline platform fees shown on Card B with inline override settings."}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <form onSubmit={handleSavePrice} className="space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="overridden-price"
                    className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {lang === "ar" ? "رسوم التفعيل المعروضة حالياً" : "Active Registration Fee"}
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 h-4.5 w-4.5 text-muted-foreground" />
                    <Input
                      id="overridden-price"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      required
                      className="pl-9 font-display text-sm font-bold text-primary"
                      placeholder="e.g. 55 BHD"
                    />
                  </div>
                </div>

                {/* Pricing Presets Section borrowing Inventory patterns */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
                    {lang === "ar" ? "خصومات سريعة" : "Quick Applied Presets"}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => applyPresetDiscount(10)}
                      className="text-xs gap-1 py-1 h-8 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                    >
                      <Tag className="h-3 w-3" />
                      <span>{lang === "ar" ? "خصم 10٪ (49 د.ب)" : "-10% Off (49 BHD)"}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => applyPresetDiscount(20)}
                      className="text-xs gap-1 py-1 h-8 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                    >
                      <Tag className="h-3 w-3" />
                      <span>{lang === "ar" ? "خصم 20٪ (44 د.ب)" : "-20% Off (44 BHD)"}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setPriceInput("45 BHD")}
                      className="text-xs py-1 h-8 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                    >
                      {lang === "ar" ? "تعديل لـ 45 د.ب" : "Set 45 BHD"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setPriceInput("55 BHD")}
                      className="text-xs py-1 h-8 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                    >
                      {lang === "ar" ? "السعر الأصلي (55 د.ب)" : "Reset 55 BHD"}
                    </Button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={savingPrice || !priceInput}
                  className="w-full h-9 text-xs font-semibold gap-1.5 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                >
                  {savingPrice ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  <span>{lang === "ar" ? "حفظ وتعميم السعر" : "Save dynamic fee override"}</span>
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Columns: Main Tenant Requests Queue Table */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <ClockIcon className="h-4.5 w-4.5 text-primary" />
                    <span>
                      {lang === "ar" ? "قائمة الانتظار النشطة" : "Active Registration Waiting list"}
                    </span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {lang === "ar"
                      ? "طلبات تهيئة المتاجر المكتملة بانتظار التأكيد."
                      : "Manual tenant activations waiting super-admin approval."}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  {requestsQuery.data?.length ?? 0} {lang === "ar" ? "طلب معلق" : "Pending"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {requestsQuery.isLoading ? (
                <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-sm">
                    {lang === "ar"
                      ? "جاري سحب طلبات التفعيل المعلقة..."
                      : "Loading pending tenant requests..."}
                  </span>
                </div>
              ) : !requestsQuery.data || requestsQuery.data.length === 0 ? (
                <div className="p-16 text-center text-muted-foreground space-y-3">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto animate-bounce" />
                  <p className="text-sm font-medium text-foreground">
                    {lang === "ar"
                      ? "قائمة الانتظار فارغة بالكامل!"
                      : "All tenant requests processed!"}
                  </p>
                  <p className="text-xs">
                    {lang === "ar"
                      ? "لا توجد طلبات تهيئة معلقة في الوقت الراهن."
                      : "No pending manual activations are currently in the queue."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-muted-foreground text-xs uppercase border-b border-border/60">
                        <th className="p-4 text-left font-semibold">
                          {lang === "ar" ? "صاحب المتجر" : "Owner Details"}
                        </th>
                        <th className="p-4 text-left font-semibold">
                          {lang === "ar" ? "الرابط المطلوب" : "Desired subdomain"}
                        </th>
                        <th className="p-4 text-left font-semibold">
                          {lang === "ar" ? "نوع الباقة" : "Plan Package"}
                        </th>
                        <th className="p-4 text-left font-semibold">
                          {lang === "ar" ? "نوع النشاط" : "Business Type"}
                        </th>
                        <th className="p-4 text-center font-semibold">
                          {lang === "ar" ? "إثبات الدفع" : "Benefit Receipt"}
                        </th>
                        <th className="p-4 text-right font-semibold">
                          {lang === "ar" ? "الإجراءات" : "Deployment Actions"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {requestsQuery.data.map((request) => (
                        <tr
                          key={request.id}
                          className="border-b border-border/40 hover:bg-muted/20 transition-colors"
                        >
                          {/* Owner Metadata details */}
                          <td className="p-4 space-y-1">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-zinc-400" />
                              <span>{request.full_name}</span>
                            </div>
                            <div className="text-xs text-muted-foreground flex flex-col gap-0.5 font-mono">
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {request.email}
                              </span>
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {request.contact_number}
                              </span>
                            </div>
                          </td>

                          {/* Subdomain URL */}
                          <td className="p-4 font-mono text-xs">
                            <span className="font-bold text-primary">
                              {request.desired_subdomain}
                            </span>
                            <span className="text-muted-foreground">.boutq.store</span>
                          </td>

                          {/* Request Plan Type Badge */}
                          <td className="p-4">
                            <Badge
                              className={
                                request.request_type === "trial"
                                  ? "bg-[#B76E79]/10 text-[#B76E79] border-none font-semibold text-[10px]"
                                  : "bg-emerald-500/10 text-emerald-500 border-none font-semibold text-[10px]"
                              }
                              variant="outline"
                            >
                              {request.request_type === "trial"
                                ? lang === "ar"
                                  ? "تجربة 3 أيام"
                                  : "3-Day Trial"
                                : lang === "ar"
                                  ? "متجر مدفوع"
                                  : "Official Paid"}
                            </Badge>
                          </td>

                          {/* Business Type column cell */}
                          <td className="p-4">
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 border border-zinc-200/50 dark:border-zinc-700/50">
                              {request.business_type || (lang === "ar" ? "أزياء" : "Fashion")}
                            </span>
                          </td>

                          {/* BenefitPay screenshot handler view */}
                          <td className="p-4 text-center">
                            {request.benefit_receipt_url ? (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="xs"
                                    onClick={() => handleViewReceipt(request.benefit_receipt_url!)}
                                    className="text-xs gap-1 h-8 border-dashed border-primary/35 hover:bg-primary/[0.04]"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    <span>{lang === "ar" ? "معاينة الإيصال" : "View Receipt"}</span>
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md bg-zinc-950 text-white border-zinc-900">
                                  <DialogHeader>
                                    <DialogTitle className="text-sm font-semibold flex items-center gap-1.5">
                                      <ClockIcon className="h-4.5 w-4.5 text-primary" />
                                      <span>
                                        {lang === "ar"
                                          ? "لقطة تأكيد الدفع - بنفت بي"
                                          : "BenefitPay Payment Verification"}
                                      </span>
                                    </DialogTitle>
                                  </DialogHeader>
                                  <div className="flex flex-col items-center justify-center p-4">
                                    {receiptLoading ? (
                                      <div className="h-64 flex flex-col items-center justify-center gap-2">
                                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                        <p className="text-xs text-zinc-400">
                                          {lang === "ar"
                                            ? "جاري سحب الإيصال من R2 المشفر..."
                                            : "Pulling encrypted receipt from Private R2..."}
                                        </p>
                                      </div>
                                    ) : receiptViewUrl ? (
                                      <img
                                        src={receiptViewUrl}
                                        alt="Uploaded Receipt"
                                        className="max-h-[380px] w-auto rounded border border-zinc-800 object-contain shadow-lg"
                                      />
                                    ) : (
                                      <div className="h-64 flex items-center justify-center text-zinc-500 text-xs">
                                        {lang === "ar"
                                          ? "فشل تحميل الإيصال من السيرفر."
                                          : "Failed to load pre-signed viewer link."}
                                      </div>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                            ) : (
                              <span className="text-xs text-muted-foreground font-mono">—</span>
                            )}
                          </td>

                          {/* Approval / Rejection dispatch triggers */}
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => handleReject(request.id, request.desired_subdomain)}
                                className="text-xs border-zinc-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 py-1 h-8 px-2.5"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline ml-1">
                                  {lang === "ar" ? "رفض" : "Reject"}
                                </span>
                              </Button>
                              <Button
                                size="xs"
                                onClick={() => handleApprove(request)}
                                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white py-1 h-8 px-2.5 gap-1"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>{lang === "ar" ? "تفعيل ونشر" : "Approve"}</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Interactive Deployment Configuration Dialog */}
      <Dialog open={!!approvingRequest} onOpenChange={(open) => !open && setApprovingRequest(null)}>
        <DialogContent className="max-w-md bg-background/95 backdrop-blur-md border border-border/60 text-foreground p-6 rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-display font-medium flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <span>
                {lang === "ar" ? "تأكيد تفعيل المتجر ونشر المساحة" : "Approve & Deploy Workspace"}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-900 text-xs space-y-1 font-mono">
              <p className="flex justify-between">
                <span className="text-muted-foreground">
                  {lang === "ar" ? "اسم المالك:" : "Owner Name:"}
                </span>
                <span className="font-semibold">{approvingRequest?.full_name}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">
                  {lang === "ar" ? "الرابط المطلوب:" : "Desired Domain:"}
                </span>
                <span className="font-semibold text-primary">
                  {approvingRequest?.desired_subdomain}.boutq.store
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                {lang === "ar" ? "اختر باقة تفعيل العميل" : "Select Deployment Access Plan"}
              </Label>

              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedPlan("lifetime")}
                  className={`p-4 rounded-lg border cursor-pointer text-left transition-all duration-150 flex flex-col justify-between ${
                    selectedPlan === "lifetime"
                      ? "border-primary dark:border-primary bg-primary/[0.02] ring-1 ring-primary"
                      : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-background"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1 w-full">
                    <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                      <Crown className="h-4 w-4 text-amber-500 shrink-0" />
                      {lang === "ar" ? "ترخيص مدى الحياة" : "Lifetime Access"}
                    </span>
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-500 border-none font-semibold text-[10px]"
                    >
                      {lang === "ar" ? "55 د.ب" : "55 BHD model"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {lang === "ar"
                      ? "تفعيل كامل مع 6 أشهر دعم فني مضمون للمتجر."
                      : "One-Time Platform License. Includes 6 months of active technical support guaranteed."}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPlan("trial")}
                  className={`p-4 rounded-lg border cursor-pointer text-left transition-all duration-150 flex flex-col justify-between ${
                    selectedPlan === "trial"
                      ? "border-primary dark:border-primary bg-primary/[0.02] ring-1 ring-primary"
                      : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-background"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1 w-full">
                    <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                      <ClockIcon className="h-4 w-4 text-rose-500 shrink-0" />
                      {lang === "ar" ? "نسخة تجريبية 3 أيام" : "3-Day Free Trial"}
                    </span>
                    <Badge
                      variant="outline"
                      className="bg-rose-500/10 text-rose-500 border-none font-semibold text-[10px]"
                    >
                      {lang === "ar" ? "وصول مؤقت" : "Temporary"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {lang === "ar"
                      ? "تفعيل متجر مجاني تجريبي مؤقت ينتهي تلقائياً بعد 3 أيام."
                      : "Temporary access. Sets brand to trial status with trial_ends_at set to 3 days from now."}
                  </p>
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 sm:flex-row flex-col">
            <Button
              variant="outline"
              onClick={() => setApprovingRequest(null)}
              disabled={deploying}
              className="text-xs h-9 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={executeApproval}
              disabled={deploying}
              className="text-xs h-9 bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
            >
              {deploying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              <span>{lang === "ar" ? "تأكيد ونشر" : "Confirm & Deploy"}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
