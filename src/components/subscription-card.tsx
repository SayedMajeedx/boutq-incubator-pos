import { useState } from "react";
import { type Brand } from "@/lib/brand-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  getSubscriptionReceiptUploadUrl,
  submitSubscriptionReceipt,
} from "@/lib/saas-subscription.functions";
import {
  Check,
  UploadCloud,
  AlertCircle,
  Clock,
  ShieldCheck,
  CreditCard,
  QrCode,
  Sparkles,
  Loader2,
  CalendarRange,
} from "lucide-react";

type SubscriptionCardProps = {
  brand: Brand;
};

const PLANS = [
  {
    id: "basic",
    nameEn: "Basic Boutique",
    nameAr: "الباقة الأساسية",
    price: "19 BHD",
    periodEn: "/month",
    periodAr: "/شهرياً",
    featuresEn: [
      "Single Brand Domain",
      "Unlimited Products",
      "Sleek Dashboard",
      "Local WhatsApp Concierge",
      "Cash on Delivery",
    ],
    featuresAr: [
      "نطاق مخصص متاح",
      "منتجات غير محدودة",
      "لوحة تحكم ذكية",
      "دعم واتساب مباشر",
      "الدفع عند الاستلام",
    ],
    color: "#800020",
  },
  {
    id: "growth",
    nameEn: "Growth VIP",
    nameAr: "الباقة المتقدمة",
    price: "49 BHD",
    periodEn: "/month",
    periodAr: "/شهرياً",
    featuresEn: [
      "Whitelabel Custom Domain",
      "SaaS Multi-Store Admin",
      "BenefitPay Automated Invoices",
      "Sms Marketing campaigns",
      "Priority Support 24/7",
    ],
    featuresAr: [
      "نطاق خاص بالكامل",
      "إدارة متعددة المتاجر",
      "فواتير بنفت بي الآلية",
      "حملات تسويقية SMS",
      "دعم فني مخصص 24/7",
    ],
    color: "#1B2A47",
  },
];

