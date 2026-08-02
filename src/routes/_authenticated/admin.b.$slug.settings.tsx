import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Eye, EyeOff } from "lucide-react";
import { useT, useI18n } from "@/lib/i18n";
import { PhoneInput } from "@/components/phone-input";
import { Rnd } from "react-rnd";
import { useBrand } from "@/lib/brand-context";
import { Switch } from "@/components/ui/switch";
import { Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { formatMoney } from "@/lib/format";
import { PasskeySettings } from "@/components/passkey-settings";
import { SubscriptionCard } from "@/components/subscription-card";
import { SupportAccessCard } from "@/components/support-access-card";
import { META_DESCRIPTION_LIMIT, META_TITLE_LIMIT, sanitizeMetaText } from "@/lib/seo";
import { ImageCropperDialog } from "@/components/image-cropper-dialog";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/settings")({
  beforeLoad: async ({ params }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("role, status, email, permissions")
      .eq("id", user.id)
      .maybeSingle();

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === "majeed@hotmail.it";
    const role = profile?.role;
    const status = profile?.status ?? "active";
    const permissions = (profile?.permissions as string[]) || [];
    const hasSettings = permissions.includes("manage_settings");
    const allowed =
      isFixedSuperAdmin ||
      ((role === "admin" ||
        role === "super_admin" ||
        role === "brand_admin" ||
        (role === "staff" && hasSettings)) &&
        status === "active");

    if (!allowed) {
      throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: params.slug } });
    }
  },
  component: Settings,
});

type Settings = {
  user_id: string;
  business_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  vat_number: string | null;
  currency: string;
  default_tax_rate: number;
  primary_color: string;
  footer_note: string | null;
  next_invoice_number: number;
  font_family: string;
  font_url: string | null;
  font_size: number;
  text_color: string;
  background_color: string;
  logo_size: number;
  logo_x: number;
  logo_y: number;
  logo_width: number;
  logo_height: number;
  invoice_template: "modern" | "classic" | "minimal";
  invoice_secondary_color: string | null;
  invoice_show_business_details: boolean;
  invoice_show_customer_contact: boolean;
  invoice_show_fulfillment: boolean;
  invoice_show_notes: boolean;
  invoice_title_en: string | null;
  invoice_title_ar: string | null;
};

const LOGO_CANVAS_W = 600;
const LOGO_CANVAS_H = 220;

const FONT_PRESETS = [
  "Cormorant Garamond",
  "Playfair Display",
  "Inter",
  "Roboto",
  "Lato",
  "Montserrat",
  "Open Sans",
  "Poppins",
  "Georgia",
  "Times New Roman",
  "Arial",
  "Helvetica",
  "Custom (uploaded)",
];

const STOREFRONT_EN_FONTS = [
  "Inter",
  "Poppins",
  "Montserrat",
  "Playfair Display",
  "Cormorant Garamond",
];
type HomePromoCard = {
  title_en: string;
  title_ar: string;
  subtitle_en: string;
  subtitle_ar: string;
  image_url: string;
  href: string;
  background_color: string;
  text_color: string;
};
const EMPTY_PROMO_CARD: HomePromoCard = {
  title_en: "",
  title_ar: "",
  subtitle_en: "",
  subtitle_ar: "",
  image_url: "",
  href: "",
  background_color: "#f4f4f4",
  text_color: "#ffffff",
};
const STOREFRONT_AR_FONTS = ["Tajawal", "Cairo", "Noto Sans Arabic", "Noto Kufi Arabic"];

