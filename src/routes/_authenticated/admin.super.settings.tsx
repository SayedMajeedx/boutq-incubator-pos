import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { SUPER_ADMIN_EMAIL } from "@/lib/profile-context";
import {
  getPlatformSettings,
  updatePlatformSettings,
  getPlatformLogoUploadUrl,
  getPlatformQrUploadUrl,
} from "@/lib/onboarding.functions";
import {
  Sliders,
  DollarSign,
  Phone,
  UploadCloud,
  Loader2,
  Image as ImageIcon,
  Check,
  ArrowRight,
  ShieldAlert,
  Trash2,
  Globe,
  QrCode,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/super/settings")({
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
  component: SuperAdminSettings,
});

function SuperAdminSettings() {
  const { lang } = useI18n();
  const qc = useQueryClient();

  // Local state form handlers
  const [basePrice, setBasePrice] = useState<number>(55);
  const [discountPrice, setDiscountPrice] = useState<number | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState("97339955508");
  const [platformIconUrl, setPlatformIconUrl] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [benefitPayQrUrl, setBenefitPayQrUrl] = useState<string | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [merchantAccountName, setMerchantAccountName] = useState("BOUTQ-OFFICIAL");
  const [impersonationBypass, setImpersonationBypass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingUploadingLogo] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);

  // Load platform settings
  const settingsQuery = useQuery({
    queryKey: ["platform-settings-singleton"],
    queryFn: async () => {
      const data = await getPlatformSettings();
      return data;
    },
  });

  // Sync state once query data resolves
  useEffect(() => {
    if (settingsQuery.data) {
      const s = settingsQuery.data as any;
      if (s.base_price_bhd !== undefined) setBasePrice(Number(s.base_price_bhd));
      setDiscountPrice(s.discount_price_bhd ? Number(s.discount_price_bhd) : null);
      if (s.whatsapp_support_number) setWhatsappNumber(s.whatsapp_support_number);
      setPlatformIconUrl(s.platform_icon_url || null);
      setLogoPreviewUrl(s.platform_icon_url || null);
      setBenefitPayQrUrl(s.benefit_pay_qr_url || null);
      setQrPreviewUrl(s.benefit_pay_qr_url || null);
      setMerchantAccountName(s.merchant_account_name || "BOUTQ-OFFICIAL");
      setImpersonationBypass(!!s.superadmin_impersonation_mutation_allowed);
    }
  }, [settingsQuery.data]);

  // Handle master logo upload to public R2
  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      toast.error(
        lang === "ar"
          ? "الرجاء رفع صورة صالحة (PNG, JPEG, WEBP, SVG)."
          : "Please upload a valid image file (PNG, JPEG, WEBP, SVG).",
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(
        lang === "ar" ? "الحد الأقصى لحجم الملف هو 5 ميجابايت." : "Maximum logo file size is 5MB.",
      );
      return;
    }

    setUploadingUploadingLogo(true);
    const toastId = toast.loading(
      lang === "ar" ? "جاري تفعيل قناة التحميل..." : "Opening secure logo upload channel...",
    );

    try {
      const { uploadUrl, publicUrl } = await getPlatformLogoUploadUrl({
        data: { contentType: file.type },
      });

      toast.loading(
        lang === "ar"
          ? "جاري حفظ وتجهيز الشعار الفاخر..."
          : "Storing master logo in R2 public storage...",
        { id: toastId },
      );

      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!res.ok) throw new Error("R2 upload failure");

      setPlatformIconUrl(publicUrl);
      setLogoPreviewUrl(URL.createObjectURL(file));
      toast.success(
        lang === "ar"
          ? "تم رفع وتعيين شعار المنصة بنجاح!"
          : "Platform master logo uploaded successfully!",
        { id: toastId },
      );
    } catch (err) {
      console.error(err);
      toast.error(
        lang === "ar" ? "فشل تحميل الشعار. حاول مجدداً." : "Failed to upload logo asset.",
        { id: toastId },
      );
    } finally {
      setUploadingUploadingLogo(false);
    }
  };

  // Handle QR upload to public R2
  const handleUploadQr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error(
        lang === "ar"
          ? "الرجاء رفع صورة صالحة (PNG, JPEG, WEBP)."
          : "Please upload a valid image file (PNG, JPEG, WEBP).",
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(
        lang === "ar" ? "الحد الأقصى لحجم الملف هو 5 ميجابايت." : "Maximum QR file size is 5MB.",
      );
      return;
    }

    setUploadingQr(true);
    const toastId = toast.loading(
      lang === "ar" ? "جاري تفعيل قناة التحميل..." : "Opening secure QR upload channel...",
    );

    try {
      const { uploadUrl, publicUrl } = await getPlatformQrUploadUrl({
        data: { contentType: file.type },
      });

      toast.loading(
        lang === "ar"
          ? "جاري حفظ وتجهيز رمز الاستجابة السريع..."
          : "Storing QR code in R2 public storage...",
        { id: toastId },
      );

      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!res.ok) throw new Error("R2 upload failure");

      setBenefitPayQrUrl(publicUrl);
      setQrPreviewUrl(URL.createObjectURL(file));
      toast.success(
        lang === "ar"
          ? "تم رفع وتعيين رمز بنفت بي بنجاح!"
          : "BenefitPay QR code uploaded successfully!",
        { id: toastId },
      );
    } catch (err) {
      console.error(err);
      toast.error(lang === "ar" ? "فشل تحميل الرمز. حاول مجدداً." : "Failed to upload QR asset.", {
        id: toastId,
      });
    } finally {
      setUploadingQr(false);
    }
  };

  // Submit master settings save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const toastId = toast.loading(
      lang === "ar" ? "جاري حفظ إعدادات المنصة..." : "Saving global platform settings...",
    );

    try {
      await updatePlatformSettings({
        data: {
          basePriceBhd: Number(basePrice),
          discountPriceBhd: discountPrice ? Number(discountPrice) : null,
          platformIconUrl,
          benefitPayQrUrl,
          merchantAccountName: merchantAccountName.trim(),
          whatsappSupportNumber: whatsappNumber.trim(),
          superadminImpersonationMutationAllowed: impersonationBypass,
        },
      });

      await qc.invalidateQueries({ queryKey: ["platform-settings-singleton"] });

      toast.success(
        lang === "ar"
          ? "تم تحديث إعدادات المنصة بنجاح!"
          : "Platform configuration updated successfully!",
        { id: toastId },
      );
    } catch (err: any) {
      console.error(err);
      toast.error(
        lang === "ar"
          ? "فشل تحديث الإعدادات."
          : err.message || "Failed to update platform settings.",
        { id: toastId },
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (settingsQuery.isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8 animate-fade-in"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      {/* Premium Header bar */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-border/60 pb-5">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 dark:from-slate-50 dark:to-slate-300 flex items-center gap-2">
            <Sliders className="h-8 w-8 text-primary" />
            <span>{lang === "ar" ? "إعدادات المنصة العامة" : "Platform Master Settings"}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {lang === "ar"
              ? "تحكم ديناميكياً بأسعار التسجيل، شعار العلامة التجارية، وأرقام دعم العملاء."
              : "Manage core platform pricing, whitelabel logo branding, and client service attributes."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Row 1: Logo Asset Customization */}
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              {lang === "ar"
                ? "شعار المنصة الرئيسي (Whitelabel Assets)"
                : "Platform Master Logo Asset"}
            </CardTitle>
            <CardDescription className="text-xs">
              {lang === "ar"
                ? "يتم تحميل هذا الشعار في شاشات تسجيل التجار الجدد والمراسلات."
                : "This master icon/logo is dynamically injected into merchant onboarding routes."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row items-center gap-6">
              {/* Image Preview Block */}
              <div className="h-24 w-40 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-center overflow-hidden shrink-0 relative group">
                {logoPreviewUrl ? (
                  <>
                    <img src={logoPreviewUrl} alt="Logo Preview" className="h-16 object-contain" />
                    <button
                      type="button"
                      onClick={() => {
                        setPlatformIconUrl(null);
                        setLogoPreviewUrl(null);
                      }}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-500 transition-opacity rounded-lg"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </>
                ) : (
                  <div className="text-zinc-400 dark:text-zinc-600 flex flex-col items-center gap-1">
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-[10px] uppercase font-bold tracking-wider">Boutq</span>
                  </div>
                )}
              </div>

              {/* Upload Drag and Drop Target */}
              <div className="flex-1 w-full">
                <Label
                  htmlFor="logo-uploader"
                  className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-primary/50 rounded-lg p-6 cursor-pointer bg-zinc-50/50 dark:bg-zinc-950/10 hover:bg-zinc-100/30 transition-all text-center relative"
                >
                  {uploadingLogo ? (
                    <div className="space-y-2 flex flex-col items-center">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="text-xs font-medium text-zinc-500">
                        {lang === "ar" ? "جاري الرفع..." : "Uploading logo..."}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-zinc-500">
                      <UploadCloud className="h-6 w-6 mx-auto text-primary/80" />
                      <p className="text-xs font-semibold">
                        {lang === "ar" ? "اضغط لرفع الشعار الجديد" : "Click to select logo asset"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        PNG, JPG, WEBP, SVG (Max 5MB)
                      </p>
                    </div>
                  )}
                  <input
                    id="logo-uploader"
                    type="file"
                    accept="image/*"
                    onChange={handleUploadLogo}
                    disabled={uploadingLogo}
                    className="hidden"
                  />
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Row 2: Standard and Promotional Pricing Configuration */}
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              {lang === "ar" ? "تكوين أسعار التفعيل (BHD)" : "Onboarding Package Pricing"}
            </CardTitle>
            <CardDescription className="text-xs">
              {lang === "ar"
                ? "حدد السعر الأساسي والترويجي (Strikethrough Pricing) للخطط المدفوعة."
                : "Manage standard and promotional sale prices across dynamic registration screens."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Standard Price BHD */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                {lang === "ar"
                  ? "السعر الأساسي لتفعيل المتجر (BHD)"
                  : "Standard Lifetime Price (BHD)"}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  className="font-mono text-sm pl-12 h-11 border-zinc-200 dark:border-zinc-800 focus-visible:ring-primary"
                  value={basePrice}
                  onChange={(e) => setBasePrice(Number(e.target.value) || 0)}
                  required
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 uppercase">
                  BHD
                </span>
              </div>
            </div>

            {/* Discount Price BHD */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                <span>
                  {lang === "ar" ? "سعر الخصم النشط (BHD)" : "Promotional Discounted Price (BHD)"}
                </span>
                <span className="text-[10px] text-zinc-400 font-normal">
                  {lang === "ar"
                    ? "[اتركه فارغاً لعدم تطبيق خصم]"
                    : "[Leave blank for no discount]"}
                </span>
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 45.00"
                  className="font-mono text-sm pl-12 h-11 border-zinc-200 dark:border-zinc-800 focus-visible:ring-primary"
                  value={discountPrice !== null ? discountPrice : ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDiscountPrice(val === "" ? null : Number(val));
                  }}
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 uppercase">
                  BHD
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Row 2.5: BenefitPay Merchant Settings */}
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" />
              {lang === "ar" ? "إعدادات حساب بنفت بي (BenefitPay)" : "BenefitPay Merchant Settings"}
            </CardTitle>
            <CardDescription className="text-xs">
              {lang === "ar"
                ? "تخصيص اسم الحساب التجاري ورمز الاستجابة السريع المعروضين للتجار لإتمام السداد."
                : "Configure the merchant name and benefit pay QR code presented during official activation payments."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Merchant Account Name */}
            <div className="space-y-1.5 max-w-md">
              <Label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                {lang === "ar" ? "اسم الحساب التجاري" : "Merchant Account Name"}
              </Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="e.g. BOUTQ-OFFICIAL"
                  className="font-mono text-sm pl-12 h-11 border-zinc-200 dark:border-zinc-800 focus-visible:ring-primary"
                  value={merchantAccountName}
                  onChange={(e) => setMerchantAccountName(e.target.value)}
                  required
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2">
                  <Sliders className="h-4 w-4 text-zinc-400" />
                </span>
              </div>
            </div>

            {/* QR Code Upload Section */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                {lang === "ar"
                  ? "رمز الاستجابة السريع المخصص (QR Code Image)"
                  : "BenefitPay Merchant QR Code Asset"}
              </Label>
              <div className="flex flex-col md:flex-row items-center gap-6 pt-1">
                {/* QR Image Preview Block */}
                <div className="h-28 w-28 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-col items-center justify-center overflow-hidden shrink-0 relative group p-2">
                  {qrPreviewUrl ? (
                    <>
                      <img
                        src={qrPreviewUrl}
                        alt="QR Code Preview"
                        className="h-full w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setBenefitPayQrUrl(null);
                          setQrPreviewUrl(null);
                        }}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-500 transition-opacity rounded-lg"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </>
                  ) : (
                    <div className="text-zinc-400 dark:text-zinc-600 flex flex-col items-center gap-1.5 text-center">
                      <QrCode className="h-10 w-10 stroke-[1.25]" />
                      <span className="text-[8px] uppercase font-bold tracking-wider">
                        {lang === "ar" ? "افتراضي" : "Default QR"}
                      </span>
                    </div>
                  )}
                </div>

                {/* QR Upload Target */}
                <div className="flex-1 w-full">
                  <Label
                    htmlFor="qr-uploader"
                    className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-primary/50 rounded-lg p-5 cursor-pointer bg-zinc-50/50 dark:bg-zinc-950/10 hover:bg-zinc-100/30 transition-all text-center relative"
                  >
                    {uploadingQr ? (
                      <div className="space-y-2 flex flex-col items-center">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-xs font-medium text-zinc-500">
                          {lang === "ar" ? "جاري الرفع..." : "Uploading QR..."}
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1.5 text-zinc-500">
                        <UploadCloud className="h-5 w-5 mx-auto text-primary/80" />
                        <p className="text-xs font-semibold">
                          {lang === "ar"
                            ? "اضغط لرفع رمز الاستجابة السريع الجديد"
                            : "Click to select BenefitPay QR image"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          PNG, JPG, WEBP (Max 5MB)
                        </p>
                      </div>
                    )}
                    <input
                      id="qr-uploader"
                      type="file"
                      accept="image/*"
                      onChange={handleUploadQr}
                      disabled={uploadingQr}
                      className="hidden"
                    />
                  </Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Row 3: Support Contact Attribution */}
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              {lang === "ar" ? "قنوات التواصل والدعم" : "Attribution & Support Settings"}
            </CardTitle>
            <CardDescription className="text-xs">
              {lang === "ar"
                ? "يتم استخدام رقم هاتف الواتساب هذا لتأكيد الحسابات وحل استفسارات العملاء."
                : "This WhatsApp line is dynamically injected for account support and lead verifications."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1.5 max-w-md">
              <Label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                {lang === "ar"
                  ? "رقم دعم العملاء بالواتساب (رمز الدولة + الرقم)"
                  : "WhatsApp Support Phone Number (Country Code + No)"}
              </Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="e.g. 97339955508"
                  className="font-mono text-sm pl-12 h-11 border-zinc-200 dark:border-zinc-800 focus-visible:ring-primary"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  required
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2">
                  <Phone className="h-4 w-4 text-zinc-400" />
                </span>
              </div>
            </div>

            {/* Impersonation Mutation Security Switch */}
            <div className="border-t border-zinc-100 dark:border-zinc-900 pt-5 flex items-center justify-between">
              <div className="space-y-0.5 max-w-xl">
                <Label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-rose-500" />
                  {lang === "ar"
                    ? "السماح بالتعديلات أثناء تقمص الأدوار (Impersonation Write Access)"
                    : "Developer Mode - Impersonation Write Access"}
                </Label>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  {lang === "ar"
                    ? "عند إيقاف هذا الخيار، يتم تجميد جميع لوحات تحكم التجار أثناء تقمص السوبرأدمن لحمايتهم من أي خطأ غير مقصود."
                    : "By default, impersonating superadmins cannot modify merchant records. Switch on to allow live developer write-override safeguards."}
                </p>
              </div>
              <Switch
                checked={impersonationBypass}
                onCheckedChange={setImpersonationBypass}
                className="data-[state=checked]:bg-emerald-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit Actions Button */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="submit"
            disabled={submitting}
            className="h-11 px-8 gap-2 bg-primary hover:bg-primary/90 text-white font-semibold text-xs uppercase tracking-wider shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 shrink-0"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {lang === "ar" ? "حفظ التغييرات" : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