export function SubscriptionCard({ brand }: SubscriptionCardProps) {
  const { lang } = useI18n();
  const [uploading, setUploading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("basic");

  const tier = brand.subscription_tier || "basic";
  const status = brand.subscription_status || "active";
  const expiresAt = brand.subscription_expires_at;

  // Subscription plan parameters
  const planType = brand.plan_type || "lifetime"; // Default to lifetime for existing migrated tenants
  const createdAtStr = brand.created_at || new Date().toISOString();
  const trialEndsAtStr = brand.trial_ends_at;

  // Calculate Lifetime Support Remaining (6 months from creation)
  const createdDate = new Date(createdAtStr);
  const supportEndsDate = new Date(createdDate);
  supportEndsDate.setMonth(supportEndsDate.getMonth() + 6);

  const now = new Date();
  const supportDaysLeft = Math.ceil(
    (supportEndsDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  const isSupportActive = supportDaysLeft > 0;

  // Calculate Trial Days Remaining
  let trialDaysLeft = 0;
  let isTrialActive = false;
  if (planType === "trial" && trialEndsAtStr) {
    const trialEndsDate = new Date(trialEndsAtStr);
    trialDaysLeft = Math.ceil((trialEndsDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    isTrialActive = trialDaysLeft > 0;
  }

  const getStatusBadge = () => {
    if (planType === "lifetime") {
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          {lang === "ar" ? "نشط (وصول مدى الحياة)" : "Active (Lifetime Access)"}
        </Badge>
      );
    } else if (planType === "trial") {
      if (isTrialActive) {
        return (
          <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-semibold flex items-center gap-1 animate-pulse">
            <Clock className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "3s" }} />
            {lang === "ar"
              ? `تجريبي (${trialDaysLeft} أيام متبقية)`
              : `${trialDaysLeft}-Day Free Trial`}
          </Badge>
        );
      } else {
        return (
          <Badge className="bg-rose-500 hover:bg-rose-600 text-white font-semibold flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            {lang === "ar" ? "انتهت الفترة التجريبية" : "Trial Expired"}
          </Badge>
        );
      }
    }

    switch (status) {
      case "active":
        return (
          <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> {lang === "ar" ? "نشط" : "Active"}
          </Badge>
        );
      case "pending_verification":
        return (
          <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-medium flex items-center gap-1 animate-pulse">
            <Clock className="h-3.5 w-3.5" />{" "}
            {lang === "ar" ? "بانتظار التحقق" : "Pending Approval"}
          </Badge>
        );
      case "suspended":
        return (
          <Badge className="bg-rose-500 hover:bg-rose-600 text-white font-medium flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> {lang === "ar" ? "موقوف" : "Suspended"}
          </Badge>
        );
      default:
        return <Badge className="bg-zinc-500 text-white font-medium">{status}</Badge>;
    }
  };

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error(
        lang === "ar"
          ? "يرجى تحميل صورة صالحة (JPEG, PNG, WEBP)."
          : "Please upload a valid image file (JPEG, PNG, WEBP).",
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(
        lang === "ar" ? "الحد الأقصى لحجم الملف هو 5 ميجابايت." : "Maximum file size is 5MB.",
      );
      return;
    }

    setUploading(true);
    const toastId = toast.loading(
      lang === "ar" ? "جاري تجهيز رابط التحميل..." : "Preparing secure upload channel...",
    );

    try {
      // 1. Request secure pre-signed R2 upload link
      const { objectKey, uploadUrl } = await getSubscriptionReceiptUploadUrl({
        data: {
          brandId: brand.id,
          contentType: file.type as any,
        },
      });

      // 2. Upload the receipt file directly to the Private R2 bucket
      toast.loading(
        lang === "ar"
          ? "جاري رفع الإيصال بأمان لـ R2 الخصوصي..."
          : "Uploading receipt securely to Private R2 Bucket...",
        { id: toastId },
      );
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error("Failed to upload image file directly to secure storage R2.");
      }

      // 3. Finalize and submit the transaction receipt inside Supabase DB
      toast.loading(
        lang === "ar"
          ? "جاري توثيق إيصال الدفع في قاعدة البيانات..."
          : "Registering payment receipt inside system...",
        { id: toastId },
      );
      await submitSubscriptionReceipt({
        data: {
          brandId: brand.id,
          objectKey,
        },
      });

      toast.success(
        lang === "ar"
          ? "تم رفع إيصال الاشتراك بنجاح! سيتم التحقق وتفعيله في غضون ساعتين."
          : "Subscription receipt uploaded successfully! Activation is pending super-admin review (usually within 2 hours).",
        { id: toastId, duration: 6000 },
      );

      // Reload route/window to reflect the updated state instantly
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to submit subscription receipt. Please contact support.", {
        id: toastId,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Subscription Header Overview */}
      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm relative">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] select-none pointer-events-none">
          <CreditCard className="h-36 w-36" />
        </div>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-display font-medium">
                {lang === "ar" ? "اشتراك المنصة السحابي" : "SaaS Platform Subscription"}
              </CardTitle>
              <CardDescription className="text-xs">
                {lang === "ar"
                  ? "تتبع اشتراكك الحالي، قم بتجديده، أو ارفع إيصالات بنفت بي."
                  : "Track your current active subscription, renew plans, or submit transaction receipts."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              <Badge variant="outline" className="text-xs uppercase tracking-wider font-semibold">
                {tier === "growth"
                  ? lang === "ar"
                    ? "الباقة المتقدمة"
                    : "Growth VIP"
                  : lang === "ar"
                    ? "الباقة الأساسية"
                    : "Basic"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-background/50 dark:bg-background/20 p-5 rounded-xl border border-border/40 backdrop-blur-sm">
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">
                {lang === "ar" ? "نوع الترخيص" : "Access License"}
              </span>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 capitalize">
                {planType === "lifetime" ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                    <span>{lang === "ar" ? "ترخيص مدى الحياة" : "Lifetime Access License"}</span>
                  </>
                ) : (
                  <>
                    <span
                      className={`h-2 w-2 rounded-full ${isTrialActive ? "bg-amber-500 animate-pulse" : "bg-rose-500"} inline-block`}
                    />
                    <span>{lang === "ar" ? "فترة تجريبية مؤقتة" : "3-Day Free Trial"}</span>
                  </>
                )}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">
                {planType === "lifetime"
                  ? lang === "ar"
                    ? "فترة الدعم المتبقية"
                    : "Technical Support Period"
                  : lang === "ar"
                    ? "صلاحية التجربة"
                    : "Trial Expiration"}
              </span>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <CalendarRange className="h-4 w-4 text-zinc-400" />
                <span>
                  {planType === "lifetime"
                    ? isSupportActive
                      ? lang === "ar"
                        ? `نشط (${supportDaysLeft} يوماً متبقية)`
                        : `Active (${supportDaysLeft} days left)`
                      : lang === "ar"
                        ? "انتهى الدعم المجاني"
                        : "Support Expired"
                    : isTrialActive
                      ? lang === "ar"
                        ? `ينتهي في غضون ${trialDaysLeft} أيام`
                        : `Trial expires in ${trialDaysLeft} days`
                      : lang === "ar"
                        ? "منتهي الصلاحية"
                        : "Trial Expired"}
                </span>
              </p>
            </div>

            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">
                {lang === "ar" ? "النطاق المعتمد" : "Store Subdomain"}
              </span>
              <p className="text-sm font-semibold text-primary font-mono select-all">
                {brand.slug}.boutq.store
              </p>
            </div>
          </div>

          {planType === "trial" && (
            <div className="mt-5 p-5 bg-gradient-to-r from-amber-500/10 via-amber-500/[0.03] to-transparent rounded-lg border border-amber-500/20 text-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <p className="font-display font-medium text-amber-500 flex items-center gap-1.5 text-sm">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  <span>
                    {lang === "ar"
                      ? "جاهز لتفعيل الترخيص الدائم لمتجرك؟"
                      : "Ready to activate full lifetime access for 55 BHD?"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {lang === "ar"
                    ? "احصل على ترخيص دائم ومستمر لمتجرك بقيمة 55 دينار بحريني فقط (مرة واحدة) مع 6 أشهر دعم فني مضمون يدوياً."
                    : "Unlock full lifetime platform access for 55 BHD (one-time fee). Guaranteed 6 months of premium technical support included."}
                </p>
              </div>
              <Button
                asChild
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs h-9 px-4 shrink-0 transition-all hover:scale-[1.02] cursor-pointer"
              >
                <a
                  href={`https://wa.me/97339955508?text=Hi%20Boutq,%20I'd%20like%20to%20upgrade%20store%20${encodeURIComponent(brand.slug)}%20from%20Trial%20to%20Lifetime%20Access`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5"
                >
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.753-1.454L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.963C16.588 2.019 14.12 1 11.492 1 6.059 1 1.633 5.37 1.63 10.8c-.001 1.737.5 3.424 1.448 4.908l-.951 3.473 3.562-.927z" />
                  </svg>
                  <span>{lang === "ar" ? "ترقية عبر الواتساب" : "Upgrade via WhatsApp"}</span>
                </a>
              </Button>
            </div>
          )}

          {status === "pending_verification" && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 rounded-md text-amber-800 dark:text-amber-400 text-xs flex items-start gap-2">
              <Clock
                className="h-4 w-4 mt-0.5 shrink-0 animate-spin"
                style={{ animationDuration: "3s" }}
              />
              <div>
                <p className="font-semibold">
                  {lang === "ar"
                    ? "إيصال الدفع قيد التحقق حالياً"
                    : "Your receipt is currently being verified"}
                </p>
                <p className="opacity-90 mt-0.5">
                  {lang === "ar"
                    ? "لقد استلمنا لقطة الشاشة المرفقة. يتم الآن التحقق منها بواسطة المشرف العام. لا تتردد في استخدام لوحة التحكم كالمعتاد."
                    : "We have received your uploaded screenshot receipt. The platform super-admin is verifying the transaction. Your store remains fully active."}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tech Support & Custom Feature Request Panel */}
      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm relative bg-gradient-to-r from-zinc-50/10 to-zinc-100/10 dark:from-zinc-900/10 dark:to-zinc-900/10">
        <div className="absolute top-0 right-0 p-8 opacity-[0.02] select-none pointer-events-none">
          <Sparkles className="h-36 w-36" />
        </div>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-display font-medium text-foreground flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary shrink-0 animate-pulse" />
                <span>
                  {lang === "ar"
                    ? "الدعم الفني وطلب الميزات المخصصة"
                    : "Tech Support & Custom Feature Request"}
                </span>
              </CardTitle>
              <CardDescription className="text-xs max-w-xl">
                {lang === "ar"
                  ? "هل تحتاج لمساعدة تقنية، ربط نطاق مخصص، أو إضافة ميزات حصرية لمتجرك؟ تواصل مباشرة مع فريق التطوير والدعم الفني عبر الواتساب."
                  : "Need technical assistance, custom domain mapping, or exclusive custom development for your shop? Chat directly with our engineering & support team."}
              </CardDescription>
            </div>
            <Button
              asChild
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-10 px-5 shrink-0 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 cursor-pointer"
            >
              <a
                href={`https://wa.me/97339955508?text=Hi%20Boutq,%20I'd%20like%20to%20request%20support%20for%20store%20${encodeURIComponent(brand.slug)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <svg className="h-4.5 w-4.5 fill-current" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.753-1.454L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.963C16.588 2.019 14.12 1 11.492 1 6.059 1 1.633 5.37 1.63 10.8c-.001 1.737.5 3.424 1.448 4.908l-.951 3.473 3.562-.927z" />
                </svg>
                <span>{lang === "ar" ? "تواصل مع الدعم الفني" : "Connect on WhatsApp"}</span>
              </a>
            </Button>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