function Settings() {
  const t = useT();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;
  const brandDisplayName =
    (lang === "ar" ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug;
  const LEGACY_NAMES = new Set(["My Abaya Boutique", "متجر عباياتي", ""]);
  const logoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<null | "logo" | "favicon" | "font">(null);

  const { data } = useQuery({
    queryKey: ["business-settings", brandId],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("business_settings")
        .select("*")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        const { data: created, error: e2 } = await (supabase.from("business_settings") as any)
          .insert({ user_id: user.id, brand_id: brandId })
          .select()
          .single();
        if (e2) throw e2;
        return created as Settings;
      }
      return data as Settings;
    },
  });

  const [f, setF] = useState<Settings | null>(null);
  const [activeTab, setActiveTab] = useState("business");
  useEffect(() => {
    if (data) {
      const trimmed = (data.business_name ?? "").trim();
      const name = LEGACY_NAMES.has(trimmed) ? brandDisplayName : trimmed;
      setF({ ...data, business_name: name });
    }
  }, [data, brandDisplayName]);

  if (!f) return <div className="p-8">Loading…</div>;

  const save = async () => {
    const { error } = await supabase
      .from("business_settings")
      .update({
        business_name: f.business_name,
        logo_url: f.logo_url,
        favicon_url: f.favicon_url,
        address: f.address,
        phone: f.phone,
        email: f.email,
        vat_number: f.vat_number,
        currency: f.currency,
        default_tax_rate: f.default_tax_rate,
        primary_color: f.primary_color,
        footer_note: f.footer_note,
        font_family: f.font_family,
        font_url: f.font_url,
        font_size: f.font_size,
        text_color: f.text_color,
        background_color: f.background_color,
        logo_size: f.logo_size,
        logo_x: f.logo_x,
        logo_y: f.logo_y,
        logo_width: f.logo_width,
        logo_height: f.logo_height,
        invoice_template: f.invoice_template,
        invoice_secondary_color: f.invoice_secondary_color,
        invoice_show_business_details: f.invoice_show_business_details,
        invoice_show_customer_contact: f.invoice_show_customer_contact,
        invoice_show_fulfillment: f.invoice_show_fulfillment,
        invoice_show_notes: f.invoice_show_notes,
        invoice_title_en: f.invoice_title_en,
        invoice_title_ar: f.invoice_title_ar,
      })
      .eq("brand_id", brandId);
    if (error) toast.error(error.message);
    else {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["business-settings"] });
    }
  };

  const handleUpload = async (file: File, kind: "logo" | "favicon" | "font") => {
    try {
      setUploading(kind);
      const url = await uploadPublicMedia(brandId, file, kind);
      if (kind === "logo") setF({ ...f, logo_url: url });
      else if (kind === "favicon") setF({ ...f, favicon_url: url });
      else setF({ ...f, font_url: url, font_family: "Custom (uploaded)" });
      toast.success(
        `${kind === "logo" ? "Logo" : kind === "favicon" ? "Favicon" : "Font"} uploaded — remember to save`,
      );
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const previewFont =
    f.font_family === "Custom (uploaded)"
      ? "'CustomFont', sans-serif"
      : `"${f.font_family}", sans-serif`;

  const saveButton = (
    <div className="flex justify-end pt-2">
      <Button onClick={save}>{t("settings.save")}</Button>
    </div>
  );

  const TABS: { value: string; ar: string; en: string }[] = [
    { value: "business", ar: "الملف التجاري", en: "Business Profile" },
    { value: "invoice", ar: "إعدادات الفاتورة", en: "Invoice Settings" },
    { value: "storefront", ar: "إعدادات المتجر", en: "Storefront" },
    { value: "checkout", ar: "الشحن والاستلام", en: "Checkout & Fulfillment" },
    { value: "payments", ar: "طرق الدفع", en: "Payment Methods" },
    { value: "branches", ar: "الفروع", en: "Branches" },
    { value: "emails", ar: "الإشعارات والبريد", en: "Notifications & Emails" },
    { value: "security", ar: "الأمان والخصوصية", en: "Security & Privacy" },
    { value: "subscription", ar: "إدارة الاشتراك", en: "Platform Subscription" },
  ];
  const TAB_HEADERS: Record<
    string,
    { en: string; enDescription: string; ar: string; arDescription: string }
  > = {
    business: {
      en: "Business Profile Settings",
      enDescription: "Manage your business identity and contact information.",
      ar: "إعدادات الملف التجاري",
      arDescription: "إدارة هوية النشاط ومعلومات التواصل.",
    },
    invoice: {
      en: "Invoice Settings",
      enDescription: "Customize how your invoices look and print.",
      ar: "إعدادات الفاتورة",
      arDescription: "تخصيص شكل الفاتورة والطباعة.",
    },
    storefront: {
      en: "Storefront Settings",
      enDescription: "Customize your public store appearance and content.",
      ar: "إعدادات واجهة المتجر",
      arDescription: "تخصيص مظهر ومحتوى المتجر العام.",
    },
    checkout: {
      en: "Checkout & Fulfillment Settings",
      enDescription: "Manage fulfillment methods, delivery options, and global flat rates.",
      ar: "إعدادات الدفع والتسليم",
      arDescription: "إدارة طرق التسليم وخيارات التوصيل والرسوم العامة الثابتة.",
    },
    payments: {
      en: "Payment Method Settings",
      enDescription: "Choose the payment methods available to customers.",
      ar: "إعدادات طرق الدفع",
      arDescription: "اختيار طرق الدفع المتاحة للعملاء.",
    },
    branches: {
      en: "Branch Settings",
      enDescription: "Manage pickup locations and branch information.",
      ar: "إعدادات الفروع",
      arDescription: "إدارة مواقع الاستلام وبيانات الفروع.",
    },
    emails: {
      en: "Notifications & Email Settings",
      enDescription: "Configure customer notifications and outgoing email.",
      ar: "إعدادات الإشعارات والبريد",
      arDescription: "إعداد إشعارات العملاء والبريد الصادر.",
    },
    security: {
      en: "Security & Privacy Settings",
      enDescription:
        "Manage your biometric passkeys, account security, and Boutq troubleshooting access.",
      ar: "إعدادات الأمان والخصوصية",
      arDescription: "إدارة بصمة المرور، وأمان الحساب، وصلاحيات وصول مهندسي الدعم الفني لبوتك.",
    },
    subscription: {
      en: "Subscription Settings",
      enDescription: "Manage your boutique platform license and technical support options.",
      ar: "إعدادات الاشتراك",
      arDescription: "إدارة ترخيص منصة البوتيك وخيارات الدعم الفني.",
    },
  };
  const activeHeader = TAB_HEADERS[activeTab] ?? TAB_HEADERS.business;

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8 animate-fade-in"
    >
      {f.font_url && (
        <style>{`@font-face { font-family: 'CustomFont'; src: url('${f.font_url}'); font-display: swap; }`}</style>
      )}
      <div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 dark:from-slate-50 dark:to-slate-300 mb-2">
          {lang === "ar" ? activeHeader.ar : activeHeader.en}
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
          {lang === "ar" ? activeHeader.arDescription : activeHeader.enDescription}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="sticky top-16 z-20 mb-4 rounded-xl border border-border/60 bg-background/95 p-2 shadow-sm backdrop-blur sm:hidden">
          <Label className="mb-1.5 block px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {lang === "ar" ? "قسم الإعدادات" : "Settings section"}
          </Label>
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="h-11 w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TABS.map((tab) => (
                <SelectItem key={tab.value} value={tab.value}>
                  {lang === "ar" ? tab.ar : tab.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TabsList className="mb-6 hidden h-auto w-full flex-wrap justify-start gap-1.5 rounded-xl border border-border/40 bg-muted/40 p-1.5 backdrop-blur-sm sm:flex">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-lg py-2 px-3 text-xs sm:text-sm font-medium transition-all duration-200 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-foreground hover:bg-background/20"
            >
              {lang === "ar" ? tab.ar : tab.en}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="business" className="space-y-6 mt-0">
          <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
            <h2 className="font-display text-xl font-bold">{t("settings.business")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("settings.businessName")}</Label>
                <Input
                  value={f.business_name}
                  onChange={(e) => setF({ ...f, business_name: e.target.value })}
                />
              </div>
              <div>
                <Label>{t("settings.logo")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={f.logo_url ?? ""}
                    placeholder="https://..."
                    onChange={(e) => setF({ ...f, logo_url: e.target.value })}
                  />
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "logo")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => logoInput.current?.click()}
                    disabled={uploading === "logo"}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>{lang === "ar" ? "أيقونة المتجر" : "Store favicon"}</Label>
                <div className="flex gap-2">
                  <Input
                    value={f.favicon_url ?? ""}
                    placeholder="https://… (SVG, PNG, ICO)"
                    onChange={(e) => setF({ ...f, favicon_url: e.target.value })}
                  />
                  <input
                    ref={faviconInput}
                    type="file"
                    accept="image/svg+xml,image/png,image/x-icon,image/vnd.microsoft.icon,image/webp"
                    className="hidden"
                    onChange={(e) =>
                      e.target.files?.[0] && handleUpload(e.target.files[0], "favicon")
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => faviconInput.current?.click()}
                    disabled={uploading === "favicon"}
                    aria-label={lang === "ar" ? "رفع أيقونة المتجر" : "Upload favicon"}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {lang === "ar"
                    ? "يفضل ملف SVG أو PNG مربع. عند تركه فارغاً سيتم استخدام شعار المتجر."
                    : "A square SVG or PNG works best. Leave blank to use the brand logo."}
                </p>
              </div>
            </div>
            <div>
              <Label>{t("settings.address")}</Label>
              <Textarea
                value={f.address ?? ""}
                onChange={(e) => setF({ ...f, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("settings.phone")}</Label>
                <PhoneInput value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
              </div>
              <div>
                <Label>{t("settings.email")}</Label>
                <Input
                  value={f.email ?? ""}
                  onChange={(e) => setF({ ...f, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label>{t("settings.vat")}</Label>
                <Input
                  value={f.vat_number ?? ""}
                  onChange={(e) => setF({ ...f, vat_number: e.target.value })}
                />
              </div>
              <div>
                <Label>{t("settings.currency")}</Label>
                <Input
                  value={f.currency}
                  onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <Label>{t("settings.defaultVat")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={f.default_tax_rate}
                  onChange={(e) => setF({ ...f, default_tax_rate: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3 bg-secondary/10">
              <div>
                <p className="text-sm font-medium">
                  {lang === "ar"
                    ? "أسعار المنتجات شاملة ضريبة القيمة المضافة"
                    : "Product prices are inclusive of Tax/VAT"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lang === "ar"
                    ? "إذا تم تفعيله، سيتم حساب ضريبة القيمة المضافة كجزء من السعر الحالي بدلاً من إضافتها فوقه"
                    : "If enabled, VAT is derived as part of the current price instead of appended on top"}
                </p>
              </div>
              <Switch
                checked={(f as any).vat_inclusive ?? false}
                onCheckedChange={(v) => setF({ ...f, vat_inclusive: v } as any)}
              />
            </div>
            <div>
              <Label>{t("settings.footer")}</Label>
              <Textarea
                placeholder={t("settings.footerPh")}
                value={f.footer_note ?? ""}
                onChange={(e) => setF({ ...f, footer_note: e.target.value })}
              />
            </div>
          </Card>
          {saveButton}
        </TabsContent>

        <TabsContent value="invoice" className="space-y-6 mt-0">
          <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
            <h2 className="font-display text-xl">{t("settings.appearance")}</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("settings.fontFamily")}</Label>
                <Select value={f.font_family} onValueChange={(v) => setF({ ...f, font_family: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_PRESETS.map((x) => (
                      <SelectItem key={x} value={x}>
                        {x}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("settings.uploadFont")}</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={f.font_url ? t("settings.uploaded") : ""}
                    placeholder={t("settings.noFile")}
                  />
                  <input
                    ref={fontInput}
                    type="file"
                    accept=".woff,.woff2,.ttf,.otf"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "font")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => fontInput.current?.click()}
                    disabled={uploading === "font"}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label>{t("settings.fontSize")}</Label>
                <Input
                  type="number"
                  min={10}
                  max={24}
                  value={f.font_size}
                  onChange={(e) => setF({ ...f, font_size: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>{t("settings.logoHeight")}</Label>
                <Input
                  type="number"
                  min={24}
                  max={200}
                  value={f.logo_size}
                  onChange={(e) => setF({ ...f, logo_size: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>{t("settings.accent")}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={f.primary_color}
                    onChange={(e) => setF({ ...f, primary_color: e.target.value })}
                    className="h-9 w-12 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={f.primary_color}
                    onChange={(e) => setF({ ...f, primary_color: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("settings.textColor")}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={f.text_color}
                    onChange={(e) => setF({ ...f, text_color: e.target.value })}
                    className="h-9 w-12 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={f.text_color}
                    onChange={(e) => setF({ ...f, text_color: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>{t("settings.bgColor")}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={f.background_color}
                    onChange={(e) => setF({ ...f, background_color: e.target.value })}
                    className="h-9 w-12 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={f.background_color}
                    onChange={(e) => setF({ ...f, background_color: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-4">
              <div>
                <h3 className="font-medium">
                  {lang === "ar" ? "قالب الفاتورة" : "Invoice template"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {lang === "ar"
                    ? "يطبق على المعاينة وملف PDF والرابط العام."
                    : "Applies to the preview, PDF download, and public invoice link."}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(["modern", "classic", "minimal"] as const).map((template) => (
                  <Button
                    key={template}
                    type="button"
                    variant={f.invoice_template === template ? "default" : "outline"}
                    onClick={() => setF({ ...f, invoice_template: template })}
                    className="capitalize"
                  >
                    {template}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>
                    {lang === "ar" ? "عنوان الفاتورة بالإنجليزية" : "English invoice title"}
                  </Label>
                  <Input
                    value={f.invoice_title_en ?? ""}
                    placeholder="INVOICE"
                    onChange={(e) => setF({ ...f, invoice_title_en: e.target.value || null })}
                  />
                </div>
                <div>
                  <Label>
                    {lang === "ar" ? "عنوان الفاتورة بالعربية" : "Arabic invoice title"}
                  </Label>
                  <Input
                    dir="rtl"
                    value={f.invoice_title_ar ?? ""}
                    placeholder="فاتورة"
                    onChange={(e) => setF({ ...f, invoice_title_ar: e.target.value || null })}
                  />
                </div>
                <div>
                  <Label>{lang === "ar" ? "اللون الثانوي" : "Secondary color"}</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={f.invoice_secondary_color ?? "#f5f5f5"}
                      onChange={(e) => setF({ ...f, invoice_secondary_color: e.target.value })}
                      className="h-9 w-12 rounded border"
                    />
                    <Input
                      value={f.invoice_secondary_color ?? ""}
                      placeholder="#f5f5f5"
                      onChange={(e) =>
                        setF({ ...f, invoice_secondary_color: e.target.value || null })
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    [
                      "invoice_show_business_details",
                      lang === "ar" ? "إظهار بيانات النشاط" : "Show business details",
                    ],
                    [
                      "invoice_show_customer_contact",
                      lang === "ar" ? "إظهار بيانات العميل" : "Show customer contact",
                    ],
                    [
                      "invoice_show_fulfillment",
                      lang === "ar" ? "إظهار بيانات التسليم" : "Show fulfillment details",
                    ],
                    [
                      "invoice_show_notes",
                      lang === "ar" ? "إظهار الملاحظات" : "Show notes and footer",
                    ],
                  ] as const
                ).map(([key, label]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <Label>{label}</Label>
                    <Switch
                      checked={f[key]}
                      onCheckedChange={(checked) => setF({ ...f, [key]: checked })}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div
              className="rounded-md border border-border p-6 mt-2"
              style={{
                backgroundColor: f.background_color,
                color: f.text_color,
                fontFamily: previewFont,
                fontSize: `${f.font_size}px`,
              }}
            >
              <div style={{ borderTop: `4px solid ${f.primary_color}`, marginBottom: 12 }} />
              {f.logo_url && (
                <img
                  src={f.logo_url}
                  alt="logo"
                  style={{ height: f.logo_size, objectFit: "contain", marginBottom: 8 }}
                />
              )}
              <div
                style={{
                  color: f.primary_color,
                  fontSize: `${f.font_size * 1.6}px`,
                  fontWeight: 600,
                }}
              >
                {f.business_name || t("settings.businessName")}
              </div>
              <p style={{ marginTop: 6 }}>{t("settings.previewText")}</p>
            </div>
          </Card>

          {f.logo_url && (
            <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl">Invoice logo position &amp; size</h2>
                  <p className="text-sm text-muted-foreground">
                    Drag the logo to reposition it and drag any corner to resize. This will be
                    applied to every invoice.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setF({ ...f, logo_x: 0, logo_y: 0, logo_width: 160, logo_height: 64 })
                  }
                >
                  Reset
                </Button>
              </div>

              <div
                className="relative mx-auto border border-dashed border-border rounded-md bg-white overflow-hidden"
                style={{ width: LOGO_CANVAS_W, height: LOGO_CANVAS_H }}
              >
                <Rnd
                  size={{ width: f.logo_width, height: f.logo_height }}
                  position={{ x: f.logo_x, y: f.logo_y }}
                  onDragStop={(_e, d) => setF({ ...f, logo_x: d.x, logo_y: d.y })}
                  onResizeStop={(_e, _dir, ref, _delta, pos) =>
                    setF({
                      ...f,
                      logo_width: parseInt(ref.style.width, 10),
                      logo_height: parseInt(ref.style.height, 10),
                      logo_x: pos.x,
                      logo_y: pos.y,
                    })
                  }
                  bounds="parent"
                  lockAspectRatio
                  className="border border-dashed border-neutral-300 hover:border-neutral-500"
                >
                  <img
                    src={f.logo_url}
                    alt="logo"
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      pointerEvents: "none",
                    }}
                  />
                </Rnd>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <Label>X</Label>
                  <Input
                    type="number"
                    value={f.logo_x}
                    onChange={(e) => setF({ ...f, logo_x: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Y</Label>
                  <Input
                    type="number"
                    value={f.logo_y}
                    onChange={(e) => setF({ ...f, logo_y: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Width</Label>
                  <Input
                    type="number"
                    value={f.logo_width}
                    onChange={(e) => setF({ ...f, logo_width: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Height</Label>
                  <Input
                    type="number"
                    value={f.logo_height}
                    onChange={(e) => setF({ ...f, logo_height: Number(e.target.value) })}
                  />
                </div>
              </div>
            </Card>
          )}
          {saveButton}
        </TabsContent>

        <TabsContent value="storefront" className="space-y-6 mt-0">
          <StorefrontSeoCard brandId={brandId} />
          <StorefrontCustomizerCard brandId={brandId} />
        </TabsContent>

        <TabsContent value="checkout" className="space-y-6 mt-0">
          <ShippingSettingsCard brandId={brandId} />
        </TabsContent>

        <TabsContent value="payments" className="space-y-6 mt-0">
          <PaymentSettingsCard brandId={brandId} />
        </TabsContent>

        <TabsContent value="branches" className="space-y-6 mt-0">
          <BranchesCard brandId={brandId} />
        </TabsContent>

        <TabsContent value="emails" className="space-y-6 mt-0">
          <EmailSettingsCard brandId={brandId} />
        </TabsContent>

        <TabsContent value="security" className="space-y-6 mt-0">
          <SupportAccessCard brand={brand} />
          <PasskeySettings />
        </TabsContent>

        <TabsContent value="subscription" className="mt-0">
          <SubscriptionCard brand={brand} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type MediaItem = { type: "image" | "video"; url: string };
type HeroSlide = {
  id: string;
  type: "text" | "image" | "video";
  title_en: string;
  title_ar: string;
  body_en: string;
  body_ar: string;
  media_url: string;
  media_url_en?: string;
  media_url_ar?: string;
  media_stream_uid_en?: string;
  media_stream_uid_ar?: string;
  media_iframe_url_en?: string;
  media_iframe_url_ar?: string;
  media_poster_url_en?: string;
  media_poster_url_ar?: string;
  button_en: string;
  button_ar: string;
  button_href: string;
};
type HeroState = {
  background: MediaItem | null;
  slides: HeroSlide[];
  primary_color: string | null;
  about_ar: string | null;
  about_en: string | null;
};
const emptyHeroSlide = (): HeroSlide => ({
  id: crypto.randomUUID(),
  type: "text",
  title_en: "",
  title_ar: "",
  body_en: "",
  body_ar: "",
  media_url: "",
  button_en: "Shop now",
  button_ar: "تسوّق الآن",
  button_href: "#products",
});

async function heroVideoDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("Unable to read video metadata"));
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PaymentSettingsCard({ brandId }: { brandId: string }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const qrInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [state, setState] = useState<{
    cod_enabled: boolean;
    card_enabled: boolean;
    benefit_enabled: boolean;
    benefit_qr_url: string | null;
    benefit_account_number: string;
    card_processing_fee: number;
    benefit_processing_fee: number;
    card_public_key: string;
    card_secret_key: string;
  } | null>(null);

  const { data } = useQuery({
    queryKey: ["business-settings-payments", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("business_settings") as any)
        .select(
          "cod_enabled, card_enabled, benefit_enabled, benefit_qr_url, benefit_account_number, card_processing_fee, benefit_processing_fee, card_public_key, card_secret_key",
        )
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (data)
      setState({
        cod_enabled: data.cod_enabled ?? true,
        card_enabled: data.card_enabled ?? false,
        benefit_enabled: data.benefit_enabled ?? false,
        benefit_qr_url: data.benefit_qr_url ?? null,
        benefit_account_number: (data as any).benefit_account_number ?? "",
        card_processing_fee: Number((data as any).card_processing_fee ?? 0),
        benefit_processing_fee: Number((data as any).benefit_processing_fee ?? 0),
        card_public_key: (data as any).card_public_key ?? "",
        card_secret_key: (data as any).card_secret_key ?? "",
      });
  }, [data]);

  const save = async () => {
    if (!state) return;
    setSaving(true);
    const { error } = await (supabase.from("business_settings") as any)
      .update(state)
      .eq("brand_id", brandId);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(isAr ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["business-settings-payments", brandId] });
    }
  };

  const uploadQr = async (file: File) => {
    try {
      setUploading(true);
      const url = await uploadPublicMedia(brandId, file, "payment-qr");
      setState((s) => (s ? { ...s, benefit_qr_url: url } : s));
      toast.success(isAr ? "تم رفع الرمز — لا تنسَ الحفظ" : "QR uploaded — remember to save");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!state) return null;

  return (
    <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold">
          {isAr ? "إعدادات الدفع" : "Payment Settings"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isAr
            ? "التحكم بوسائل الدفع المتاحة للعملاء في المتجر مع رسوم العمليات والمفاتيح"
            : "Control payment options, processing fees, and credentials"}
        </p>
      </div>

      <div className="space-y-4">
        {/* COD Block */}
        <div className="overflow-hidden rounded-xl border border-border/40 p-5 space-y-4 bg-background/40 backdrop-blur-sm shadow-sm transition-all duration-300 hover:scale-[1.005] hover:border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">
                {isAr ? "الدفع عند الاستلام" : "Cash on Delivery"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "تمكين العملاء من الدفع نقداً عند استلام الطلب"
                  : "Allow customers to pay in cash upon receiving their order"}
              </p>
            </div>
            <Switch
              checked={state.cod_enabled}
              onCheckedChange={(v) => setState({ ...state, cod_enabled: v })}
            />
          </div>
        </div>

        {/* Card Payment Block */}
        <div className="overflow-hidden rounded-xl border border-border/40 p-5 space-y-4 bg-background/40 backdrop-blur-sm shadow-sm transition-all duration-300 hover:scale-[1.005] hover:border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">
                {isAr ? "بوابة دفع بالبطاقة" : "Card Payment Gateways"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "تفعيل الدفع بالبطاقة الائتمانية عبر بوابة الدفع الآمنة"
                  : "Enable online credit/debit card processing"}
              </p>
            </div>
            <Switch
              checked={state.card_enabled}
              onCheckedChange={(v) => setState({ ...state, card_enabled: v })}
            />
          </div>
          {state.card_enabled && (
            <div className="pt-4 border-t border-border/50 space-y-4 animate-in fade-in-50 duration-200">
              <div>
                <Label className="text-xs font-semibold">
                  {isAr
                    ? "نسبة رسوم معالجة البطاقة المقدرة (%)"
                    : "Estimated Card Processing Fee (%)"}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={state.card_processing_fee}
                  onChange={(e) =>
                    setState({ ...state, card_processing_fee: Math.max(0, Number(e.target.value)) })
                  }
                  placeholder="2.50"
                  className="mt-1.5 bg-background/50 focus:bg-background transition-colors"
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {isAr
                    ? "تستخدم هذه النسبة تلقائياً في حسابات الأرباح والخسائر والمصاريف التشغيلية لكل طلب"
                    : "Calculated automatically in your P&L expenses for card transactions"}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">
                    {isAr ? "المفتاح العام (Public Key)" : "Public / Publishable API Key"}
                  </Label>
                  <Input
                    type="text"
                    value={state.card_public_key}
                    onChange={(e) => setState({ ...state, card_public_key: e.target.value })}
                    placeholder="pk_live_..."
                    className="mt-1.5 font-mono text-xs bg-background/50 focus:bg-background transition-colors"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">
                    {isAr
                      ? "المفتاح السري (Secret Key / Merchant ID)"
                      : "Secret API Key / Merchant ID"}
                  </Label>
                  <div className="relative mt-1.5">
                    <Input
                      type={showSecretKey ? "text" : "password"}
                      value={state.card_secret_key}
                      onChange={(e) => setState({ ...state, card_secret_key: e.target.value })}
                      placeholder="sk_live_..."
                      className="font-mono text-xs pe-10 bg-background/50 focus:bg-background transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="absolute inset-y-0 end-0 px-3 flex items-center text-muted-foreground hover:text-foreground"
                    >
                      {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Benefit Pay Block */}
        <div className="overflow-hidden rounded-xl border border-border/40 p-5 space-y-4 bg-background/40 backdrop-blur-sm shadow-sm transition-all duration-300 hover:scale-[1.005] hover:border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">
                {isAr ? "بنفت باي (BenefitPay)" : "BenefitPay"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "تفعيل تحويلات بنفت باي المباشرة مع إرفاق الإيصال"
                  : "Enable direct BenefitPay transfers with receipt uploads"}
              </p>
            </div>
            <Switch
              checked={state.benefit_enabled}
              onCheckedChange={(v) => setState({ ...state, benefit_enabled: v })}
            />
          </div>
          {state.benefit_enabled && (
            <div className="pt-4 border-t border-border/50 space-y-4 animate-in fade-in-50 duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">
                    {isAr
                      ? "نسبة رسوم معالجة بنفت باي (%)"
                      : "Estimated BenefitPay Processing Fee (%)"}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={state.benefit_processing_fee}
                    onChange={(e) =>
                      setState({
                        ...state,
                        benefit_processing_fee: Math.max(0, Number(e.target.value)),
                      })
                    }
                    placeholder="1.00"
                    className="mt-1.5 bg-background/50 focus:bg-background transition-colors"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {isAr
                      ? "تستخدم لحساب تكاليف المعالجة تلقائياً"
                      : "Used to compute processing costs automatically"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs font-semibold">
                    {isAr
                      ? "رقم الهاتف أو الحساب أو IBAN"
                      : "Benefit phone, account number, or IBAN"}
                  </Label>
                  <Input
                    value={state.benefit_account_number}
                    onChange={(e) => setState({ ...state, benefit_account_number: e.target.value })}
                    placeholder={
                      isAr ? "يظهر للعميل لنسخه مباشرة" : "Shown to customer with copy button"
                    }
                    className="mt-1.5 text-sm font-semibold bg-background/50 focus:bg-background transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  {isAr ? "رمز QR لبنفت باي" : "Benefit Pay QR image"}
                </Label>
                <div className="flex items-center gap-4 mt-1.5">
                  {state.benefit_qr_url && (
                    <img
                      src={state.benefit_qr_url}
                      alt="QR"
                      className="w-20 h-24 object-contain border border-border rounded-xl bg-white p-1 shadow-sm"
                    />
                  )}
                  <div className="flex gap-2">
                    <input
                      ref={qrInput}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadQr(e.target.files[0])}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => qrInput.current?.click()}
                      disabled={uploading}
                      className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                    >
                      <Upload className="h-4 w-4 me-1.5" />{" "}
                      {uploading ? "…" : isAr ? "رفع" : "Upload"}
                    </Button>
                    {state.benefit_qr_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setState({ ...state, benefit_qr_url: null })}
                        className="text-destructive hover:text-destructive hover:scale-105 active:scale-95 transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          size="sm"
          onClick={save}
          disabled={saving}
          className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
        >
          {saving ? "…" : isAr ? "حفظ إعدادات الدفع" : "Save payment settings"}
        </Button>
      </div>
    </Card>
  );
}

function BrandHeroCard({ brandId }: { brandId: string }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropSlideIndex, setCropSlideIndex] = useState<number | null>(null);
  const [cropSlideLanguage, setCropSlideLanguage] = useState<"en" | "ar">("en");
  const [backgroundCropSrc, setBackgroundCropSrc] = useState<string | null>(null);
  const [state, setState] = useState<HeroState | null>(null);

  const { data } = useQuery({
    queryKey: ["brand-hero", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("hero_media, primary_color, about_ar, about_en")
        .eq("id", brandId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!data) return;
    const raw = data.hero_media as any;
    const legacy = Array.isArray(raw) ? raw : [];
    setState({
      background: raw && !Array.isArray(raw) ? (raw.background ?? null) : (legacy[0] ?? null),
      slides:
        raw && !Array.isArray(raw) && Array.isArray(raw.slides)
          ? raw.slides.slice(0, 5).map((slide: any) => ({
              ...slide,
              media_url: slide.media_url ?? "",
              media_url_en: slide.media_url_en ?? "",
              media_url_ar: slide.media_url_ar ?? "",
            }))
          : [],
      primary_color: data.primary_color ?? null,
      about_ar: data.about_ar ?? null,
      about_en: data.about_en ?? null,
    });
  }, [data]);

  const uploadBackground = async (file: Blob) => {
    try {
      setUploading(true);
      const url = await uploadPublicMedia(brandId, file, "hero");
      const type: "image" | "video" = file.type.startsWith("video") ? "video" : "image";
      setState((s) => (s ? { ...s, background: { type, url } } : s));
      toast.success(isAr ? "تم الرفع — لا تنسَ الحفظ" : "Uploaded — remember to save");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const chooseBackgroundMedia = async (file: File) => {
    if (file.type.startsWith("image/")) {
      if (file.size > 12 * 1024 * 1024) {
        toast.error(
          isAr ? "يجب ألا يتجاوز حجم الصورة 12 ميجابايت" : "Image must be 12 MB or smaller",
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setBackgroundCropSrc(String(reader.result));
      reader.onerror = () => toast.error(isAr ? "تعذرت قراءة الصورة" : "Unable to read the image");
      reader.readAsDataURL(file);
      return;
    }
    if (!file.type.startsWith("video/")) {
      toast.error(isAr ? "صيغة الملف غير مدعومة" : "Unsupported file type");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error(isAr ? "يجب ألا يتجاوز الفيديو 100 ميجابايت" : "Video must be 100 MB or smaller");
      return;
    }
    await uploadBackground(file);
  };

  const confirmBackgroundCrop = async (blob: Blob) => {
    await uploadBackground(blob);
    setBackgroundCropSrc(null);
  };

  const uploadSlideMedia = async (file: Blob, index: number, language: "en" | "ar" = "en") => {
    try {
      setUploading(true);
      const type: "image" | "video" = file.type.startsWith("video") ? "video" : "image";
      const mediaField = language === "ar" ? "media_url_ar" : "media_url_en";
      const url = await uploadPublicMedia(brandId, file, "hero");
      const streamPatch =
        language === "ar"
          ? { media_stream_uid_ar: "", media_iframe_url_ar: "", media_poster_url_ar: "" }
          : { media_stream_uid_en: "", media_iframe_url_en: "", media_poster_url_en: "" };
      setState((current) =>
        current
          ? {
              ...current,
              slides: current.slides.map((slide, slideIndex) =>
                slideIndex === index
                  ? { ...slide, type, [mediaField]: url, ...streamPatch }
                  : slide,
              ),
            }
          : current,
      );
      toast.success(isAr ? "تم الرفع — لا تنسَ الحفظ" : "Uploaded — remember to save");
    } catch (error: any) {
      toast.error(error.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const chooseSlideMedia = async (file: File, index: number, language: "en" | "ar" = "en") => {
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setCropSlideIndex(index);
        setCropSlideLanguage(language);
        setCropSrc(String(reader.result));
      };
      reader.readAsDataURL(file);
      return;
    }
    if (!file.type.startsWith("video/")) {
      toast.error(isAr ? "صيغة الملف غير مدعومة" : "Unsupported file type");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error(isAr ? "يجب ألا يتجاوز الفيديو 100 ميجابايت" : "Video must be 100 MB or smaller");
      return;
    }
    try {
      const duration = await heroVideoDuration(file);
      if (!Number.isFinite(duration) || duration > 15.25) {
        toast.error(
          isAr ? "يجب ألا تتجاوز مدة الفيديو 15 ثانية" : "Video must be 15 seconds or shorter",
        );
        return;
      }
      await uploadSlideMedia(file, index, language);
    } catch (error: any) {
      toast.error(error.message ?? "Unable to validate video");
    }
  };

  const confirmHeroCrop = async (blob: Blob) => {
    if (cropSlideIndex == null) return;
    await uploadSlideMedia(blob, cropSlideIndex, cropSlideLanguage);
    setCropSrc(null);
    setCropSlideIndex(null);
  };

  const save = async () => {
    if (!state) return;
    setSaving(true);
    const { error } = await supabase
      .from("brands")
      .update({
        hero_media: { background: state.background, slides: state.slides.slice(0, 5) } as any,
        primary_color: state.primary_color,
        about_ar: state.about_ar,
        about_en: state.about_en,
      })
      .eq("id", brandId);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(isAr ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["brand-hero", brandId] });
    }
  };

  if (!state) return null;

  return (
    <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
      <div>
        <h2 className="font-display text-xl">{isAr ? "واجهة المتجر" : "Storefront Hero"}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "الصور/الفيديو والنبذة التي يراها العملاء في الصفحة الرئيسية"
            : "Hero media, brand color, and About text shown on the public storefront home"}
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-base">
            {isAr ? "خلفية الواجهة الثابتة" : "Fixed hero background"}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "تظهر خلف الشرائح. يمكن تحريك الصورة وتكبيرها قبل الرفع للحصول على إطار مثالي."
              : "Shown behind the slides. Images can be repositioned and zoomed before upload for a precise storefront crop."}
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
          {state.background ? (
            <div className="group relative aspect-video min-h-44 overflow-hidden rounded-2xl border bg-neutral-950 shadow-sm">
              {state.background.type === "video" ? (
                <video
                  src={state.background.url}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={state.background.url}
                  alt={isAr ? "معاينة خلفية الواجهة" : "Hero background preview"}
                  className="h-full w-full object-cover"
                />
              )}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent p-3 text-white">
                <span className="rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
                  {state.background.type === "video"
                    ? isAr
                      ? "فيديو"
                      : "Video"
                    : isAr
                      ? "صورة مقصوصة 16:9"
                      : "Cropped image · 16:9"}
                </span>
              </div>
              <button
                type="button"
                className="absolute end-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-background/95 text-foreground shadow transition-transform hover:scale-105"
                onClick={() => setState({ ...state, background: null })}
                aria-label={isAr ? "إزالة خلفية الواجهة" : "Remove hero background"}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="grid aspect-video min-h-44 place-items-center rounded-2xl border bg-muted/20 text-center text-sm text-muted-foreground">
              <div>
                <Upload className="mx-auto mb-2 h-6 w-6 opacity-50" />
                {isAr ? "لا توجد خلفية مرفوعة" : "No background uploaded"}
              </div>
            </div>
          )}
          <label className="group flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-muted/15 px-5 py-6 text-center transition-all hover:border-primary/50 hover:bg-primary/5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-background text-primary shadow-sm transition-transform group-hover:-translate-y-0.5">
              <Upload className="h-5 w-5" />
            </span>
            <span className="mt-3 text-sm font-semibold">
              {uploading
                ? isAr
                  ? "جاري الرفع…"
                  : "Uploading…"
                : state.background
                  ? isAr
                    ? "تغيير الخلفية"
                    : "Replace background"
                  : isAr
                    ? "اختيار صورة أو فيديو"
                    : "Choose image or video"}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">
              {isAr ? "الصور تفتح في محرر القص" : "Images open in the crop editor"}
            </span>
            <span
              className="mt-2 rounded-full bg-background px-2.5 py-1 font-mono text-[10px] text-muted-foreground"
              dir="ltr"
            >
              1920 × 1080 · 16:9
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void chooseBackgroundMedia(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <HeroSlidesEditor
        state={state}
        setState={setState}
        isAr={isAr}
        uploading={uploading}
        uploadSlideMedia={chooseSlideMedia}
      />

      <ImageCropperDialog
        open={Boolean(cropSrc)}
        imageSrc={cropSrc}
        aspect={16 / 9}
        outputWidth={1920}
        outputHeight={1080}
        heroPreview
        busy={uploading}
        onCancel={() => {
          setCropSrc(null);
          setCropSlideIndex(null);
        }}
        onConfirm={confirmHeroCrop}
      />
      <ImageCropperDialog
        open={Boolean(backgroundCropSrc)}
        imageSrc={backgroundCropSrc}
        aspect={16 / 9}
        outputWidth={1920}
        outputHeight={1080}
        heroPreview
        busy={uploading}
        title={isAr ? "تجهيز خلفية الواجهة" : "Frame your hero background"}
        description={
          isAr
            ? "حرّك الصورة وكبّرها حتى تظهر أهم التفاصيل داخل الإطار على الهاتف والكمبيوتر."
            : "Position and zoom the image so the important details stay visible across desktop and mobile."
        }
        onCancel={() => setBackgroundCropSrc(null)}
        onConfirm={confirmBackgroundCrop}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>{isAr ? "لون العلامة" : "Brand color"}</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={state.primary_color ?? "#000000"}
              onChange={(e) => setState({ ...state, primary_color: e.target.value })}
              className="h-9 w-12 rounded border border-border cursor-pointer"
            />
            <Input
              value={state.primary_color ?? ""}
              onChange={(e) => setState({ ...state, primary_color: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>{isAr ? "نبذة (عربي)" : "About (Arabic)"}</Label>
          <Textarea
            value={state.about_ar ?? ""}
            onChange={(e) => setState({ ...state, about_ar: e.target.value })}
          />
        </div>
        <div>
          <Label>{isAr ? "نبذة (إنجليزي)" : "About (English)"}</Label>
          <Textarea
            value={state.about_en ?? ""}
            onChange={(e) => setState({ ...state, about_en: e.target.value })}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>
          {isAr ? "حفظ واجهة المتجر" : "Save storefront hero"}
        </Button>
      </div>
    </Card>
  );
}

function HeroSlidesEditor({
  state,
  setState,
  isAr,
  uploading,
  uploadSlideMedia,
}: {
  state: HeroState;
  setState: (state: HeroState) => void;
  isAr: boolean;
  uploading: boolean;
  uploadSlideMedia: (file: File, index: number, language?: "en" | "ar") => Promise<void>;
}) {
  const update = (index: number, patch: Partial<HeroSlide>) =>
    setState({
      ...state,
      slides: state.slides.map((slide, slideIndex) =>
        slideIndex === index ? { ...slide, ...patch } : slide,
      ),
    });
  /* Existing videos remain in R2 on the free-only media plan.
      toast.success(isAr ? "تم إرسال الفيديو القديم للتحسين. احفظ الإعدادات." : "Existing video queued for optimization. Save the settings.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not optimize this video");
    } finally {
      setOptimizing(null);
    }
  };
  */
  return (
    <div className="space-y-3 border-t pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label>{isAr ? "شرائح محتوى الواجهة" : "Hero content slides"}</Label>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "حتى 5 شرائح قابلة للسحب: نص أو صورة أو فيديو."
              : "Up to 5 swipeable text, image, or video slides."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={state.slides.length >= 5}
          onClick={() => setState({ ...state, slides: [...state.slides, emptyHeroSlide()] })}
        >
          {isAr ? "+ شريحة" : "+ Add slide"}
        </Button>
      </div>
      {state.slides.length === 0 && (
        <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
          {isAr
            ? "سيستمر عرض النص الحالي حتى تضيف أول شريحة."
            : "The current hero text remains until you add the first slide."}
        </div>
      )}
      {state.slides.map((slide, index) => (
        <div key={slide.id} className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <strong>{isAr ? `الشريحة ${index + 1}` : `Slide ${index + 1}`}</strong>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() =>
                setState({
                  ...state,
                  slides: state.slides.filter((_, itemIndex) => itemIndex !== index),
                })
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <Label>{isAr ? "نوع المحتوى" : "Content type"}</Label>
            <Select
              value={slide.type}
              onValueChange={(value: "text" | "image" | "video") => update(index, { type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">{isAr ? "نص" : "Text"}</SelectItem>
                <SelectItem value="image">{isAr ? "صورة" : "Image"}</SelectItem>
                <SelectItem value="video">{isAr ? "فيديو" : "Video"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {slide.type !== "text" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["en", "ar"] as const).map((language) => {
                const mediaUrl =
                  (language === "ar" ? slide.media_url_ar : slide.media_url_en) || slide.media_url;
                const streamIframeUrl =
                  language === "ar" ? slide.media_iframe_url_ar : slide.media_iframe_url_en;
                const posterUrl =
                  (language === "ar" ? slide.media_poster_url_ar : slide.media_poster_url_en) ||
                  mediaUrl;
                return (
                  <div
                    key={language}
                    className="space-y-2 rounded-lg border p-3"
                    dir={language === "ar" ? "rtl" : "ltr"}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Label>{language === "ar" ? "الوسائط العربية" : "English media"}</Label>
                      {mediaUrl && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            update(
                              index,
                              language === "ar" ? { media_url_ar: "" } : { media_url_en: "" },
                            )
                          }
                        >
                          {language === "ar" ? "إزالة" : "Remove"}
                        </Button>
                      )}
                    </div>
                    {mediaUrl &&
                      (slide.type === "video" ? (
                        <OptimizedVideo
                          src={streamIframeUrl ? undefined : mediaUrl}
                          streamIframeUrl={streamIframeUrl}
                          poster={posterUrl}
                          className="aspect-video w-full rounded-lg bg-black object-cover"
                          wrapperClassName="aspect-video w-full overflow-hidden rounded-lg bg-black"
                        />
                      ) : (
                        <ResponsiveImage
                          src={mediaUrl}
                          preset="hero"
                          alt=""
                          className="aspect-video w-full rounded-lg object-cover"
                        />
                      ))}
                    <label className="flex h-12 cursor-pointer items-center justify-center rounded-lg border border-dashed px-4 text-sm text-muted-foreground hover:bg-secondary">
                      {uploading
                        ? "…"
                        : language === "ar"
                          ? "رفع وسائط عربية"
                          : "Upload English media"}
                      <input
                        type="file"
                        accept={
                          slide.type === "video" ? "video/mp4" : "image/jpeg,image/png,image/webp"
                        }
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadSlideMedia(file, index, language);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {slide.type === "video"
                        ? language === "ar"
                          ? "الموصى به: أفقي 16:9 | 15 ثانية كحد أقصى | 100MB | MP4"
                          : "Recommended: 16:9 Horizontal | Max 15s | Max 100MB | MP4"
                        : language === "ar"
                          ? "الموصى به: 1920×1080 بكسل (16:9) | JPG، PNG، WebP"
                          : "Recommended: 1920x1080px (16:9) | JPG, PNG, WebP"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          {slide.type !== "text" && (
            <div>
              <Label>{isAr ? "رابط الشريحة عند الضغط" : "Slide click link"}</Label>
              <Input
                dir="ltr"
                value={slide.button_href}
                onChange={(event) => update(index, { button_href: event.target.value })}
                placeholder={`/${isAr ? "اسم-القسم" : "category-or-page"}`}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {isAr
                  ? "عند الضغط على الصورة أو الفيديو، سينتقل العميل إلى هذا الرابط."
                  : "Clicking the image or video sends the customer to this page."}
              </p>
            </div>
          )}
          {slide.type !== "text" && (
            <div className="hidden space-y-2">
              {slide.media_url &&
                (slide.type === "video" ? (
                  <video
                    src={slide.media_url}
                    className="aspect-video w-full rounded-lg bg-black object-contain"
                    muted
                    controls
                  />
                ) : (
                  <img
                    src={slide.media_url}
                    alt=""
                    className="aspect-video w-full rounded-lg object-cover"
                  />
                ))}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="flex h-12 min-w-44 cursor-pointer items-center justify-center rounded-lg border border-dashed px-4 text-sm text-muted-foreground hover:bg-secondary">
                  {uploading ? "…" : isAr ? "رفع الوسائط" : "Upload media"}
                  <input
                    type="file"
                    accept={
                      slide.type === "video" ? "video/mp4" : "image/jpeg,image/png,image/webp"
                    }
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadSlideMedia(file, index);
                      event.target.value = "";
                    }}
                  />
                </label>
                <span className="rounded-md bg-secondary px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {slide.type === "video"
                    ? isAr
                      ? "الموصى به: أفقي 16:9 | 15 ثانية كحد أقصى | 100MB كحد أقصى | MP4"
                      : "Recommended: 16:9 Horizontal | Max 15s | Max 100MB | MP4"
                    : isAr
                      ? "الموصى به: 1920×1080 بكسل (16:9) | JPG، PNG، WebP"
                      : "Recommended: 1920x1080px (16:9) | JPG, PNG, WebP"}
                </span>
              </div>
            </div>
          )}
          {slide.type === "text" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Title — English</Label>
                  <Input
                    value={slide.title_en}
                    onChange={(event) => update(index, { title_en: event.target.value })}
                  />
                </div>
                <div>
                  <Label>العنوان — عربي</Label>
                  <Input
                    dir="rtl"
                    value={slide.title_ar}
                    onChange={(event) => update(index, { title_ar: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Text — English</Label>
                  <Textarea
                    value={slide.body_en}
                    onChange={(event) => update(index, { body_en: event.target.value })}
                  />
                </div>
                <div>
                  <Label>النص — عربي</Label>
                  <Textarea
                    dir="rtl"
                    value={slide.body_ar}
                    onChange={(event) => update(index, { body_ar: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Button — English</Label>
                  <Input
                    value={slide.button_en}
                    onChange={(event) => update(index, { button_en: event.target.value })}
                  />
                </div>
                <div>
                  <Label>الزر — عربي</Label>
                  <Input
                    dir="rtl"
                    value={slide.button_ar}
                    onChange={(event) => update(index, { button_ar: event.target.value })}
                  />
                </div>
                <div>
                  <Label>{isAr ? "رابط الزر" : "Button link"}</Label>
                  <Input
                    value={slide.button_href}
                    onChange={(event) => update(index, { button_href: event.target.value })}
                    placeholder="#products"
                  />
                </div>
              </div>
            </>
          )}
          <HeroSlideLivePreview
            slide={slide}
            isAr={isAr}
            color={state.primary_color ?? "#330a0a"}
          />
        </div>
      ))}
    </div>
  );
}

function HeroSlideLivePreview({
  slide,
  isAr,
  color,
}: {
  slide: HeroSlide;
  isAr: boolean;
  color: string;
}) {
  const title = isAr ? slide.title_ar || slide.title_en : slide.title_en || slide.title_ar;
  const body = isAr ? slide.body_ar || slide.body_en : slide.body_en || slide.body_ar;
  const button = isAr ? slide.button_ar || slide.button_en : slide.button_en || slide.button_ar;
  const mediaUrl =
    (isAr ? slide.media_url_ar : slide.media_url_en) ||
    slide.media_url ||
    (isAr ? slide.media_url_en : slide.media_url_ar) ||
    "";
  return (
    <details className="group border-t pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-secondary [&::-webkit-details-marker]:hidden">
        <span>{isAr ? "معاينة المتجر" : "Storefront preview"}</span>
        <span
          aria-hidden="true"
          className="text-muted-foreground transition-transform group-open:rotate-180"
        >
          ⌄
        </span>
      </summary>
      <div
        dir={isAr ? "rtl" : "ltr"}
        className="relative mx-auto mt-3 aspect-video w-full max-w-md overflow-hidden rounded-lg border bg-neutral-100"
      >
        {slide.type === "image" && mediaUrl ? (
          <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
        ) : slide.type === "video" && mediaUrl ? (
          <video
            src={mediaUrl}
            muted
            autoPlay
            loop
            playsInline
            disablePictureInPicture
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col justify-center p-5 pb-16 sm:p-8 sm:pb-16">
            {title && (
              <strong className="mb-2 text-xl sm:text-3xl" style={{ color }}>
                {title}
              </strong>
            )}
            {body && <p className="line-clamp-2 text-xs text-neutral-700 sm:text-sm">{body}</p>}
            {button && (
              <span
                className="mt-3 w-fit rounded-full px-4 py-2 text-xs font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {button}
              </span>
            )}
          </div>
        )}
        <div
          dir="ltr"
          className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-between text-white mix-blend-difference"
        >
          <span className="grid h-9 w-9 place-items-center text-3xl font-extralight">‹</span>
          <span className="grid h-9 w-9 place-items-center text-3xl font-extralight">›</span>
        </div>
      </div>
    </details>
  );
}

function ShippingSettingsCard({ brandId }: { brandId: string }) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<{
    delivery_enabled: boolean;
    pickup_enabled: boolean;
    digital_delivery_enabled: boolean;
    delivery_fee: number;
  } | null>(null);
  const [zones, setZones] = useState<
    Array<{ id: string; name_en: string; name_ar: string; fee: number }>
  >([]);
  const [newZone, setNewZone] = useState({ name_en: "", name_ar: "", fee: "" });

  const { data } = useQuery({
    queryKey: ["business-settings-shipping", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select(
          "delivery_enabled, pickup_enabled, digital_delivery_enabled, delivery_fee, shipping_zones, currency",
        )
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const currency = (data as any)?.currency ?? "BHD";
  useEffect(() => {
    if (data) {
      setState({
        delivery_enabled: (data as any).delivery_enabled ?? true,
        pickup_enabled: (data as any).pickup_enabled ?? true,
        digital_delivery_enabled: (data as any).digital_delivery_enabled ?? false,
        delivery_fee: Number((data as any).delivery_fee ?? 0),
      });
      try {
        const rawZones = (data as any).shipping_zones;
        const parsed = Array.isArray(rawZones) ? rawZones : JSON.parse(rawZones || "[]");
        setZones(
          parsed.map((z: any) => ({
            id: z.id || crypto.randomUUID(),
            name_en: String(z.name_en || ""),
            name_ar: String(z.name_ar || ""),
            fee: Number(z.fee ?? 0),
          })),
        );
      } catch (e) {
        setZones([]);
      }
    }
  }, [data]);

  const save = async () => {
    if (!state) return;
    setSaving(true);
    const { error } = await supabase
      .from("business_settings")
      .update({
        delivery_enabled: state.delivery_enabled,
        pickup_enabled: state.pickup_enabled,
        digital_delivery_enabled: state.digital_delivery_enabled,
        delivery_fee: state.delivery_fee,
        shipping_zones: zones as any,
        benefit_account_number: (state as any).benefit_account_number,
      } as any)
      .eq("brand_id", brandId);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(isAr ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["business-settings-shipping", brandId] });
    }
  };

  const addZone = () => {
    if (!newZone.name_en.trim() || !newZone.name_ar.trim() || newZone.fee === "") {
      toast.error(
        isAr ? "الرجاء تعبئة جميع الحقول لإضافة منطقة" : "Please fill all fields to add a zone",
      );
      return;
    }
    const zone = {
      id: crypto.randomUUID(),
      name_en: newZone.name_en.trim(),
      name_ar: newZone.name_ar.trim(),
      fee: Math.max(0, Number(newZone.fee)),
    };
    setZones([...zones, zone]);
    setNewZone({ name_en: "", name_ar: "", fee: "" });
  };

  const removeZone = (id: string) => {
    setZones(zones.filter((z) => z.id !== id));
  };

  if (!state) return null;

  return (
    <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
      <div>
        <h2 className="font-display text-xl">{t("settings.shippingTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.shippingSubtitle")}</p>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <p className="text-sm font-medium">{t("settings.deliveryEnabled")}</p>
        <Switch
          checked={state.delivery_enabled}
          onCheckedChange={(v) => setState({ ...state, delivery_enabled: v })}
        />
      </div>
      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <p className="text-sm font-medium">{t("settings.pickupEnabled")}</p>
        <Switch
          checked={state.pickup_enabled}
          onCheckedChange={(v) => setState({ ...state, pickup_enabled: v })}
        />
      </div>
      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <div>
          <p className="text-sm font-medium">
            {isAr ? "تفعيل التسليم الرقمي" : "Enable digital delivery"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "إرسال المنتج عبر البريد الإلكتروني أو واتساب"
              : "Send products by email or WhatsApp"}
          </p>
        </div>
        <Switch
          checked={state.digital_delivery_enabled}
          onCheckedChange={(v) => setState({ ...state, digital_delivery_enabled: v })}
        />
      </div>

      {state.delivery_enabled && (
        <div className="space-y-4 border-t border-border pt-4 animate-in fade-in-50 duration-200">
          <div>
            <h3 className="text-sm font-semibold mb-2">
              {isAr ? "مناطق تسعير التوصيل والشحن" : "Shipping & Delivery Pricing Zones"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {isAr
                ? "أنشئ مناطق توصيل مخصصة بأسعار مختلفة (مثال: البحرين محلي، شحن السعودية، دولي مجلس التعاون). سيختار العميل منطقته عند الدفع."
                : "Create custom shipping zones with distinct fees. Customers will select their zone during checkout."}
            </p>
          </div>

          {/* Zones Table / List */}
          {zones.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden bg-background">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-secondary/10 text-xs font-semibold text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-3">{isAr ? "المنطقة (إنجليزي)" : "Zone Name (EN)"}</th>
                    <th className="p-3">{isAr ? "المنطقة (عربي)" : "Zone Name (AR)"}</th>
                    <th className="p-3 w-32">{isAr ? "رسوم التوصيل" : "Fee"}</th>
                    <th className="p-3 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {zones.map((z) => (
                    <tr key={z.id} className="hover:bg-secondary/5 transition-colors">
                      <td className="p-3 font-medium">{z.name_en}</td>
                      <td className="p-3 font-medium">{z.name_ar}</td>
                      <td className="p-3 font-mono font-semibold">
                        {formatMoney(z.fee, currency, lang)}
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => removeZone(z.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground bg-secondary/5">
              {isAr
                ? "لا توجد مناطق شحن معرفة بعد. سيتم استخدام السعر الافتراضي أدناه لجميع الطلبات."
                : "No shipping zones defined yet. The default delivery fee below will be used as a fallback."}
            </div>
          )}

          {/* Add New Zone Form */}
          <div className="rounded-lg border border-border p-4 bg-secondary/10 space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? "إضافة منطقة جديدة" : "Add New Shipping Zone"}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Input
                  type="text"
                  placeholder={
                    isAr ? "الاسم بالإنجليزي (مثال: KSA Shipping)" : "EN Name (e.g. KSA Shipping)"
                  }
                  value={newZone.name_en}
                  onChange={(e) => setNewZone({ ...newZone, name_en: e.target.value })}
                  className="text-xs"
                />
              </div>
              <div>
                <Input
                  type="text"
                  placeholder={
                    isAr ? "الاسم بالعربي (مثال: شحن السعودية)" : "AR Name (e.g. شحن السعودية)"
                  }
                  value={newZone.name_ar}
                  onChange={(e) => setNewZone({ ...newZone, name_ar: e.target.value })}
                  className="text-xs text-right"
                  dir="rtl"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder={isAr ? "الرسوم" : "Fee"}
                  value={newZone.fee}
                  onChange={(e) => setNewZone({ ...newZone, fee: e.target.value })}
                  className="text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 text-xs bg-primary hover:bg-primary/90"
                  onClick={addZone}
                >
                  {isAr ? "إضافة" : "Add"}
                </Button>
              </div>
            </div>
          </div>

          {/* Default / Fallback Delivery Fee */}
          <div className="pt-3 border-t border-border">
            <Label className="text-xs font-semibold">
              {isAr ? "رسوم التوصيل الافتراضية / الاحتياطية" : "Default / Fallback Delivery Fee"}
            </Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={state.delivery_fee}
              onChange={(e) =>
                setState({ ...state, delivery_fee: Math.max(0, Number(e.target.value)) })
              }
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {t("settings.deliveryFeeHint")}
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {t("settings.save")}
        </Button>
      </div>
    </Card>
  );
}

function CustomizerNavigation({
  active,
  onChange,
  isAr,
}: {
  active: "general" | "theme" | "content" | "promotions";
  onChange: (value: "general" | "theme" | "content" | "promotions") => void;
  isAr: boolean;
}) {
  const items = [
    ["general", isAr ? "الهوية والعرض" : "General & Branding"],
    ["theme", isAr ? "المظهر والتنسيق" : "Theme & Styling"],
    ["content", isAr ? "المحتوى والرسائل" : "Content & Messaging"],
    ["promotions", isAr ? "البنرات الترويجية" : "Promotional Banners"],
  ] as const;
  return (
    <div
      className="grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-1 lg:grid-cols-4"
      role="tablist"
    >
      {items.map(([value, label]) => (
        <Button
          key={value}
          type="button"
          variant={active === value ? "default" : "ghost"}
          className="h-auto min-h-11 whitespace-normal px-3 py-2"
          onClick={() => onChange(value)}
          role="tab"
          aria-selected={active === value}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

function ContentLanguageToggle({
  value,
  onChange,
  isAr,
}: {
  value: "en" | "ar";
  onChange: (value: "en" | "ar") => void;
  isAr: boolean;
}) {
  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-xl border bg-muted/20 p-3 sm:flex-row sm:items-center">
      <div>
        <p className="text-sm font-medium">{isAr ? "لغة المحتوى" : "Content language"}</p>
        <p className="text-xs text-muted-foreground">
          {isAr ? "اعرض وحرّر لغة واحدة في كل مرة." : "View and edit one language at a time."}
        </p>
      </div>
      <div className="grid w-full grid-cols-2 rounded-lg bg-muted p-1 sm:w-auto" dir="ltr">
        <Button
          type="button"
          size="sm"
          variant={value === "en" ? "default" : "ghost"}
          onClick={() => onChange("en")}
        >
          English (EN)
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value === "ar" ? "default" : "ghost"}
          onClick={() => onChange("ar")}
        >
          العربية (AR)
        </Button>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex min-h-10 items-center gap-2 rounded-lg border bg-background p-1.5">
        <label
          className="relative h-8 w-12 shrink-0 cursor-pointer overflow-hidden rounded-md border shadow-sm"
          style={{ backgroundColor: value ?? "#ffffff" }}
        >
          <input
            type="color"
            value={value ?? "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={label}
          />
        </label>
        <span className="min-w-0 flex-1 truncate px-1 font-mono text-xs text-muted-foreground">
          {value?.toUpperCase() ?? (isAr ? "اللون الافتراضي" : "Default color")}
        </span>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => onChange(null)}
          >
            {isAr ? "افتراضي" : "Reset"}
          </Button>
        )}
      </div>
    </div>
  );
}

function StorefrontSeoCard({ brandId }: { brandId: string }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["brand-storefront-seo", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("meta_title, meta_description")
        .eq("id", brandId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!query.data) return;
    setMetaTitle(query.data.meta_title ?? "");
    setMetaDescription(query.data.meta_description ?? "");
  }, [query.data]);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("brands")
      .update({
        meta_title: sanitizeMetaText(metaTitle, META_TITLE_LIMIT) || null,
        meta_description: sanitizeMetaText(metaDescription, META_DESCRIPTION_LIMIT) || null,
      })
      .eq("id", brandId);
    setSaving(false);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["brand-storefront-seo", brandId] });
    toast.success(isAr ? "تم حفظ إعدادات محركات البحث" : "Storefront SEO saved");
  };

  return (
    <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
      <div>
        <h2 className="font-display text-xl">
          {isAr ? "ظهور المتجر في محركات البحث" : "Storefront SEO"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "عنوان ووصف الصفحة الرئيسية عند ظهورها في Google أو مشاركتها."
            : "Control the homepage title and description shown in search and social sharing."}
        </p>
      </div>
      <div>
        <div className="flex justify-between gap-3">
          <Label>{isAr ? "عنوان الصفحة الرئيسية" : "Homepage Meta Title"}</Label>
          <span className="text-xs text-muted-foreground">
            {metaTitle.length}/{META_TITLE_LIMIT}
          </span>
        </div>
        <Input
          value={metaTitle}
          maxLength={META_TITLE_LIMIT}
          onChange={(event) => setMetaTitle(event.target.value)}
          dir={isAr ? "rtl" : "ltr"}
          placeholder={
            isAr ? "اسم المتجر ووصفه المختصر" : "Store name and concise value proposition"
          }
        />
      </div>
      <div>
        <div className="flex justify-between gap-3">
          <Label>{isAr ? "وصف الصفحة الرئيسية" : "Homepage Meta Description"}</Label>
          <span className="text-xs text-muted-foreground">
            {metaDescription.length}/{META_DESCRIPTION_LIMIT}
          </span>
        </div>
        <Textarea
          value={metaDescription}
          maxLength={META_DESCRIPTION_LIMIT}
          rows={3}
          onChange={(event) => setMetaDescription(event.target.value)}
          dir={isAr ? "rtl" : "ltr"}
          placeholder={
            isAr ? "وصف جذاب ومختصر للمتجر" : "A concise and compelling storefront description"
          }
        />
      </div>
      <Button onClick={save} disabled={saving || query.isLoading}>
        {saving
          ? isAr
            ? "جاري الحفظ…"
            : "Saving…"
          : isAr
            ? "حفظ إعدادات البحث"
            : "Save SEO settings"}
      </Button>
    </Card>
  );
}

function StorefrontCustomizerCard({ brandId }: { brandId: string }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploadingFont, setUploadingFont] = useState<null | "en" | "ar">(null);
  const [settingsTab, setSettingsTab] = useState<"general" | "theme" | "content" | "promotions">(
    "general",
  );
  const [contentLanguage, setContentLanguage] = useState<"en" | "ar">(lang === "ar" ? "ar" : "en");
  const enFontInput = useRef<HTMLInputElement>(null);
  const arFontInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{
    logo_size: number;
    logo_align: string;
    show_header_name: boolean;
    show_hero_title: boolean;
    show_hero_about: boolean;
    show_footer_name: boolean;
    storefront_font_en: string;
    storefront_font_ar: string;
    storefront_font_en_url: string | null;
    storefront_font_ar_url: string | null;
    hero_title_en: string | null;
    hero_title_ar: string | null;
    hero_title_size: number;
    hero_title_color: string | null;
    hero_title_align: "start" | "center" | "end";
    storefront_accent_color: string | null;
    storefront_background_color: string | null;
    storefront_text_color: string | null;
    header_bg: string | null;
    header_fg: string | null;
    footer_bg: string | null;
    footer_fg: string | null;
    heading_color: string | null;
    link_color: string | null;
    btn_primary_bg: string | null;
    btn_primary_fg: string | null;
    btn_secondary_bg: string | null;
    btn_secondary_fg: string | null;
    btn_checkout_bg: string | null;
    btn_checkout_fg: string | null;
    menu_bg: string | null;
    menu_fg: string | null;
    menu_title_en: string | null;
    menu_title_ar: string | null;
    menu_show_home: boolean;
    menu_show_account: boolean;
    menu_show_orders: boolean;
    menu_show_pages: boolean;
    home_promo_cards: HomePromoCard[];
    show_new_arrivals: boolean;
    show_best_sellers: boolean;
    new_arrivals_title_en: string | null;
    new_arrivals_title_ar: string | null;
    best_sellers_title_en: string | null;
    best_sellers_title_ar: string | null;
    announcement_enabled: boolean;
    announcement_text_en: string | null;
    announcement_text_ar: string | null;
    announcement_bg: string;
    announcement_fg: string;
    announcement_bold: boolean;
    announcement_italic: boolean;
    announcement_dismissible: boolean;
    announcement_scope: "all" | "home" | "catalog" | "checkout";
    announcement_audience: "all" | "guest" | "authenticated";
    global_sale_badges_enabled: boolean;
    cart_drawer_checkout_bg: string | null;
    cart_drawer_checkout_fg: string | null;
    storefront_loader_text_en: string | null;
    storefront_loader_text_ar: string | null;
  } | null>(null);

  const [hasLoaderColumns, setHasLoaderColumns] = useState(true);

  const { data } = useQuery({
    queryKey: ["business-settings-theme", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select(
          "logo_size, logo_align, show_header_name, show_hero_title, show_hero_about, show_footer_name, storefront_font_en, storefront_font_ar, storefront_font_en_url, storefront_font_ar_url, hero_title_en, hero_title_ar, hero_title_size, hero_title_color, hero_title_align, storefront_accent_color, storefront_background_color, storefront_text_color, header_bg, header_fg, footer_bg, footer_fg, heading_color, link_color, btn_primary_bg, btn_primary_fg, btn_secondary_bg, btn_secondary_fg, btn_checkout_bg, btn_checkout_fg, cart_drawer_checkout_bg, cart_drawer_checkout_fg, menu_bg, menu_fg, menu_title_en, menu_title_ar, menu_show_home, menu_show_account, menu_show_orders, menu_show_pages, home_promo_cards, show_new_arrivals, show_best_sellers, new_arrivals_title_en, new_arrivals_title_ar, best_sellers_title_en, best_sellers_title_ar, announcement_enabled, announcement_text_en, announcement_text_ar, announcement_bg, announcement_fg, announcement_bold, announcement_italic, announcement_dismissible, announcement_scope, announcement_audience, global_sale_badges_enabled, storefront_loader_text_en, storefront_loader_text_ar",
        )
        .eq("brand_id", brandId)
        .maybeSingle();

      if (error) {
        // If the query fails due to missing storefront loader columns in DB, dynamically fall back!
        if (error.code === "42703" || error.message?.includes("storefront_loader_text")) {
          setHasLoaderColumns(false);
          const { data: fallbackData, error: fallbackError } = await supabase
            .from("business_settings")
            .select(
              "logo_size, logo_align, show_header_name, show_hero_title, show_hero_about, show_footer_name, storefront_font_en, storefront_font_ar, storefront_font_en_url, storefront_font_ar_url, hero_title_en, hero_title_ar, hero_title_size, hero_title_color, hero_title_align, storefront_accent_color, storefront_background_color, storefront_text_color, header_bg, header_fg, footer_bg, footer_fg, heading_color, link_color, btn_primary_bg, btn_primary_fg, btn_secondary_bg, btn_secondary_fg, btn_checkout_bg, btn_checkout_fg, cart_drawer_checkout_bg, cart_drawer_checkout_fg, menu_bg, menu_fg, menu_title_en, menu_title_ar, menu_show_home, menu_show_account, menu_show_orders, menu_show_pages, home_promo_cards, show_new_arrivals, show_best_sellers, new_arrivals_title_en, new_arrivals_title_ar, best_sellers_title_en, best_sellers_title_ar, announcement_enabled, announcement_text_en, announcement_text_ar, announcement_bg, announcement_fg, announcement_bold, announcement_italic, announcement_dismissible, announcement_scope, announcement_audience, global_sale_badges_enabled",
            )
            .eq("brand_id", brandId)
            .maybeSingle();
          if (fallbackError) throw fallbackError;
          return fallbackData as any;
        }
        throw error;
      }
      return data as any;
    },
  });

  useEffect(() => {
    if (data)
      setState({
        logo_size: data.logo_size ?? 48,
        logo_align: data.logo_align ?? "left",
        show_header_name: data.show_header_name ?? true,
        show_hero_title: data.show_hero_title ?? true,
        show_hero_about: data.show_hero_about ?? true,
        show_footer_name: data.show_footer_name ?? true,
        storefront_font_en: data.storefront_font_en ?? "Inter",
        storefront_font_ar: data.storefront_font_ar ?? "Tajawal",
        storefront_font_en_url: data.storefront_font_en_url ?? null,
        storefront_font_ar_url: data.storefront_font_ar_url ?? null,
        hero_title_en: data.hero_title_en ?? null,
        hero_title_ar: data.hero_title_ar ?? null,
        hero_title_size: Number(data.hero_title_size ?? 48),
        hero_title_color: data.hero_title_color ?? null,
        hero_title_align: data.hero_title_align ?? "start",
        storefront_accent_color: data.storefront_accent_color ?? null,
        storefront_background_color: data.storefront_background_color ?? null,
        storefront_text_color: data.storefront_text_color ?? null,
        header_bg: data.header_bg ?? null,
        header_fg: data.header_fg ?? null,
        footer_bg: data.footer_bg ?? null,
        footer_fg: data.footer_fg ?? null,
        heading_color: data.heading_color ?? null,
        link_color: data.link_color ?? null,
        btn_primary_bg: data.btn_primary_bg ?? null,
        btn_primary_fg: data.btn_primary_fg ?? null,
        btn_secondary_bg: data.btn_secondary_bg ?? null,
        btn_secondary_fg: data.btn_secondary_fg ?? null,
        btn_checkout_bg: data.btn_checkout_bg ?? null,
        btn_checkout_fg: data.btn_checkout_fg ?? null,
        menu_bg: data.menu_bg ?? null,
        menu_fg: data.menu_fg ?? null,
        menu_title_en: data.menu_title_en ?? null,
        menu_title_ar: data.menu_title_ar ?? null,
        menu_show_home: data.menu_show_home ?? true,
        menu_show_account: data.menu_show_account ?? true,
        menu_show_orders: data.menu_show_orders ?? true,
        menu_show_pages: data.menu_show_pages ?? true,
        home_promo_cards: Array.from({ length: 4 }, (_, index) => ({
          ...EMPTY_PROMO_CARD,
          ...((Array.isArray(data.home_promo_cards) ? data.home_promo_cards[index] : null) ?? {}),
        })),
        show_new_arrivals: data.show_new_arrivals ?? true,
        show_best_sellers: data.show_best_sellers ?? true,
        new_arrivals_title_en: data.new_arrivals_title_en ?? null,
        new_arrivals_title_ar: data.new_arrivals_title_ar ?? null,
        best_sellers_title_en: data.best_sellers_title_en ?? null,
        best_sellers_title_ar: data.best_sellers_title_ar ?? null,
        announcement_enabled: data.announcement_enabled ?? false,
        announcement_text_en: data.announcement_text_en ?? null,
        announcement_text_ar: data.announcement_text_ar ?? null,
        announcement_bg: data.announcement_bg ?? "#111111",
        announcement_fg: data.announcement_fg ?? "#ffffff",
        announcement_bold: data.announcement_bold ?? false,
        announcement_italic: data.announcement_italic ?? false,
        announcement_dismissible: data.announcement_dismissible ?? true,
        announcement_scope: data.announcement_scope ?? "all",
        announcement_audience: data.announcement_audience ?? "all",
        global_sale_badges_enabled: data.global_sale_badges_enabled ?? true,
        cart_drawer_checkout_bg: data.cart_drawer_checkout_bg ?? null,
        cart_drawer_checkout_fg: data.cart_drawer_checkout_fg ?? null,
        storefront_loader_text_en: data.storefront_loader_text_en ?? null,
        storefront_loader_text_ar: data.storefront_loader_text_ar ?? null,
      });
  }, [data]);

  const save = async () => {
    if (!state) return;
    setSaving(true);
    const payload = { ...state };
    if (!hasLoaderColumns) {
      delete (payload as any).storefront_loader_text_en;
      delete (payload as any).storefront_loader_text_ar;
    }
    const { error } = await (supabase.from("business_settings") as any)
      .update(payload)
      .eq("brand_id", brandId);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(isAr ? "تم الحفظ" : "Saved");
      await qc.invalidateQueries({ queryKey: ["business-settings-theme", brandId] });
      await router.invalidate();
    }
  };

  const uploadStorefrontFont = async (file: File, language: "en" | "ar") => {
    try {
      setUploadingFont(language);
      const url = await uploadPublicMedia(brandId, file, "font");
      setState((current) =>
        current
          ? {
              ...current,
              [language === "en" ? "storefront_font_en_url" : "storefront_font_ar_url"]: url,
            }
          : current,
      );
      toast.success(isAr ? "تم رفع الخط — لا تنسَ الحفظ" : "Font uploaded — remember to save");
    } catch (error: any) {
      toast.error(error.message ?? "Font upload failed");
    } finally {
      setUploadingFont(null);
    }
  };

  const updatePromoCard = (index: number, patch: Partial<HomePromoCard>) =>
    setState((current) =>
      current
        ? {
            ...current,
            home_promo_cards: current.home_promo_cards.map((card, cardIndex) =>
              cardIndex === index ? { ...card, ...patch } : card,
            ),
          }
        : current,
    );

  const uploadPromoImage = async (index: number, file: File) => {
    try {
      const url = await uploadPublicMedia(brandId, file, "hero");
      updatePromoCard(index, { image_url: url });
      toast.success(
        isAr ? "تم رفع صورة البطاقة — احفظ التغييرات" : "Card image uploaded — remember to save",
      );
    } catch (error: any) {
      toast.error(error.message ?? "Upload failed");
    }
  };

  if (!state) return null;

  return (
    <Card
      className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-6"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div>
        <h2 className="font-display text-2xl">
          {isAr ? "إعدادات واجهة المتجر" : "Storefront Settings"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "خصّص شكل المتجر العام — يطبَّق فوراً بعد الحفظ"
            : "Customize the public storefront — applied instantly after saving"}
        </p>
      </div>

      <CustomizerNavigation active={settingsTab} onChange={setSettingsTab} isAr={isAr} />
      {(settingsTab === "content" || settingsTab === "promotions") && (
        <ContentLanguageToggle value={contentLanguage} onChange={setContentLanguage} isAr={isAr} />
      )}

      <div className={settingsTab === "general" ? "space-y-3" : "hidden"}>
        <h3 className="font-medium text-sm">{isAr ? "الشعار" : "Logo"}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{isAr ? "حجم الشعار (بكسل)" : "Logo size (px)"}</Label>
            <Input
              type="number"
              min={24}
              max={120}
              value={state.logo_size}
              onChange={(e) =>
                setState({
                  ...state,
                  logo_size: Math.max(24, Math.min(120, Number(e.target.value))),
                })
              }
            />
          </div>
          <div>
            <Label>{isAr ? "محاذاة الشعار" : "Logo alignment"}</Label>
            <div className="flex gap-2">
              {(["left", "center", "right"] as const).map((a) => (
                <Button
                  key={a}
                  type="button"
                  size="sm"
                  variant={state.logo_align === a ? "default" : "outline"}
                  onClick={() => setState({ ...state, logo_align: a })}
                >
                  {isAr ? (a === "left" ? "يسار" : a === "center" ? "وسط" : "يمين") : a}
                </Button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2 space-y-3 border-t border-border pt-4">
            <div>
              <h3 className="font-medium text-sm">
                {isAr ? "تفضيلات العرض" : "Display Preferences"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {isAr
                  ? "تبقى أسماء العلامة محفوظة للهوية والبحث، ويمكن إخفاؤها بشكل مستقل في كل قسم."
                  : "Brand names remain saved for identity and SEO, but can be hidden independently in each storefront area."}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  [
                    "show_header_name",
                    isAr ? "إظهار الاسم بجانب الشعار" : "Show name beside header logo",
                  ],
                  [
                    "show_hero_title",
                    isAr ? "إظهار اسم العلامة في الواجهة" : "Show brand name in hero",
                  ],
                  ["show_hero_about", isAr ? "إظهار النبذة في الواجهة" : "Show About text in hero"],
                  [
                    "show_footer_name",
                    isAr ? "إظهار اسم العلامة في التذييل" : "Show brand name in footer",
                  ],
                ] as const
              ).map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border p-3"
                >
                  <div>
                    <Label className="cursor-pointer">{label}</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {isAr
                        ? "فعّل هذا الخيار لإظهار العنصر للعملاء في واجهة المتجر."
                        : "Turn this on to show the element to customers on the storefront."}
                    </p>
                  </div>
                  <Switch
                    checked={state[key]}
                    onCheckedChange={(checked) => setState({ ...state, [key]: checked })}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1 pt-2">
            <Label>
              {isAr ? "رقم الهاتف أو الحساب أو IBAN" : "Benefit phone, account number, or IBAN"}
            </Label>
            <Input
              value={(state as any).benefit_account_number ?? ""}
              onChange={(e) =>
                setState({ ...state, benefit_account_number: e.target.value } as any)
              }
              placeholder={
                isAr ? "يظهر للعميل مع زر النسخ" : "Shown to customers with a copy button"
              }
            />
          </div>
        </div>
        <div className="pt-3">
          <BrandHeroCard brandId={brandId} />
        </div>
      </div>

      <div
        className={
          settingsTab === "general" ? "space-y-4 rounded-xl border border-border p-4" : "hidden"
        }
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-medium text-sm">{isAr ? "شارات التنزيلات" : "Sale badges"}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAr
                ? "تحكم عام بإظهار شارات الخصم. ويمكن تخصيص كل منتج من المخزون."
                : "Master switch for discount badges. Individual products can be controlled in Inventory."}
            </p>
          </div>
          <Switch
            checked={state.global_sale_badges_enabled}
            onCheckedChange={(checked) =>
              setState({ ...state, global_sale_badges_enabled: checked })
            }
          />
        </div>
      </div>

      <div
        className={
          settingsTab === "content" ? "space-y-4 rounded-xl border border-border p-4" : "hidden"
        }
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-medium text-sm">{isAr ? "شريط الإعلانات" : "Announcement bar"}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAr
                ? "رسالة قابلة للتخصيص مع قواعد للصفحات والزوار."
                : "A customizable message with page and audience rules."}
            </p>
          </div>
          <Switch
            checked={state.announcement_enabled}
            onCheckedChange={(checked) => setState({ ...state, announcement_enabled: checked })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2" dir={contentLanguage === "ar" ? "rtl" : "ltr"}>
            <Label>{contentLanguage === "ar" ? "نص الإعلان" : "Announcement text"}</Label>
            <Input
              className={contentLanguage === "ar" ? "text-right" : "text-left"}
              value={
                (contentLanguage === "ar"
                  ? state.announcement_text_ar
                  : state.announcement_text_en) ?? ""
              }
              onChange={(e) =>
                setState({
                  ...state,
                  [contentLanguage === "ar" ? "announcement_text_ar" : "announcement_text_en"]:
                    e.target.value || null,
                })
              }
            />
          </div>
          <ColorField
            label={isAr ? "الخلفية" : "Background"}
            value={state.announcement_bg}
            onChange={(v) => setState({ ...state, announcement_bg: v || "#111111" })}
          />
          <ColorField
            label={isAr ? "لون النص" : "Text color"}
            value={state.announcement_fg}
            onChange={(v) => setState({ ...state, announcement_fg: v || "#ffffff" })}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["announcement_bold", isAr ? "عريض" : "Bold"],
              ["announcement_italic", isAr ? "مائل" : "Italic"],
              ["announcement_dismissible", isAr ? "قابل للإغلاق" : "Dismissible"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Switch
                checked={state[key]}
                onCheckedChange={(checked) => setState({ ...state, [key]: checked })}
              />
              <Label>{label}</Label>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>{isAr ? "الصفحات" : "Pages"}</Label>
            <Select
              value={state.announcement_scope}
              onValueChange={(v: any) => setState({ ...state, announcement_scope: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "كل الصفحات" : "All pages"}</SelectItem>
                <SelectItem value="home">{isAr ? "الرئيسية فقط" : "Homepage only"}</SelectItem>
                <SelectItem value="catalog">{isAr ? "صفحات التسوق" : "Shopping pages"}</SelectItem>
                <SelectItem value="checkout">{isAr ? "الدفع فقط" : "Checkout only"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isAr ? "الجمهور" : "Audience"}</Label>
            <Select
              value={state.announcement_audience}
              onValueChange={(v: any) => setState({ ...state, announcement_audience: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "الجميع" : "Everyone"}</SelectItem>
                <SelectItem value="guest">{isAr ? "الزوار" : "Guests"}</SelectItem>
                <SelectItem value="authenticated">
                  {isAr ? "المسجلون" : "Signed-in customers"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div
        className={
          settingsTab === "theme" ? "space-y-4 rounded-xl border border-border p-4" : "hidden"
        }
      >
        <div>
          <h3 className="font-medium text-sm">{isAr ? "ألوان المتجر" : "Storefront colors"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "هذه الألوان خاصة بالمتجر ولا تؤثر على الفواتير."
              : "These colors apply only to the storefront and never affect invoices."}
          </p>
        </div>
        <ColorField
          label={isAr ? "لون المتجر الأساسي" : "Storefront accent color"}
          value={state.storefront_accent_color}
          onChange={(value) => setState({ ...state, storefront_accent_color: value })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorField
            label={isAr ? "خلفية المتجر" : "Storefront background"}
            value={state.storefront_background_color}
            onChange={(value) => setState({ ...state, storefront_background_color: value })}
          />
          <ColorField
            label={isAr ? "نص المتجر" : "Storefront text"}
            value={state.storefront_text_color}
            onChange={(value) => setState({ ...state, storefront_text_color: value })}
          />
        </div>
      </div>

      <div
        className={
          settingsTab === "theme" ? "space-y-4 rounded-xl border border-border p-4" : "hidden"
        }
      >
        <div>
          <h3 className="font-medium text-sm">{isAr ? "خطوط المتجر" : "Storefront fonts"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "اختر خطاً مستقلاً لكل لغة في واجهة المتجر."
              : "Choose an independent website font for each storefront language."}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{isAr ? "الخط الإنجليزي" : "English font"}</Label>
            <Select
              value={state.storefront_font_en}
              onValueChange={(value) => setState({ ...state, storefront_font_en: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOREFRONT_EN_FONTS.map((font) => (
                  <SelectItem key={font} value={font}>
                    <span style={{ fontFamily: font }}>{font}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 flex gap-2">
              <Input
                readOnly
                value={
                  state.storefront_font_en_url
                    ? isAr
                      ? "خط مخصص مرفوع"
                      : "Custom font uploaded"
                    : ""
                }
                placeholder={isAr ? "أو ارفع خطاً مخصصاً" : "Or upload a custom font"}
              />
              <input
                ref={enFontInput}
                type="file"
                accept=".woff,.woff2,.ttf,.otf"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] && uploadStorefrontFont(e.target.files[0], "en")
                }
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={uploadingFont === "en"}
                onClick={() => enFontInput.current?.click()}
              >
                <Upload className="h-4 w-4" />
              </Button>
              {state.storefront_font_en_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setState({ ...state, storefront_font_en_url: null })}
                >
                  {isAr ? "إزالة" : "Remove"}
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label>{isAr ? "الخط العربي" : "Arabic font"}</Label>
            <Select
              value={state.storefront_font_ar}
              onValueChange={(value) => setState({ ...state, storefront_font_ar: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOREFRONT_AR_FONTS.map((font) => (
                  <SelectItem key={font} value={font}>
                    <span style={{ fontFamily: font }}>{font}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 flex gap-2">
              <Input
                readOnly
                value={
                  state.storefront_font_ar_url
                    ? isAr
                      ? "خط مخصص مرفوع"
                      : "Custom font uploaded"
                    : ""
                }
                placeholder={isAr ? "أو ارفع خطاً مخصصاً" : "Or upload a custom font"}
              />
              <input
                ref={arFontInput}
                type="file"
                accept=".woff,.woff2,.ttf,.otf"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] && uploadStorefrontFont(e.target.files[0], "ar")
                }
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={uploadingFont === "ar"}
                onClick={() => arFontInput.current?.click()}
              >
                <Upload className="h-4 w-4" />
              </Button>
              {state.storefront_font_ar_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setState({ ...state, storefront_font_ar_url: null })}
                >
                  {isAr ? "إزالة" : "Remove"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className={
          settingsTab === "content" ? "space-y-4 rounded-xl border border-border p-4" : "hidden"
        }
      >
        <div>
          <h3 className="font-medium text-sm">{isAr ? "عنوان الواجهة الرئيسي" : "Hero title"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "تحكم مستقل في اسم العلامة الظاهر فوق صورة الواجهة."
              : "Independent styling for the brand name displayed over the hero media."}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2" dir={contentLanguage === "ar" ? "rtl" : "ltr"}>
            <Label>{contentLanguage === "ar" ? "عنوان الواجهة" : "Hero title"}</Label>
            <Input
              className={contentLanguage === "ar" ? "text-right" : "text-left"}
              value={(contentLanguage === "ar" ? state.hero_title_ar : state.hero_title_en) ?? ""}
              placeholder={
                contentLanguage === "ar"
                  ? "فارغ يستخدم اسم العلامة بالعربية"
                  : "Blank uses the English brand name"
              }
              onChange={(e) =>
                setState({
                  ...state,
                  [contentLanguage === "ar" ? "hero_title_ar" : "hero_title_en"]:
                    e.target.value || null,
                })
              }
            />
          </div>
          <div>
            <Label>{isAr ? "حجم العنوان (بكسل)" : "Title size (px)"}</Label>
            <Input
              type="number"
              min={24}
              max={96}
              value={state.hero_title_size}
              onChange={(e) =>
                setState({
                  ...state,
                  hero_title_size: Math.max(24, Math.min(96, Number(e.target.value))),
                })
              }
            />
          </div>
          <ColorField
            label={isAr ? "لون عنوان الواجهة" : "Hero title color"}
            value={state.hero_title_color}
            onChange={(value) => setState({ ...state, hero_title_color: value })}
          />
          <div className="sm:col-span-2">
            <Label>{isAr ? "محاذاة العنوان" : "Title alignment"}</Label>
            <div className="mt-1 flex gap-2">
              {(["start", "center", "end"] as const).map((alignment) => (
                <Button
                  key={alignment}
                  type="button"
                  size="sm"
                  variant={state.hero_title_align === alignment ? "default" : "outline"}
                  onClick={() => setState({ ...state, hero_title_align: alignment })}
                >
                  {isAr
                    ? alignment === "start"
                      ? "البداية"
                      : alignment === "center"
                        ? "الوسط"
                        : "النهاية"
                    : alignment}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={settingsTab === "theme" ? "space-y-3" : "hidden"}>
        <h3 className="font-medium text-sm">{isAr ? "الترويسة والتذييل" : "Header & Footer"}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorField
            label={isAr ? "خلفية الترويسة" : "Header background"}
            value={state.header_bg}
            onChange={(v) => setState({ ...state, header_bg: v })}
          />
          <ColorField
            label={isAr ? "نص الترويسة" : "Header text"}
            value={state.header_fg}
            onChange={(v) => setState({ ...state, header_fg: v })}
          />
          <ColorField
            label={isAr ? "خلفية التذييل" : "Footer background"}
            value={state.footer_bg}
            onChange={(v) => setState({ ...state, footer_bg: v })}
          />
          <ColorField
            label={isAr ? "نص التذييل" : "Footer text"}
            value={state.footer_fg}
            onChange={(v) => setState({ ...state, footer_fg: v })}
          />
        </div>
      </div>

      <div
        className={
          settingsTab === "content" ? "space-y-4 rounded-xl border border-border p-4" : "hidden"
        }
      >
        <div>
          <h3 className="font-medium text-sm">{isAr ? "قائمة المتجر" : "Storefront menu"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "خصص عنوان وألوان وروابط قائمة التنقل. الصفحات الإضافية تدار من الصفحات والسياسات."
              : "Customize the drawer title, colors, and core links. Additional links come from Pages & Policies."}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2" dir={contentLanguage === "ar" ? "rtl" : "ltr"}>
            <Label>{contentLanguage === "ar" ? "عنوان القائمة" : "Menu title"}</Label>
            <Input
              className={contentLanguage === "ar" ? "text-right" : "text-left"}
              value={(contentLanguage === "ar" ? state.menu_title_ar : state.menu_title_en) ?? ""}
              placeholder={
                contentLanguage === "ar"
                  ? "فارغ يستخدم اسم العلامة بالعربية"
                  : "Blank uses the brand name"
              }
              onChange={(e) =>
                setState({
                  ...state,
                  [contentLanguage === "ar" ? "menu_title_ar" : "menu_title_en"]:
                    e.target.value || null,
                })
              }
            />
          </div>
          <ColorField
            label={isAr ? "خلفية القائمة" : "Menu background"}
            value={state.menu_bg}
            onChange={(value) => setState({ ...state, menu_bg: value })}
          />
          <ColorField
            label={isAr ? "نص القائمة" : "Menu text"}
            value={state.menu_fg}
            onChange={(value) => setState({ ...state, menu_fg: value })}
          />
        </div>
        <div
          className={settingsTab === "content" ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "hidden"}
        >
          {(
            [
              ["menu_show_home", isAr ? "إظهار الرئيسية" : "Show Home"],
              ["menu_show_account", isAr ? "إظهار الحساب وتسجيل الدخول" : "Show Account / Sign in"],
              ["menu_show_orders", isAr ? "إظهار طلباتي" : "Show My orders"],
              ["menu_show_pages", isAr ? "إظهار الصفحات المخصصة" : "Show custom pages"],
            ] as const
          ).map(([key, label]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
            >
              <Label className="cursor-pointer">{label}</Label>
              <Switch
                checked={state[key]}
                onCheckedChange={(checked) => setState({ ...state, [key]: checked })}
              />
            </div>
          ))}
        </div>
      </div>

      {hasLoaderColumns && (
        <div
          className={
            settingsTab === "content" ? "space-y-4 rounded-xl border border-border p-4" : "hidden"
          }
        >
          <div>
            <h3 className="font-medium text-sm">
              {isAr ? "شاشة تحميل المتجر" : "Storefront loading screen"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAr
                ? "خصص العبارة التي تظهر للمتسوقين أثناء فتح موقعك."
                : "Customize the loading message shoppers see when they first open your website."}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div dir="rtl">
              <Label>{isAr ? "عبارة التحميل (العربية)" : "Loading text (Arabic)"}</Label>
              <Input
                className="text-right"
                value={state.storefront_loader_text_ar ?? ""}
                placeholder="جاري فتح المتجر الإلكتروني..."
                onChange={(e) =>
                  setState({ ...state, storefront_loader_text_ar: e.target.value || null })
                }
              />
            </div>
            <div dir="ltr">
              <Label>{isAr ? "عبارة التحميل (الإنجليزية)" : "Loading text (English)"}</Label>
              <Input
                className="text-left"
                value={state.storefront_loader_text_en ?? ""}
                placeholder="Resolving boutique storefront..."
                onChange={(e) =>
                  setState({ ...state, storefront_loader_text_en: e.target.value || null })
                }
              />
            </div>
          </div>
        </div>
      )}

      <div
        className={
          settingsTab === "content" || settingsTab === "promotions"
            ? "space-y-4 rounded-xl border border-border p-4"
            : "hidden"
        }
      >
        <div>
          <h3 className="font-medium text-sm">
            {isAr ? "أقسام الصفحة الرئيسية" : "Homepage merchandising"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "خصص أربع بطاقات ترويجية وروابطها. مقاس التصميم الموصى به: 1200 × 600 بكسل (نسبة 2:1)."
              : "Customize four promotional cards and their destinations. Recommended artwork: 1200 × 600 px (2:1 ratio)."}
          </p>
        </div>
        <div
          className={settingsTab === "content" ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "hidden"}
        >
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <Label>{isAr ? "إظهار وصل حديثاً" : "Show New arrivals"}</Label>
            <Switch
              checked={state.show_new_arrivals}
              onCheckedChange={(checked) => setState({ ...state, show_new_arrivals: checked })}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <Label>{isAr ? "إظهار الأكثر مبيعاً" : "Show Best sellers"}</Label>
            <Switch
              checked={state.show_best_sellers}
              onCheckedChange={(checked) => setState({ ...state, show_best_sellers: checked })}
            />
          </div>
          <div dir={contentLanguage === "ar" ? "rtl" : "ltr"}>
            <Label>{contentLanguage === "ar" ? "عنوان وصل حديثاً" : "New arrivals title"}</Label>
            <Input
              className={contentLanguage === "ar" ? "text-right" : "text-left"}
              value={
                (contentLanguage === "ar"
                  ? state.new_arrivals_title_ar
                  : state.new_arrivals_title_en) ?? ""
              }
              placeholder={contentLanguage === "ar" ? "وصل حديثاً" : "New arrivals"}
              onChange={(e) =>
                setState({
                  ...state,
                  [contentLanguage === "ar" ? "new_arrivals_title_ar" : "new_arrivals_title_en"]:
                    e.target.value || null,
                })
              }
            />
          </div>
          <div dir={contentLanguage === "ar" ? "rtl" : "ltr"}>
            <Label>{contentLanguage === "ar" ? "عنوان الأكثر مبيعاً" : "Best sellers title"}</Label>
            <Input
              className={contentLanguage === "ar" ? "text-right" : "text-left"}
              value={
                (contentLanguage === "ar"
                  ? state.best_sellers_title_ar
                  : state.best_sellers_title_en) ?? ""
              }
              placeholder={contentLanguage === "ar" ? "الأكثر مبيعاً" : "Best sellers"}
              onChange={(e) =>
                setState({
                  ...state,
                  [contentLanguage === "ar" ? "best_sellers_title_ar" : "best_sellers_title_en"]:
                    e.target.value || null,
                })
              }
            />
          </div>
        </div>
        <div
          className={
            settingsTab === "promotions" ? "grid grid-cols-1 gap-4 lg:grid-cols-2" : "hidden"
          }
        >
          {state.home_promo_cards.map((card, index) => (
            <div key={index} className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">
                    {isAr ? `بنر ترويجي ${index + 1}` : `Promotion Banner ${index + 1}`}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">1200 × 600 px</p>
                </div>
                {card.image_url && (
                  <img
                    src={card.image_url}
                    alt=""
                    className="aspect-[2/1] h-12 rounded object-cover"
                  />
                )}
              </div>
              <div className="grid gap-2" dir={contentLanguage === "ar" ? "rtl" : "ltr"}>
                <div>
                  <Label>{contentLanguage === "ar" ? "عنوان البنر" : "Banner title"}</Label>
                  <Input
                    className={contentLanguage === "ar" ? "text-right" : "text-left"}
                    value={contentLanguage === "ar" ? card.title_ar : card.title_en}
                    onChange={(e) =>
                      updatePromoCard(index, {
                        [contentLanguage === "ar" ? "title_ar" : "title_en"]: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>{contentLanguage === "ar" ? "وصف البنر" : "Banner subtitle"}</Label>
                  <Input
                    className={contentLanguage === "ar" ? "text-right" : "text-left"}
                    value={contentLanguage === "ar" ? card.subtitle_ar : card.subtitle_en}
                    onChange={(e) =>
                      updatePromoCard(index, {
                        [contentLanguage === "ar" ? "subtitle_ar" : "subtitle_en"]: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>{isAr ? "رابط التوجيه عند الضغط" : "Banner Click Link"}</Label>
                <Input
                  value={card.href}
                  placeholder={
                    isAr
                      ? "/pura/search?q=abaya أو رابط كامل"
                      : "/pura/search?q=abaya or a full URL"
                  }
                  onChange={(e) => updatePromoCard(index, { href: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Input
                  value={card.image_url}
                  placeholder={isAr ? "رابط الصورة" : "Image URL"}
                  onChange={(e) => updatePromoCard(index, { image_url: e.target.value })}
                />
                <label className="inline-flex h-10 cursor-pointer items-center rounded-md border px-3 text-sm">
                  <Upload className="me-2 h-4 w-4" />
                  {isAr ? "رفع" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      e.target.files?.[0] && uploadPromoImage(index, e.target.files[0])
                    }
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ColorField
                  label={isAr ? "الخلفية" : "Background"}
                  value={card.background_color}
                  onChange={(value) =>
                    updatePromoCard(index, { background_color: value || "#f4f4f4" })
                  }
                />
                <ColorField
                  label={isAr ? "النص" : "Text"}
                  value={card.text_color}
                  onChange={(value) => updatePromoCard(index, { text_color: value || "#ffffff" })}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={settingsTab === "theme" ? "space-y-3" : "hidden"}>
        <h3 className="font-medium text-sm">{isAr ? "الطباعة" : "Typography"}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorField
            label={isAr ? "لون العناوين" : "Heading color"}
            value={state.heading_color}
            onChange={(v) => setState({ ...state, heading_color: v })}
          />
          <ColorField
            label={isAr ? "لون الروابط" : "Link color"}
            value={state.link_color}
            onChange={(v) => setState({ ...state, link_color: v })}
          />
        </div>
      </div>

      <div className={settingsTab === "theme" ? "space-y-3" : "hidden"}>
        <h3 className="font-medium text-sm">{isAr ? "الأزرار" : "Buttons"}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorField
            label={isAr ? "خلفية الزر الأساسي (أضف للسلة)" : "Primary button bg (Add to cart)"}
            value={state.btn_primary_bg}
            onChange={(v) => setState({ ...state, btn_primary_bg: v })}
          />
          <ColorField
            label={isAr ? "نص الزر الأساسي" : "Primary button text"}
            value={state.btn_primary_fg}
            onChange={(v) => setState({ ...state, btn_primary_fg: v })}
          />
          <ColorField
            label={isAr ? "خلفية الزر الثانوي (اشتر الآن)" : "Secondary button bg (Buy now)"}
            value={state.btn_secondary_bg}
            onChange={(v) => setState({ ...state, btn_secondary_bg: v })}
          />
          <ColorField
            label={isAr ? "نص الزر الثانوي" : "Secondary button text"}
            value={state.btn_secondary_fg}
            onChange={(v) => setState({ ...state, btn_secondary_fg: v })}
          />
          <ColorField
            label={isAr ? "خلفية زر إتمام الشراء" : "Checkout button bg"}
            value={state.btn_checkout_bg}
            onChange={(v) => setState({ ...state, btn_checkout_bg: v })}
          />
          <ColorField
            label={isAr ? "نص زر إتمام الشراء" : "Checkout button text"}
            value={state.btn_checkout_fg}
            onChange={(v) => setState({ ...state, btn_checkout_fg: v })}
          />
          <ColorField
            label={isAr ? "خلفية زر السلة المنبثقة" : "Cart drawer checkout background"}
            value={state.cart_drawer_checkout_bg}
            onChange={(v) => setState({ ...state, cart_drawer_checkout_bg: v })}
          />
          <ColorField
            label={isAr ? "نص زر السلة المنبثقة" : "Cart drawer checkout text"}
            value={state.cart_drawer_checkout_fg}
            onChange={(v) => setState({ ...state, cart_drawer_checkout_fg: v })}
          />
        </div>
      </div>

      <div className="sticky bottom-3 z-10 flex justify-end rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Button onClick={save} disabled={saving}>
          {saving
            ? isAr
              ? "جارٍ الحفظ..."
              : "Saving..."
            : isAr
              ? "حفظ إعدادات المتجر"
              : "Save storefront settings"}
        </Button>
      </div>
    </Card>
  );
}

// ---------------- Branches (Pickup) ----------------
type BranchRow = {
  id: string;
  brand_id: string;
  user_id: string;
  name_ar: string | null;
  name_en: string | null;
  location_ar: string | null;
  location_en: string | null;
  notes_ar: string | null;
  notes_en: string | null;
  is_active: boolean;
};

function BranchesCard({ brandId }: { brandId: string }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["branches", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches" as any)
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BranchRow[];
    },
  });
  const [draft, setDraft] = useState<Partial<BranchRow>>({});
  const addBranch = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      toast.error(isAr ? "يرجى تسجيل الدخول مرة أخرى" : "Please sign in again");
      return;
    }
    const payload = {
      brand_id: brandId,
      user_id: user.id,
      name_ar: draft.name_ar?.trim() || null,
      name_en: draft.name_en?.trim() || null,
      location_ar: draft.location_ar?.trim() || null,
      location_en: draft.location_en?.trim() || null,
      notes_ar: draft.notes_ar?.trim() || null,
      notes_en: draft.notes_en?.trim() || null,
      is_active: true,
    };
    if (!payload.name_ar && !payload.name_en) {
      toast.error(isAr ? "الاسم مطلوب" : "Name is required");
      return;
    }
    const { error } = await (supabase.from("branches" as any) as any).insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft({});
    qc.invalidateQueries({ queryKey: ["branches", brandId] });
  };
  const patch = async (id: string, changes: Partial<BranchRow>) => {
    const { error } = await (supabase.from("branches" as any) as any).update(changes).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["branches", brandId] });
  };
  const remove = async (id: string) => {
    if (!confirm(isAr ? "حذف الفرع؟" : "Delete this branch?")) return;
    const { error } = await (supabase.from("branches" as any) as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["branches", brandId] });
  };
  return (
    <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">
          {isAr ? "الفروع (للاستلام)" : "Branches (for Pickup)"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "تظهر الفروع النشطة للعميل عند اختيار الاستلام من الفرع."
            : "Active branches appear at checkout when customer selects Pickup."}
        </p>
      </div>

      <div className="space-y-3">
        {(q.data ?? []).map((b) => (
          <div key={b.id} className="rounded-lg border border-border p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</Label>
                <Input
                  defaultValue={b.name_ar ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (b.name_ar ?? "") &&
                    patch(b.id, { name_ar: e.target.value || null })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</Label>
                <Input
                  defaultValue={b.name_en ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (b.name_en ?? "") &&
                    patch(b.id, { name_en: e.target.value || null })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">{isAr ? "الموقع (عربي)" : "Location (Arabic)"}</Label>
                <Input
                  defaultValue={b.location_ar ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (b.location_ar ?? "") &&
                    patch(b.id, { location_ar: e.target.value || null })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">
                  {isAr ? "الموقع (إنجليزي)" : "Location (English)"}
                </Label>
                <Input
                  defaultValue={b.location_en ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (b.location_en ?? "") &&
                    patch(b.id, { location_en: e.target.value || null })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">
                  {isAr ? "ملاحظات الاستلام (عربي)" : "Pickup notes (Arabic)"}
                </Label>
                <Textarea
                  rows={2}
                  defaultValue={b.notes_ar ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (b.notes_ar ?? "") &&
                    patch(b.id, { notes_ar: e.target.value || null })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">
                  {isAr ? "ملاحظات الاستلام (إنجليزي)" : "Pickup notes (English)"}
                </Label>
                <Textarea
                  rows={2}
                  defaultValue={b.notes_en ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (b.notes_en ?? "") &&
                    patch(b.id, { notes_en: e.target.value || null })
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={b.is_active}
                  onCheckedChange={(v) => patch(b.id, { is_active: v })}
                />
                <span className="text-sm">
                  {b.is_active ? (isAr ? "مفعّل" : "Active") : isAr ? "موقوف" : "Inactive"}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(b.id)}>
                <Trash2 className="h-4 w-4 me-1" />
                {isAr ? "حذف" : "Delete"}
              </Button>
            </div>
          </div>
        ))}
        {(q.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isAr ? "لم يتم إضافة أي فروع بعد." : "No branches added yet."}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
        <div className="text-sm font-medium">{isAr ? "إضافة فرع جديد" : "Add new branch"}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            placeholder={isAr ? "الاسم (عربي)" : "Name (Arabic)"}
            value={draft.name_ar ?? ""}
            onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })}
          />
          <Input
            placeholder={isAr ? "الاسم (إنجليزي)" : "Name (English)"}
            value={draft.name_en ?? ""}
            onChange={(e) => setDraft({ ...draft, name_en: e.target.value })}
          />
          <Input
            placeholder={isAr ? "الموقع (عربي)" : "Location (Arabic)"}
            value={draft.location_ar ?? ""}
            onChange={(e) => setDraft({ ...draft, location_ar: e.target.value })}
          />
          <Input
            placeholder={isAr ? "الموقع (إنجليزي)" : "Location (English)"}
            value={draft.location_en ?? ""}
            onChange={(e) => setDraft({ ...draft, location_en: e.target.value })}
          />
        </div>
        <Button size="sm" onClick={addBranch}>
          {isAr ? "إضافة" : "Add branch"}
        </Button>
      </div>
    </Card>
  );
}

// ---------------- Email Settings ----------------
function EmailSettingsCard({ brandId }: { brandId: string }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [state, setState] = useState<{
    email_sender_name: string;
    email_intro_ar: string;
    email_intro_en: string;
    email_footer_ar: string;
    email_footer_en: string;
    courier_out_for_delivery_message_ar: string;
    courier_out_for_delivery_message_en: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const introArRef = useRef<HTMLTextAreaElement>(null);
  const introEnRef = useRef<HTMLTextAreaElement>(null);
  const whatsappArRef = useRef<HTMLTextAreaElement>(null);
  const whatsappEnRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("business_settings")
        .select(
          "email_sender_name, email_intro_ar, email_intro_en, email_footer_ar, email_footer_en, courier_out_for_delivery_message_ar, courier_out_for_delivery_message_en",
        )
        .eq("brand_id", brandId)
        .maybeSingle();
      if (!data) return;
      setState({
        email_sender_name: (data as any).email_sender_name ?? "",
        email_intro_ar: (data as any).email_intro_ar ?? "",
        email_intro_en: (data as any).email_intro_en ?? "",
        email_footer_ar: (data as any).email_footer_ar ?? "",
        email_footer_en: (data as any).email_footer_en ?? "",
        courier_out_for_delivery_message_ar:
          (data as any).courier_out_for_delivery_message_ar ?? "",
        courier_out_for_delivery_message_en:
          (data as any).courier_out_for_delivery_message_en ?? "",
      });
    })();
  }, [brandId]);

  const save = async () => {
    if (!state) return;
    setSaving(true);
    const { error } = await supabase
      .from("business_settings")
      .update({
        email_sender_name: state.email_sender_name.trim() || null,
        email_intro_ar: state.email_intro_ar.trim() || null,
        email_intro_en: state.email_intro_en.trim() || null,
        email_footer_ar: state.email_footer_ar.trim() || null,
        email_footer_en: state.email_footer_en.trim() || null,
        courier_out_for_delivery_message_ar:
          state.courier_out_for_delivery_message_ar.trim() || null,
        courier_out_for_delivery_message_en:
          state.courier_out_for_delivery_message_en.trim() || null,
      } as any)
      .eq("brand_id", brandId);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success(isAr ? "تم الحفظ" : "Saved");
  };

  const injectPlaceholder = (
    ref: React.RefObject<HTMLTextAreaElement | null>,
    field:
      | "email_intro_ar"
      | "email_intro_en"
      | "courier_out_for_delivery_message_ar"
      | "courier_out_for_delivery_message_en",
    placeholder: string,
  ) => {
    const el = ref.current;
    if (!el || !state) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const before = text.substring(0, start);
    const after = text.substring(end);
    const newValue = before + placeholder + after;
    setState({ ...state, [field]: newValue });

    setTimeout(() => {
      el.focus();
      const newCursorPos = start + placeholder.length;
      el.setSelectionRange(newCursorPos, newCursorPos);
    }, 50);
  };

  const variables = [
    { value: "{{customer_name}}", label: isAr ? "اسم العميل" : "Customer" },
    { value: "{{invoice_number}}", label: isAr ? "رقم الفاتورة" : "Invoice #" },
    { value: "{{brand_name}}", label: isAr ? "اسم العلامة" : "Brand Name" },
  ];

  const renderPills = (
    ref: React.RefObject<HTMLTextAreaElement | null>,
    field:
      | "email_intro_ar"
      | "email_intro_en"
      | "courier_out_for_delivery_message_ar"
      | "courier_out_for_delivery_message_en",
  ) => (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {variables.map((v) => (
        <button
          key={v.value}
          type="button"
          onClick={() => injectPlaceholder(ref, field, v.value)}
          className="inline-flex items-center rounded-full bg-secondary/80 hover:bg-secondary border border-border px-2.5 py-0.5 text-[11px] font-medium text-foreground transition-colors shadow-xs cursor-pointer select-none"
        >
          <span className="text-muted-foreground">{v.label}:</span>
          <span className="ms-1 font-mono text-primary font-semibold">{v.value}</span>
        </button>
      ))}
    </div>
  );

  if (!state) return null;

  return (
    <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">
          {isAr ? "إعدادات بريد الطلبات" : "Order email settings"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "خصّص اسم المرسل والنصوص المرسلة للعميل عند تأكيد الطلب."
            : "Customize sender name and messages sent to customers with the order confirmation."}
        </p>
      </div>
      <div>
        <Label>{isAr ? "اسم المُرسِل (يظهر في البريد)" : "Sender display name (From)"}</Label>
        <Input
          value={state.email_sender_name}
          onChange={(e) => setState({ ...state, email_sender_name: e.target.value })}
          placeholder={isAr ? "مثل: متجر بيورا" : "e.g. Pura Store"}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>{isAr ? "نص الترحيب (عربي)" : "Intro (Arabic)"}</Label>
          <Textarea
            ref={introArRef}
            rows={3}
            value={state.email_intro_ar}
            onChange={(e) => setState({ ...state, email_intro_ar: e.target.value })}
          />
          {renderPills(introArRef, "email_intro_ar")}
        </div>
        <div className="space-y-1">
          <Label>{isAr ? "نص الترحيب (إنجليزي)" : "Intro (English)"}</Label>
          <Textarea
            ref={introEnRef}
            rows={3}
            value={state.email_intro_en}
            onChange={(e) => setState({ ...state, email_intro_en: e.target.value })}
          />
          {renderPills(introEnRef, "email_intro_en")}
        </div>
        <div className="space-y-1">
          <Label>{isAr ? "التذييل (عربي)" : "Footer (Arabic)"}</Label>
          <Textarea
            rows={2}
            value={state.email_footer_ar}
            onChange={(e) => setState({ ...state, email_footer_ar: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>{isAr ? "التذييل (إنجليزي)" : "Footer (English)"}</Label>
          <Textarea
            rows={2}
            value={state.email_footer_en}
            onChange={(e) => setState({ ...state, email_footer_en: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-3 rounded-lg border p-4">
        <div>
          <h4 className="font-semibold">
            {isAr ? "رسالة واتساب عند خروج الطلب للتوصيل" : "Out-for-delivery WhatsApp message"}
          </h4>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "انقر على الأزرار أدناه لإدراج المتغيرات في موضع المؤشر:"
              : "Click on the buttons below to inject variables at cursor selection index:"}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{isAr ? "الرسالة بالعربية" : "Arabic message"}</Label>
            <Textarea
              ref={whatsappArRef}
              dir="rtl"
              rows={4}
              value={state.courier_out_for_delivery_message_ar}
              onChange={(e) =>
                setState({ ...state, courier_out_for_delivery_message_ar: e.target.value })
              }
            />
            {renderPills(whatsappArRef, "courier_out_for_delivery_message_ar")}
          </div>
          <div className="space-y-1">
            <Label>{isAr ? "الرسالة بالإنجليزية" : "English message"}</Label>
            <Textarea
              ref={whatsappEnRef}
              dir="ltr"
              rows={4}
              value={state.courier_out_for_delivery_message_en}
              onChange={(e) =>
                setState({ ...state, courier_out_for_delivery_message_en: e.target.value })
              }
            />
            {renderPills(whatsappEnRef, "courier_out_for_delivery_message_en")}
          </div>
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {isAr ? "حفظ إعدادات البريد" : "Save email settings"}
        </Button>
      </div>
    </Card>
  );
}
