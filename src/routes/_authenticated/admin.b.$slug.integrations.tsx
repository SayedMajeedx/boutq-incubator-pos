import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plug,
  Plus,
  Pencil,
  Trash2,
  Copy,
  ShieldAlert,
  Mail,
  RefreshCw,
  Sparkles,
  CreditCard,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { useT, useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";

import { IntegrationsCommandHeader } from "@/components/integrations/IntegrationsCommandHeader";
import {
  IntegrationsScopeSwitcher,
  type IntegrationsCategoryScope,
} from "@/components/integrations/IntegrationsScopeSwitcher";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/integrations")({
  component: IntegrationsPage,
});

type Row = {
  id: string;
  brand_id: string;
  provider: string;
  base_url: string | null;
  api_key_masked: string | null;
  webhook_secret_masked: string | null;
  has_api_key: boolean;
  has_webhook_secret: boolean;
  is_active: boolean;
  notes: string | null;
  updated_at: string;
};

const PROVIDER_PRESETS = [
  { value: "aramex", label: "Aramex" },
  { value: "posta_plus", label: "Posta Plus" },
  { value: "stripe", label: "Stripe" },
  { value: "tap", label: "Tap Payments" },
  { value: "benefit", label: "Benefit Pay" },
  { value: "gemini", label: "Gemini AI translation & copywriting" },
  { value: "resend_customer_email", label: "Resend Customer Email" },
  { value: "sendpulse_admin", label: "SendPulse Admin Notifications" },
  { value: "custom", label: "Custom" },
];

const getProviderIcon = (provider: string) => {
  if (provider === "gemini") return <Sparkles className="h-5 w-5 text-purple-500" />;
  if (provider === "resend_customer_email" || provider === "sendpulse_admin")
    return <Mail className="h-5 w-5 text-primary" />;
  if (provider === "stripe" || provider === "tap" || provider === "benefit")
    return <CreditCard className="h-5 w-5 text-indigo-500" />;
  if (provider === "aramex" || provider === "posta_plus")
    return <Truck className="h-5 w-5 text-amber-500" />;
  return <Plug className="h-5 w-5 text-muted-foreground" />;
};

function IntegrationsPage() {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const brandId = brand.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [categoryScope, setCategoryScope] = useState<IntegrationsCategoryScope>("all");

  const q = useQuery({
    queryKey: ["integrations", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("list_integration_credentials", {
        p_brand_id: brandId,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const del = async (id: string) => {
    if (!confirm(isAr ? "حذف هذا التكامل؟" : "Delete this integration?")) return;
    const { error } = await (supabase.rpc as any)("delete_integration_credential", {
      p_id: id,
      p_brand_id: brandId,
    });
    if (error) return toast.error(error.message);
    toast.success(t("common.delete"));
    qc.invalidateQueries({ queryKey: ["integrations", brandId] });
  };

  const rawIntegrationsData = q.data;
  const integrationsList = useMemo(() => rawIntegrationsData ?? [], [rawIntegrationsData]);
  const filteredIntegrations = useMemo(() => {
    return integrationsList.filter((row) => {
      if (categoryScope === "payments") {
        return row.provider === "stripe" || row.provider === "tap" || row.provider === "benefit";
      }
      if (categoryScope === "shipping") {
        return row.provider === "aramex" || row.provider === "posta_plus";
      }
      if (categoryScope === "email_ai") {
        return (
          row.provider === "resend_customer_email" ||
          row.provider === "sendpulse_admin" ||
          row.provider === "gemini"
        );
      }
      return true;
    });
  }, [integrationsList, categoryScope]);

  const webhookBase =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/webhooks`
      : "https://…/api/public/webhooks";

  if (q.isError) {
    return (
      <Card className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border-destructive/30 p-6 text-center">
        <ShieldAlert className="h-8 w-8 text-destructive" aria-hidden="true" />
        <h1 className="text-lg font-bold">
          {isAr ? "تعذّر تحميل التكاملات" : "Integrations could not be loaded"}
        </h1>
        <Button
          type="button"
          variant="outline"
          onClick={() => void q.refetch()}
          className="min-h-11 gap-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {isAr ? "إعادة المحاولة" : "Try again"}
        </Button>
      </Card>
    );
  }

  if (q.isLoading) {
    return (
      <div
        role="status"
        aria-label={isAr ? "جاري تحميل التكاملات" : "Loading integrations"}
        className="space-y-3.5"
      >
        <div className="h-32 animate-pulse rounded-2xl bg-muted/70" />
        <div className="h-14 animate-pulse rounded-2xl bg-muted/60" />
        <div className="h-48 animate-pulse rounded-2xl bg-muted/50" />
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* 1. Command Header */}
      <IntegrationsCommandHeader
        lang={isAr ? "ar" : "en"}
        brandName={(isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug}
        integrationCount={integrationsList.length}
        onNewIntegration={() => {
          setEditing(null);
          setOpen(true);
        }}
      />

      {/* 2. Scope Switcher */}
      <IntegrationsScopeSwitcher
        lang={isAr ? "ar" : "en"}
        activeScope={categoryScope}
        onScopeChange={(scope) => setCategoryScope(scope)}
        integrationCount={integrationsList.length}
      />

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <IntegrationDialog
          brandId={brandId}
          row={editing}
          onSaved={() => {
            setOpen(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["integrations", brandId] });
          }}
        />
      </Dialog>

      {categoryScope === "pixels" ? (
        <AnalyticsTrackingCard brandId={brandId} isAr={isAr} />
      ) : (
        <>
          <Card className="overflow-hidden border border-amber-500/40 shadow-md rounded-2xl bg-amber-500/5 p-4">
            <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
              <ShieldAlert className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
              <p className="leading-relaxed">{t("integrations.warning")}</p>
            </div>
          </Card>

          {filteredIntegrations.length === 0 ? (
            <Card className="overflow-hidden border border-dashed border-border/80 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-8 sm:p-12 text-center">
              <Plug className="h-10 w-10 mx-auto text-muted-foreground mb-3 animate-pulse" />
              <p className="text-muted-foreground">{t("integrations.none")}</p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredIntegrations.map((row) => {
                const webhookUrl = `${webhookBase}/${row.provider}/${brandId}`;
                const preset = PROVIDER_PRESETS.find((p) => p.value === row.provider);
                const isNoWebhookProvider =
                  row.provider === "resend_customer_email" ||
                  row.provider === "sendpulse_admin" ||
                  row.provider === "gemini";
                return (
                  <Card
                    key={row.id}
                    className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-3 sm:p-6 transition-all duration-300 hover:border-primary/40 hover:shadow-xl"
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 rounded-lg bg-secondary/50 border border-secondary shrink-0">
                          {getProviderIcon(row.provider)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-display text-xl font-bold tracking-tight text-foreground truncate">
                            {preset?.label ?? row.provider}
                          </div>
                          <div className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                            {row.base_url || (row.provider === "gemini" ? "gemini-1.5-flash" : "—")}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                            row.is_active
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-slate-500/10 text-slate-500 border-slate-500/20"
                          }`}
                        >
                          {row.is_active ? t("integrations.active") : isAr ? "معطّل" : "Off"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(row);
                            setOpen(true);
                          }}
                          aria-label={
                            isAr
                              ? `تعديل ${preset?.label ?? row.provider}`
                              : `Edit ${preset?.label ?? row.provider}`
                          }
                          className="h-11 w-11 text-muted-foreground hover:text-foreground sm:h-8 sm:w-8 transition-all"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => del(row.id)}
                          aria-label={
                            isAr
                              ? `حذف ${preset?.label ?? row.provider}`
                              : `Delete ${preset?.label ?? row.provider}`
                          }
                          className="h-11 w-11 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8 transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-secondary/20 border border-secondary/30 rounded-lg p-4">
                      <MaskedRow
                        label={
                          row.provider === "resend_customer_email"
                            ? isAr
                              ? "بريد المُرسل المعتمد"
                              : "Verified sender email"
                            : row.provider === "gemini"
                              ? isAr
                                ? "نموذج الذكاء الاصطناعي (اختياري)"
                                : "AI Model (Optional)"
                              : t("integrations.apiKey")
                        }
                        value={
                          row.provider === "gemini"
                            ? row.base_url || "gemini-1.5-flash"
                            : row.api_key_masked
                        }
                      />
                      <MaskedRow
                        label={
                          row.provider === "resend_customer_email"
                            ? isAr
                              ? "مفتاح API الخاص بـ Resend"
                              : "Resend API key"
                            : row.provider === "gemini"
                              ? isAr
                                ? "مفتاح API الخاص بـ Gemini"
                                : "Gemini API key"
                              : t("integrations.webhookSecret")
                        }
                        value={
                          row.provider === "gemini" ? row.api_key_masked : row.webhook_secret_masked
                        }
                      />
                    </div>

                    <div className="mt-4 pt-4 border-t border-border/80 text-xs">
                      {isNoWebhookProvider ? (
                        <div className="flex items-center gap-2 text-muted-foreground bg-primary/5 border border-primary/10 rounded-lg px-3 py-2.5">
                          {row.provider === "gemini" ? (
                            <Sparkles className="h-4 w-4 text-purple-500 shrink-0" />
                          ) : (
                            <Mail className="h-4 w-4 text-primary shrink-0" />
                          )}
                          <p className="leading-normal">
                            {row.provider === "gemini"
                              ? isAr
                                ? "يتم استخدام تكامل Gemini هذا مباشرةً لترجمة عناوين المنتجات والوصف تلقائياً وتفصيل مخرجات صياغة المحتوى الثنائي اللغة."
                                : "This Gemini integration is used directly for super-high-quality storefront translations and product copywriting."
                              : isAr
                                ? "يستخدم هذا المزود مباشرةً من خدمة البريد الآمنة في Boutق عبر اتصال بروتوكول HTTP الآمن. لا يلزم إعداد رابط Webhook لدى المزود."
                                : "This provider is used directly by Boutq's secure email service over high-speed HTTPS. No provider webhook URL is required."}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-secondary/10 border border-secondary/20 rounded-lg p-3">
                          <p className="text-muted-foreground mb-1.5 font-medium">
                            {t("integrations.webhookHint")}
                          </p>
                          <div className="flex min-w-0 items-center gap-2 bg-background/50 border rounded-md p-1.5 ps-3">
                            <code className="flex-1 truncate font-mono text-xs">{webhookUrl}</code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard?.writeText(webhookUrl);
                                toast.success("Copied");
                              }}
                              aria-label={isAr ? "نسخ رابط Webhook" : "Copy webhook URL"}
                              className="h-7 px-2 shrink-0"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {row.notes && (
                      <p className="text-xs text-muted-foreground mt-3 italic bg-secondary/10 px-3 py-1.5 rounded border border-secondary/20">
                        {row.notes}
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

type TrackingForm = {
  google_analytics_enabled: boolean;
  google_analytics_id: string;
  meta_pixel_enabled: boolean;
  meta_pixel_id: string;
  consent_required: boolean;
};

function AnalyticsTrackingCard({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const [saving, setSaving] = useState(false);
  const defaults: TrackingForm = {
    google_analytics_enabled: false,
    google_analytics_id: "",
    meta_pixel_enabled: false,
    meta_pixel_id: "",
    consent_required: true,
  };
  const [form, setForm] = useState<TrackingForm>(defaults);
  const q = useQuery({
    queryKey: ["brand-tracking-settings", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brand_tracking_settings")
        .select("*")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data as Partial<TrackingForm> | null;
    },
  });
  useEffect(() => {
    if (!q.data) return;
    setForm({
      google_analytics_enabled: Boolean(q.data.google_analytics_enabled),
      google_analytics_id: q.data.google_analytics_id ?? "",
      meta_pixel_enabled: Boolean(q.data.meta_pixel_enabled),
      meta_pixel_id: q.data.meta_pixel_id ?? "",
      consent_required: q.data.consent_required ?? true,
    });
  }, [q.data]);
  const save = async () => {
    const ga = form.google_analytics_id.trim().toUpperCase();
    const meta = form.meta_pixel_id.trim();
    if (form.google_analytics_enabled && !/^G-[A-Z0-9]+$/.test(ga))
      return toast.error(
        isAr
          ? "أدخل معرّف GA4 صحيحاً مثل G-XXXXXXXXXX"
          : "Enter a valid GA4 ID such as G-XXXXXXXXXX",
      );
    if (form.meta_pixel_enabled && !/^\d{5,30}$/.test(meta))
      return toast.error(
        isAr
          ? "معرّف Meta Pixel يجب أن يحتوي أرقاماً فقط"
          : "Meta Pixel ID must contain digits only",
      );
    setSaving(true);
    const { error } = await (supabase as any).from("brand_tracking_settings").upsert(
      {
        brand_id: brandId,
        google_analytics_enabled: form.google_analytics_enabled,
        google_analytics_id: ga || null,
        meta_pixel_enabled: form.meta_pixel_enabled,
        meta_pixel_id: meta || null,
        consent_required: form.consent_required,
      },
      { onConflict: "brand_id" },
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isAr ? "تم حفظ إعدادات التتبع" : "Tracking settings saved");
  };
  return (
    <Card className="mb-6 p-3 sm:p-5" dir={isAr ? "rtl" : "ltr"}>
      <div className="mb-4">
        <h2 className="font-display text-xl">
          {isAr ? "التحليلات والتتبع" : "Analytics & Tracking"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "أدخل المعرّفات الرسمية فقط. لا يتم قبول أكواد أو نصوص برمجية مخصصة."
            : "Enter official IDs only. Custom scripts are never accepted."}
        </p>
      </div>
      <div className="grid gap-4">
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>Google Analytics 4</Label>
              <p className="text-xs text-muted-foreground">G-XXXXXXXXXX</p>
            </div>
            <Switch
              checked={form.google_analytics_enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, google_analytics_enabled: v }))}
            />
          </div>
          <Input
            className="mt-3"
            dir="ltr"
            maxLength={32}
            value={form.google_analytics_id}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                google_analytics_id: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
              }))
            }
            placeholder="G-XXXXXXXXXX"
          />
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>Meta Pixel</Label>
              <p className="text-xs text-muted-foreground">
                {isAr ? "معرّف رقمي فقط" : "Numeric pixel ID only"}
              </p>
            </div>
            <Switch
              checked={form.meta_pixel_enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, meta_pixel_enabled: v }))}
            />
          </div>
          <Input
            className="mt-3"
            dir="ltr"
            inputMode="numeric"
            maxLength={30}
            value={form.meta_pixel_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, meta_pixel_id: e.target.value.replace(/\D/g, "") }))
            }
            placeholder="123456789012345"
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
          <div>
            <Label>{isAr ? "طلب موافقة الزائر" : "Require visitor consent"}</Label>
            <p className="text-xs text-muted-foreground">
              {isAr ? "موصى به للخصوصية والامتثال." : "Recommended for privacy and compliance."}
            </p>
          </div>
          <Switch
            checked={form.consent_required}
            onCheckedChange={(v) => setForm((f) => ({ ...f, consent_required: v }))}
          />
        </div>
        <Button onClick={save} disabled={saving || q.isLoading}>
          {saving
            ? isAr
              ? "جارٍ الحفظ..."
              : "Saving..."
            : isAr
              ? "حفظ إعدادات التتبع"
              : "Save tracking settings"}
        </Button>
      </div>
    </Card>
  );
}

function MaskedRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-1">
        <code className="flex-1 truncate bg-secondary/40 rounded px-2 py-1 text-xs">
          {value || "—"}
        </code>
      </div>
    </div>
  );
}

function IntegrationDialog({
  brandId,
  row,
  onSaved,
}: {
  brandId: string;
  row: Row | null;
  onSaved: () => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    provider: row?.provider ?? "aramex",
    provider_custom:
      row && !PROVIDER_PRESETS.find((p) => p.value === row.provider) ? row.provider : "",
    base_url: row?.base_url ?? "",
    api_key: "",
    webhook_secret: "",
    is_active: row?.is_active ?? true,
    notes: row?.notes ?? "",
  });
  useEffect(() => {
    setForm({
      provider: row?.provider ?? "aramex",
      provider_custom:
        row && !PROVIDER_PRESETS.find((provider) => provider.value === row.provider)
          ? row.provider
          : "",
      base_url: row?.base_url ?? "",
      api_key: "",
      webhook_secret: "",
      is_active: row?.is_active ?? true,
      notes: row?.notes ?? "",
    });
  }, [row]);
  const providerValue = useMemo(
    () => (form.provider === "custom" ? form.provider_custom.trim() : form.provider),
    [form.provider, form.provider_custom],
  );
  const isResendCustomerEmail = providerValue === "resend_customer_email";
  const isSendPulseAdmin = providerValue === "sendpulse_admin";
  const isGemini = providerValue === "gemini";
  const fieldLabels = isResendCustomerEmail
    ? {
        base: isAr ? "بريد المُرسل المعتمد" : "Verified sender email",
        api: isAr ? "مفتاح API الخاص بـ Resend" : "Resend API key",
        secret: isAr ? "غير مستخدم (اختياري)" : "Unused (optional)",
        basePlaceholder: "orders@yourbrand.com",
        apiPlaceholder: "re_123456789...",
        secretPlaceholder: "Unused / Optional",
        help: isAr
          ? "يُستخدم لإرسال رسائل تأكيد الطلب للعملاء عبر واجهة برمجة التطبيقات (API) الخاصة بـ Resend. أدخل بريدك الإلكتروني المعتمد ومفتاح API الخاص بك."
          : "Used for customer order emails via Resend's high-speed HTTP REST API. Enter your verified sender email and your Resend API Key.",
      }
    : isSendPulseAdmin
      ? {
          base: isAr ? "بريد المُرسل المعتمد" : "Verified sender email",
          api: isAr ? "معرّف عميل SendPulse" : "SendPulse client ID",
          secret: isAr ? "سر عميل SendPulse" : "SendPulse client secret",
          basePlaceholder: "notifications@yourbrand.com",
          apiPlaceholder: "SendPulse client ID",
          secretPlaceholder: "SendPulse client secret",
          help: isAr
            ? "يُستخدم لإرسال تفاصيل الطلب الداخلية إلى مديري هذه العلامة التجارية فقط."
            : "Used only for internal notifications sent to this brand's active administrators.",
        }
      : isGemini
        ? {
            base: isAr
              ? "نموذج الذكاء الاصطناعي (اختياري - الافتراضي: gemini-1.5-flash)"
              : "AI Model (Optional - Default: gemini-1.5-flash)",
            api: isAr ? "مفتاح API الخاص بـ Gemini" : "Gemini API Key",
            secret: isAr ? "غير مستخدم (اختياري)" : "Unused (optional)",
            basePlaceholder: "gemini-1.5-flash",
            apiPlaceholder: "AIzaSy...",
            secretPlaceholder: "Unused / Optional",
            help: isAr
              ? "تُستخدم لتمكين الترجمة الفورية والذكية وميزات صياغة المحتوى الثنائي اللغة للمنتجات والوصف."
              : "Used to enable super-high-quality automated bilingual translations and product copywriting in your catalog.",
          }
        : {
            base: t("integrations.baseUrl"),
            api: t("integrations.apiKey"),
            secret: t("integrations.webhookSecret"),
            basePlaceholder: "https://api.provider.com",
            apiPlaceholder: "sk_live_…",
            secretPlaceholder: "whsec_…",
            help: null,
          };

  const save = async () => {
    if (!providerValue) return toast.error(isAr ? "اسم الخدمة مطلوب" : "Provider is required");
    setSaving(true);
    const { error } = await (supabase.rpc as any)("save_integration_credential", {
      p_id: row?.id ?? null,
      p_brand_id: brandId,
      p_provider: providerValue,
      p_base_url: form.base_url.trim(),
      p_api_key: form.api_key.trim(),
      p_webhook_secret: form.webhook_secret.trim(),
      p_is_active: form.is_active,
      p_notes: form.notes.trim(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("common.save"));
    onSaved();
  };

  return (
    <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle>
          {row ? (isAr ? "تعديل التكامل" : "Edit integration") : t("integrations.new")}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>{t("integrations.provider")}</Label>
          <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.provider === "custom" && (
            <Input
              className="mt-2"
              placeholder={isAr ? "اسم الخدمة" : "Custom provider name"}
              value={form.provider_custom}
              onChange={(e) => setForm({ ...form, provider_custom: e.target.value })}
            />
          )}
        </div>
        {fieldLabels.help && (
          <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
            {fieldLabels.help}
          </p>
        )}
        <div>
          <Label>{fieldLabels.base}</Label>
          <Input
            value={form.base_url}
            onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            placeholder={fieldLabels.basePlaceholder}
          />
        </div>
        <div>
          <Label>{fieldLabels.api}</Label>
          <Input
            type="password"
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            placeholder={
              row?.has_api_key
                ? isAr
                  ? "اتركه فارغاً للاحتفاظ بالمفتاح الحالي"
                  : "Leave blank to keep the current key"
                : fieldLabels.apiPlaceholder
            }
          />
        </div>
        <div>
          <Label>{fieldLabels.secret}</Label>
          <Input
            type="password"
            value={form.webhook_secret}
            onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })}
            placeholder={
              row?.has_webhook_secret
                ? isAr
                  ? "اتركه فارغاً للاحتفاظ بالسر الحالي"
                  : "Leave blank to keep the current secret"
                : fieldLabels.secretPlaceholder
            }
          />
        </div>
        <div>
          <Label>{t("integrations.notes")}</Label>
          <Textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="flex items-center justify-between border border-border rounded-md p-3">
          <p className="text-sm font-medium">{t("integrations.active")}</p>
          <Switch
            checked={form.is_active}
            onCheckedChange={(v) => setForm({ ...form, is_active: v })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving} className="min-h-11 w-full sm:w-auto">
          {t("common.save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
