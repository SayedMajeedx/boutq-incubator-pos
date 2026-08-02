import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  Building2,
  User,
  Languages,
  Check,
  Store,
  Sparkles,
  CheckCircle2,
  Loader2,
  UploadCloud,
  ChevronRight,
  Info,
  PhoneCall,
  QrCode,
  Copy,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getOnboardingReceiptUploadUrl,
  createTenantRequest,
  getOnboardingPrice,
} from "@/lib/onboarding.functions";

export const Route = createFileRoute("/onboard")({
  ssr: false,
  component: OnboardPage,
});

function OnboardPage() {
  const { lang, setLang } = useI18n();
  const [liveSales, setLiveSales] = useState(4284.15);
  const [activeNotifyIdx, setActiveNotifyIdx] = useState(0);
  const [showFeaturesModal, setShowFeaturesModal] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);
  const [activeOnboardTab, setActiveOnboardTab] = useState<"trial" | "paid">("trial");

  const notifications = [
    {
      name_en: "Sofia Al Khalifa",
      name_ar: "صوفيا آل خليفة",
      item: "Organza Silk Abaya",
      price: "145.000 BHD",
    },
    {
      name_en: "Fatima Al Doseri",
      name_ar: "فاطمة الدوسري",
      item: "Velvet Gown",
      price: "280.000 BHD",
    },
    {
      name_en: "Amina Al Jalahma",
      name_ar: "أمينة الجلاهمة",
      item: "Linen Trench Abaya",
      price: "110.000 BHD",
    },
  ];

  useEffect(() => {
    const salesInterval = setInterval(() => {
      setLiveSales((prev) => {
        const next = prev + (Math.random() * 0.15 + 0.05);
        return next > 4300 ? 4284.15 : Number(next.toFixed(3));
      });
    }, 4000);

    const notifyInterval = setInterval(() => {
      setActiveNotifyIdx((prev) => (prev + 1) % notifications.length);
    }, 6000);

    return () => {
      clearInterval(salesInterval);
      clearInterval(notifyInterval);
    };
  }, [notifications.length]);

  const [loadingPrice, setLoadingPrice] = useState(true);
  const [basePrice, setBasePrice] = useState(55);
  const [discountPrice, setDiscountPrice] = useState<number | null>(null);
  const [platformIconUrl, setPlatformIconUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [benefitPayQrUrl, setBenefitPayQrUrl] = useState<string | null>(null);
  const [merchantAccountName, setMerchantAccountName] = useState("BOUTQ-OFFICIAL");
  const [whatsappNumber, setWhatsappNumber] = useState("97339955508");

  // Load Dynamic Settings on mount
  useEffect(() => {
    async function loadDynamicSettings() {
      try {
        const { data, error } = await (supabase as any)
          .from("system_settings")
          .select(
            "base_price_bhd, discount_price_bhd, platform_icon_url, whatsapp_support_number, benefit_pay_qr_url, merchant_account_name",
          )
          .eq("id", 1)
          .maybeSingle();

        if (data && !error) {
          if (data.base_price_bhd) setBasePrice(Number(data.base_price_bhd));
          setDiscountPrice(data.discount_price_bhd ? Number(data.discount_price_bhd) : null);
          setPlatformIconUrl(data.platform_icon_url || null);
          setBenefitPayQrUrl(data.benefit_pay_qr_url || null);
          if (data.merchant_account_name) setMerchantAccountName(data.merchant_account_name);
          if (data.whatsapp_support_number) setWhatsappNumber(data.whatsapp_support_number);
        } else {
          // Fallback to getOnboardingPrice server function if direct query fails
          const price = await getOnboardingPrice();
          const priceStr = typeof price === "string" ? price : "55";
          const parsed = parseFloat(priceStr.replace(/[^0-9.]/g, "")) || 55;
          setBasePrice(parsed);
        }
      } catch (err) {
        console.warn("Error loading live system settings, falling back.", err);
      } finally {
        setLoadingPrice(false);
      }
    }
    void loadDynamicSettings();
  }, []);

  const displayPrice = discountPrice !== null ? `${discountPrice} BHD` : `${basePrice} BHD`;

  // Form Fields - Isolated for Trial or Official Packages
  const [trialFullName, setTrialFullName] = useState("");
  const [trialContactNumber, setTrialContactNumber] = useState("");
  const [trialEmail, setTrialEmail] = useState("");
  const [trialSubdomain, setTrialSubdomain] = useState("");
  const [trialBusinessType, setTrialBusinessType] = useState("Fashion");
  const [trialSubdomainChecking, setTrialSubdomainChecking] = useState(false);
  const [trialSubdomainAvailable, setTrialSubdomainAvailable] = useState<boolean | null>(null);

  const [officialFullName, setOfficialFullName] = useState("");
  const [officialContactNumber, setOfficialContactNumber] = useState("");
  const [officialEmail, setOfficialEmail] = useState("");
  const [officialSubdomain, setOfficialSubdomain] = useState("");
  const [officialBusinessType, setOfficialBusinessType] = useState("Fashion");
  const [officialSubdomainChecking, setOfficialSubdomainChecking] = useState(false);
  const [officialSubdomainAvailable, setOfficialSubdomainAvailable] = useState<boolean | null>(
    null,
  );

  // File Uploader state for Card B (Official Paid Activation)
  const [uploading, setUploading] = useState(false);
  const [receiptKey, setReceiptKey] = useState<string | null>(null);

  // Success Confirmation overlay trigger
  const [isDeployedPending, setIsDeployedPending] = useState(false);
  const [submittedSubdomain, setSubmittedSubdomain] = useState("");
  const [isTrialSuccess, setIsTrialSuccess] = useState(false);

  // Clean and check Trial subdomain uniqueness
  useEffect(() => {
    if (!trialSubdomain) {
      setTrialSubdomainAvailable(null);
      return;
    }

    const cleaned = trialSubdomain
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (cleaned !== trialSubdomain) {
      setTrialSubdomain(cleaned);
    }

    const checkUniqueness = async () => {
      setTrialSubdomainChecking(true);
      try {
        const { data: brandData, error: brandError } = await supabase
          .from("brands")
          .select("id")
          .eq("slug", cleaned)
          .maybeSingle();

        if (brandError) throw brandError;

        const { data: pendingData, error: pendingError } = await (supabase as any)
          .from("tenant_requests")
          .select("id")
          .eq("desired_subdomain", cleaned)
          .eq("status", "pending")
          .maybeSingle();

        if (pendingError) throw pendingError;

        setTrialSubdomainAvailable(!brandData && !pendingData);
      } catch {
        setTrialSubdomainAvailable(false);
      } finally {
        setTrialSubdomainChecking(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      void checkUniqueness();
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [trialSubdomain]);

  // Clean and check Official subdomain uniqueness
  useEffect(() => {
    if (!officialSubdomain) {
      setOfficialSubdomainAvailable(null);
      return;
    }

    const cleaned = officialSubdomain
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (cleaned !== officialSubdomain) {
      setOfficialSubdomain(cleaned);
    }

    const checkUniqueness = async () => {
      setOfficialSubdomainChecking(true);
      try {
        const { data: brandData, error: brandError } = await supabase
          .from("brands")
          .select("id")
          .eq("slug", cleaned)
          .maybeSingle();

        if (brandError) throw brandError;

        const { data: pendingData, error: pendingError } = await (supabase as any)
          .from("tenant_requests")
          .select("id")
          .eq("desired_subdomain", cleaned)
          .eq("status", "pending")
          .maybeSingle();

        if (pendingError) throw pendingError;

        setOfficialSubdomainAvailable(!brandData && !pendingData);
      } catch {
        setOfficialSubdomainAvailable(false);
      } finally {
        setOfficialSubdomainChecking(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      void checkUniqueness();
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [officialSubdomain]);

  // Upload receipt to Private R2 Bucket
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

    if (file.size > 8 * 1024 * 1024) {
      toast.error(
        lang === "ar" ? "الحد الأقصى لحجم الملف هو 8 ميجابايت." : "Maximum file size is 8MB.",
      );
      return;
    }

    setUploading(true);
    const toastId = toast.loading(
      lang === "ar" ? "جاري تفعيل قناة التحميل المشفرة..." : "Preparing secure R2 upload tunnel...",
    );

    try {
      const { objectKey, uploadUrl } = await getOnboardingReceiptUploadUrl({
        data: { contentType: file.type as any },
      });

      toast.loading(
        lang === "ar"
          ? "جاري تشفير وحفظ لقطة الشاشة في R2 الخصوصي..."
          : "Encrypting and storing receipt screenshot in Private R2 Bucket...",
        { id: toastId },
      );
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) {
        throw new Error("S3 direct PUT upload failed.");
      }

      setReceiptKey(objectKey);
      toast.success(
        lang === "ar"
          ? "تم رفع إيصال الدفع وتشفيره بنجاح!"
          : "Payment receipt uploaded and encrypted securely!",
        { id: toastId },
      );
    } catch (err: any) {
      console.error(err);
      toast.error(
        lang === "ar"
          ? "فشل تحميل إيصال الدفع. يرجى المحاولة لاحقاً."
          : "Failed to upload payment receipt. Please retry.",
        { id: toastId },
      );
    } finally {
      setUploading(false);
    }
  };

  // Submission Flow - CARD A: 3-Day Free Trial
  const handleRegisterTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trialFullName || !trialContactNumber || !trialEmail || !trialSubdomain) {
      toast.error(
        lang === "ar" ? "يرجى ملء جميع الحقول المطلوبة." : "Please fill out all required fields.",
      );
      return;
    }

    if (trialSubdomainAvailable === false) {
      toast.error(
        lang === "ar" ? "رابط المتجر هذا محجوز مسبقاً." : "This store subdomain is already taken.",
      );
      return;
    }

    const toastId = toast.loading(
      lang === "ar" ? "جاري إرسال طلب تفعيل النسخة التجريبية..." : "Sending trial request...",
    );

    try {
      // Save metadata lead safely to tenant_requests with status 'pending'
      await createTenantRequest({
        data: {
          fullName: trialFullName,
          contactNumber: trialContactNumber,
          email: trialEmail,
          desiredSubdomain: trialSubdomain,
          requestType: "trial",
          businessType: trialBusinessType,
        },
      });

      const waMessage =
        lang === "ar"
          ? `مرحباً دعم بوتيك (Boutq)! لقد أرسلت للتو طلب تفعيل باقة الـ 3 أيام المجانية لمتجري باسم: "${trialFullName}" والرابط المطلوب: "${trialSubdomain}.boutq.store". البريد الإلكتروني: ${trialEmail}.`
          : `Hello Boutq Support! I just submitted a request for a 3-Day Free Trial workspace. Owner: "${trialFullName}", Desired subdomain: "${trialSubdomain}.boutq.store", Contact: ${trialContactNumber}, Email: ${trialEmail}.`;

      const encodedMessage = encodeURIComponent(waMessage);
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

      toast.success(
        lang === "ar"
          ? "تم تسجيل طلبك! بانتظار التفعيل اليدوي..."
          : "Request Received - Waiting for Manual Activation",
        { id: toastId },
      );

      setSubmittedSubdomain(trialSubdomain);
      setIsTrialSuccess(true);
      setIsDeployedPending(true);

      // Open WhatsApp safely to speed up onboarding activation
      setTimeout(() => {
        window.open(whatsappUrl, "_blank");
      }, 1200);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "An unexpected error occurred during submission.", {
        id: toastId,
      });
    }
  };

  // Submission Flow - CARD B: Paid Official Store Activation
  const handleRegisterPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!officialFullName || !officialContactNumber || !officialEmail || !officialSubdomain) {
      toast.error(
        lang === "ar" ? "يرجى ملء جميع الحقول المطلوبة." : "Please fill out all required fields.",
      );
      return;
    }

    if (officialSubdomainAvailable === false) {
      toast.error(
        lang === "ar" ? "رابط المتجر هذا محجوز مسبقاً." : "This store subdomain is already taken.",
      );
      return;
    }

    if (!receiptKey) {
      toast.error(
        lang === "ar"
          ? "يرجى رفع لقطة شاشة تأكيد الدفع قبل المتابعة."
          : "Please upload your payment receipt screenshot before submitting.",
      );
      return;
    }

    const toastId = toast.loading(
      lang === "ar"
        ? "جاري إرسال طلب تفعيل متجرك الرسمي..."
        : "Sending official store activation request...",
    );

    try {
      // Save metadata lead safely to tenant_requests as 'pending'
      await createTenantRequest({
        data: {
          fullName: officialFullName,
          contactNumber: officialContactNumber,
          email: officialEmail,
          desiredSubdomain: officialSubdomain,
          requestType: "paid",
          benefitReceiptUrl: receiptKey,
          businessType: officialBusinessType,
        },
      });

      toast.success(
        lang === "ar"
          ? "تم إرسال طلب تفعيل متجرك بنجاح! طلبك الآن قيد التدقيق وسيتم تفعيله يدوياً."
          : "Request Received - Waiting for Manual Activation",
        { id: toastId, duration: 6000 },
      );

      setSubmittedSubdomain(officialSubdomain);
      setIsTrialSuccess(false);
      setIsDeployedPending(true);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "An unexpected error occurred during activation submission.", {
        id: toastId,
      });
    }
  };

  const handleCopyIban = (ibanStr: string) => {
    navigator.clipboard.writeText(ibanStr.replace(/\s+/g, ""));
    setCopiedIban(true);
    toast.success(lang === "ar" ? "تم نسخ الـ IBAN بنجاح!" : "IBAN copied to clipboard!");
    setTimeout(() => setCopiedIban(false), 2000);
  };

  // SUCCESS CONFIRMATION OVERLAY (Waiting for Manual Activation freeze state)
  if (isDeployedPending) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-6 relative overflow-hidden text-white dark">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(128,0,32,0.1),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.9))]" />

        <Card className="max-w-xl w-full border-zinc-900 bg-zinc-900/40 backdrop-blur-md shadow-2xl relative z-10 p-8 text-center text-white">
          <div className="h-16 w-16 bg-primary/10 rounded-full border border-primary/20 flex items-center justify-center mx-auto mb-6 text-primary">
            {isTrialSuccess ? (
              <Sparkles className="h-8 w-8 animate-pulse text-[#B76E79]" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-emerald-500 animate-bounce" />
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-display font-medium tracking-tight mb-3">
            {lang === "ar"
              ? "تم استلام الطلب - بانتظار التفعيل"
              : "Request Received - Waiting for Manual Activation"}
          </h1>

          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            {lang === "ar"
              ? `لقد تم إرسال طلب تفعيل مساحة متجرك الفاخرة "${submittedSubdomain}.boutq.store" بنجاح إلى فريق الإدارة.`
              : `Your luxury boutique registration request for "${submittedSubdomain}.boutq.store" has been recorded in our activation queue.`}
          </p>

          <div className="bg-zinc-950/60 border border-zinc-900 rounded-lg p-5 mb-8 text-left space-y-4">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-400 leading-relaxed">
                <p className="font-semibold text-zinc-200 mb-1">
                  {lang === "ar"
                    ? "ما الخطوات التالية لتفعيل متجرك؟"
                    : "What is the deployment procedure?"}
                </p>
                {isTrialSuccess ? (
                  <p>
                    {lang === "ar"
                      ? "سنقوم بتهيئة نسختك التجريبية وتفعيل الرابط فورياً. تواصل مع الدعم عبر الواتساب لتسريع العملية."
                      : "A superadmin is currently reviewing your trial request. Once approved, your temporary 3-day workspace will be spun up. Message support on WhatsApp to fast-track approval."}
                  </p>
                ) : (
                  <p>
                    {lang === "ar"
                      ? "سنقوم بمراجعة لقطة شاشة تأكيد عملية السداد المرفقة. سيتم تهيئة وتوفير مساحتك الفاخرة يدوياً وتزويدك بروابط الدخول والتحكم الكامل في غضون ساعتين كحد أقصى."
                      : "An administrator will verify your uploaded BenefitPay transfer reference screenshot. Once approved, your official brand platform and manager dashboards will be manually deployed within 2 hours."}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="outline"
              className="bg-transparent hover:bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all"
              onClick={() => {
                setIsDeployedPending(false);
                setTrialFullName("");
                setTrialContactNumber("");
                setTrialEmail("");
                setTrialSubdomain("");
                setOfficialFullName("");
                setOfficialContactNumber("");
                setOfficialEmail("");
                setOfficialSubdomain("");
                setReceiptKey(null);
              }}
            >
              {lang === "ar" ? "العودة للرئيسية" : "Start Over"}
            </Button>

            <a
              href={`https://wa.me/${whatsappNumber}?text=Hello!%20Inquiring%20about%20my%20onboarding%20registration%20for%20subdomain:%20${submittedSubdomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-500 px-6 text-sm font-semibold text-white shadow transition-colors gap-2"
            >
              <PhoneCall className="h-4 w-4" />
              {lang === "ar" ? "تواصل مع الإدارة بالواتساب" : "Contact Superadmin Support"}
            </a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Brand Visual Left Sidebar (Desktop only) */}
      <div className="hidden md:flex md:w-[35%] bg-zinc-950 text-white flex-col justify-between p-12 relative overflow-hidden shrink-0 border-r border-zinc-900 select-none">
        <style>{`
          @keyframes float-slow {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-10px) rotate(0.5deg); }
          }
          @keyframes float-slower {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(12px) rotate(-1deg); }
          }
          @keyframes pulse-soft {
            0%, 100% { opacity: 0.15; transform: scale(1); }
            50% { opacity: 0.35; transform: scale(1.05); }
          }
          @keyframes banner-slide {
            0%, 100% { transform: translateY(-20px); opacity: 0; }
            8%, 92% { transform: translateY(0); opacity: 1; }
          }
          .animate-float-slow {
            animation: float-slow 8s ease-in-out infinite;
          }
          .animate-float-slower {
            animation: float-slower 10s ease-in-out infinite;
          }
          .animate-pulse-soft {
            animation: pulse-soft 6s ease-in-out infinite;
          }
          .animate-banner-slide {
            animation: banner-slide 6s ease-in-out infinite;
          }
        `}</style>

        {/* Dynamic moving luxury gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(183,110,121,0.18),transparent_60%)] z-0" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(9,9,11,0.95))] z-0" />

        {/* Showcase Canvas Background (Animated Cards) */}
        <div className="absolute inset-0 pointer-events-none opacity-30 dark:opacity-50 z-0">
          {/* Glowing gradient backdrops */}
          <div className="absolute top-[20%] right-[-10%] w-72 h-72 rounded-full bg-rose-500/10 blur-3xl animate-pulse-soft" />
          <div
            className="absolute bottom-[25%] left-[-10%] w-80 h-80 rounded-full bg-[#B76E79]/15 blur-3xl animate-pulse-soft"
            style={{ animationDelay: "2s" }}
          />

          {/* New Order Pill Notification */}
          <div className="absolute top-[22%] left-6 right-6 z-20 animate-banner-slide">
            <div className="bg-zinc-900/90 border border-emerald-500/30 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-950/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[9px] font-bold tracking-wider text-emerald-400 uppercase">
                  {lang === "ar" ? "طلب جديد" : "NEW ORDER"}
                </span>
              </div>
              <div className="text-[10px] font-medium text-zinc-200 truncate max-w-[120px]">
                {lang === "ar"
                  ? `${notifications[activeNotifyIdx].name_ar} • ${notifications[activeNotifyIdx].item}`
                  : `${notifications[activeNotifyIdx].name_en} • ${notifications[activeNotifyIdx].item}`}
              </div>
              <div className="text-[10px] font-bold text-emerald-400 whitespace-nowrap">
                {notifications[activeNotifyIdx].price}
              </div>
            </div>
          </div>

          {/* Live Sales Dashboard Card */}
          <div className="absolute top-[32%] left-6 right-6 bg-zinc-900/85 border border-zinc-800/80 backdrop-blur-md p-5 rounded-2xl shadow-xl animate-float-slow">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[9px] text-zinc-400 font-bold tracking-widest uppercase">
                {lang === "ar" ? "المبيعات المباشرة" : "LIVE MERCHANT SALES"}
              </span>
              <span className="text-[8px] bg-rose-500/10 text-rose-400 font-bold border border-rose-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" />
                LIVE
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-zinc-100 flex items-baseline gap-1.5">
              <span>{liveSales.toFixed(3)}</span>
              <span className="text-xs text-zinc-400 font-sans font-medium">BHD</span>
            </div>
            {/* Sparkline visualization */}
            <div className="h-8 mt-4 flex items-end gap-1.5">
              {[40, 55, 45, 60, 75, 50, 70, 85, 90, 80, 95].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-zinc-800/60 transition-all duration-500"
                  style={{
                    height: `${h}%`,
                    backgroundColor: i === 10 ? "#B76E79" : undefined,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Luxury Abaya Product Card */}
          <div
            className="absolute bottom-[24%] left-6 w-[75%] bg-zinc-900/85 border border-zinc-800/80 backdrop-blur-md p-4 rounded-xl shadow-lg animate-float-slower"
            style={{ animationDelay: "1s" }}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-zinc-800/80 flex items-center justify-center border border-zinc-700/60">
                <Store className="h-5 w-5 text-[#B76E79]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-zinc-200 truncate">
                  {lang === "ar" ? "عباية الحرير الأورجانزا" : "Silk Organza Abaya"}
                </p>
                <p className="text-[8px] text-zinc-400">
                  {lang === "ar" ? "المخزون: 4 قطع متبقية" : "Stock: 4 remaining"}
                </p>
              </div>
              <span className="text-[10px] font-bold text-[#B76E79] whitespace-nowrap">
                145 BHD
              </span>
            </div>
          </div>

          {/* Floating VIP customer tag */}
          <div
            className="absolute bottom-[36%] right-6 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[9px] font-bold px-3 py-1.5 rounded-full shadow-md animate-float-slow"
            style={{ animationDelay: "2.5s" }}
          >
            {lang === "ar" ? "عملاء كبار الشخصيات VIP" : "VIP CONCIERGE"}
          </div>
        </div>

        {/* Top Header Section */}
        <div className="relative z-10 flex items-center gap-2">
          {platformIconUrl && !logoError ? (
            <img
              src={platformIconUrl}
              alt="Boutq Logo"
              className="h-8 object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <>
              <Store className="h-6 w-6 text-[#B76E79]" />
              <span className="font-display text-lg tracking-wider font-semibold">Boutq</span>
            </>
          )}
        </div>

        {/* Central Overlay Text with luxury branding content */}
        <div className="relative z-10 space-y-6 max-w-sm mt-auto mb-16">
          <Sparkles className="h-10 w-10 text-[#B76E79] animate-pulse" />
          <h2 className="text-4xl font-display font-medium leading-tight tracking-tight">
            {lang === "ar"
              ? "أطلق مساحتك التجارية الفاخرة اليوم"
              : "Own your professional luxury boutique store."}
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            {lang === "ar"
              ? "منصة الإدارة المتكاملة لمصممي الأزياء، العبايات، وصالات العرض النخبوية في البحرين والخليج العربي. واجهات في غاية الفخامة والدقة."
              : "The premium management stack designed for visual designers, Abaya houses, and high-end couture stores in Bahrain and the GCC. Exquisite storefront interfaces."}
          </p>
        </div>

        {/* Footer info badge */}
        <div className="relative z-10 text-xs text-zinc-500 flex items-center gap-1.5 mt-auto">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>
            {lang === "ar" ? "بنية سحابية فائقة الأمان" : "RLS-Secured Enterprise Deployment Stack"}
          </span>
        </div>
      </div>

      {/* Main Interaction Area */}
      <div className="flex-1 flex flex-col justify-between p-6 md:p-12 lg:p-16 max-w-7xl mx-auto w-full">
        {/* Top bar with Translation selector */}
        <div className="flex justify-between items-center gap-4 mb-8">
          <div className="flex items-center gap-2 md:hidden">
            {platformIconUrl && !logoError ? (
              <img
                src={platformIconUrl}
                alt="Boutq Logo"
                className="h-6 object-contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <>
                <Store className="h-5 w-5 text-primary" />
                <span className="font-display text-base tracking-wider font-semibold">Boutq</span>
              </>
            )}
          </div>
          <div className="flex justify-end items-center gap-4 ml-auto">
            <a
              href="https://pura.boutq.store"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#B76E79]/10 hover:bg-[#B76E79]/20 border border-[#B76E79]/20 text-xs font-semibold text-[#B76E79] rounded-full transition-all select-none"
            >
              <Sparkles className="h-3 w-3" />
              {lang === "ar" ? "المتجر النموذج" : "Live Demo"}
            </a>
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <Select value={lang} onValueChange={(v) => setLang(v as "en" | "ar")}>
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="mb-10 max-w-2xl text-center md:text-left">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
            <h1 className="text-3xl md:text-4xl font-display font-medium text-foreground tracking-tight">
              {lang === "ar" ? "اختر باقة إطلاق متجرك" : "Select Your Boutq Activation"}
            </h1>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFeaturesModal(true)}
              className="border-[#B76E79]/30 hover:border-[#B76E79] text-[#B76E79] bg-transparent hover:bg-[#B76E79]/10 rounded-full font-semibold px-4 h-9 self-center md:self-auto shrink-0"
            >
              ✨ {lang === "ar" ? "اكتشف جميع مميزات منصة Boutq" : "Discover All Boutq Features"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {lang === "ar"
              ? "نحن نوفر خيارين مخصصين لبدء تجارتك. سواء كنت ترغب بتجربة المنصة لـ 3 أيام مجاناً، أو الحصول على رخصة المتجر المتكاملة مع الدعم الفني، بادر بتعبئة بياناتك وبدء مغامرتك فورياً."
              : "We provide two options to fit your boutique expansion. Start with our 3-day complimentary test drive via our WhatsApp concierge or launch your permanent brand portal immediately."}
          </p>
        </div>

        {/* Mobile Live Activity Dashboard Banner (Brings the visual showcase premium feel to small screens) */}
        <div className="lg:hidden bg-zinc-950 text-white border border-[#B76E79]/30 rounded-2xl p-4 mb-6 shadow-lg shadow-rose-950/5 flex flex-col gap-3.5 relative overflow-hidden select-none">
          {/* Background glow orb */}
          <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full bg-[#B76E79]/10 blur-xl animate-pulse-soft" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[9px] text-zinc-400 font-bold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-[#B76E79] animate-ping shrink-0" />
              {lang === "ar" ? "نشاط منصة BOUTQ المباشر" : "LIVE BOUTQ NETWORK TRACKER"}
            </div>
            <span className="text-[11px] font-mono text-emerald-500 font-bold tracking-tight bg-emerald-500/10 px-2.5 py-0.5 rounded-md animate-pulse">
              {liveSales.toLocaleString(undefined, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}{" "}
              BHD
            </span>
          </div>

          {/* Small Rotating Order Notification Pill */}
          <div className="bg-zinc-900/50 border border-zinc-850/60 rounded-xl px-3 py-2 text-xs flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-zinc-300 font-medium text-[11px] truncate">
                {lang === "ar" ? "طلب جديد من" : "New order from"}{" "}
                <strong className="text-white">
                  {lang === "ar"
                    ? notifications[activeNotifyIdx].name_ar
                    : notifications[activeNotifyIdx].name_en}
                </strong>
              </span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
              {notifications[activeNotifyIdx].price}
            </span>
          </div>
        </div>

        {/* Mobile Tabbed Toggle (Hidden on desktop to avoid unnecessary space) */}
        <div className="flex lg:hidden bg-zinc-100/80 dark:bg-zinc-900/80 border border-zinc-200/50 dark:border-zinc-800 p-1 rounded-xl mb-6 select-none relative z-10">
          <button
            onClick={() => setActiveOnboardTab("trial")}
            className={`flex-1 py-2 text-center text-xs font-semibold rounded-lg transition-all ${
              activeOnboardTab === "trial"
                ? "bg-white dark:bg-zinc-800 text-[#B76E79] shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {lang === "ar" ? "تجربة مجانية (3 أيام)" : "3-Day Free Trial"}
          </button>
          <button
            onClick={() => setActiveOnboardTab("paid")}
            className={`flex-1 py-2 text-center text-xs font-semibold rounded-lg transition-all ${
              activeOnboardTab === "paid"
                ? "bg-white dark:bg-zinc-800 text-primary shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {lang === "ar" ? "تفعيل المتجر الرسمي" : "Official Store Activation"}
          </button>
        </div>

        {/* Dual Card responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* CARD A: 3-Day Free Trial */}
          <Card
            className={`border-zinc-100 dark:border-zinc-800/80 shadow-md flex-col justify-between relative overflow-hidden group ${
              activeOnboardTab === "trial" ? "flex" : "hidden lg:flex"
            }`}
          >
            <div className="absolute top-0 right-0 p-4 opacity-[0.02] select-none pointer-events-none">
              <Sparkles className="h-32 w-32" />
            </div>

            <CardHeader className="border-b border-zinc-50 dark:border-zinc-900 pb-5">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <CardTitle className="text-lg font-display font-medium text-zinc-900 dark:text-zinc-100">
                    {lang === "ar" ? "تجربة مجانية لمدة 3 أيام" : "3-Day Free Trial"}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {lang === "ar"
                      ? "جرّب ميزات منصة Boutq مجاناً لمدة 3 أيام • ترقية في أي وقت لباقة التأسيس بـ 49 د.ب/سنوياً."
                      : "Test all features free for 3 days • Upgrade anytime to the 49 BHD/year Founder Plan."}
                  </CardDescription>
                </div>
                <span className="text-xs bg-[#B76E79]/10 text-[#B76E79] px-2 py-1 rounded font-semibold tracking-wider">
                  {lang === "ar" ? "مجانـي" : "FREE"}
                </span>
              </div>
            </CardHeader>

            <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800/60 space-y-2.5 text-xs select-none">
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <Check className="h-4 w-4 text-[#B76E79] shrink-0" />
                <span>
                  {lang === "ar"
                    ? "وصول كامل للوحة التحكم والمبيعات"
                    : "Full admin dashboard & revenue reporting"}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <Check className="h-4 w-4 text-[#B76E79] shrink-0" />
                <span>
                  {lang === "ar"
                    ? "معاينة حية للمتجر التجريبي الخاص بك"
                    : "Live customer-facing storefront preview"}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <Check className="h-4 w-4 text-[#B76E79] shrink-0" />
                <span>
                  {lang === "ar"
                    ? "تفعيل وإعداد عبر الواتساب فوراً"
                    : "Instant concierge setup via WhatsApp"}
                </span>
              </div>
            </div>

            <CardContent className="pt-6 space-y-4">
              <form onSubmit={handleRegisterTrial} className="space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="trial-name"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {lang === "ar" ? "الاسم الكامل" : "Owner Full Name"}
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                    <Input
                      id="trial-name"
                      placeholder={lang === "ar" ? "أدخل اسمك الكامل" : "Enter your full name"}
                      required
                      className="pl-10 text-sm"
                      value={trialFullName}
                      onChange={(e) => setTrialFullName(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="trial-phone"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {lang === "ar" ? "رقم الهاتف / الواتساب" : "WhatsApp Number"}
                    </Label>
                    <Input
                      id="trial-phone"
                      placeholder={
                        lang === "ar"
                          ? "أدخل رقم الواتساب (مثال: 39955508)"
                          : "Enter WhatsApp number (e.g. 39955508)"
                      }
                      required
                      className="text-sm"
                      value={trialContactNumber}
                      onChange={(e) => setTrialContactNumber(e.target.value)}
                      autoComplete="off"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="trial-email"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {lang === "ar" ? "البريد الإلكتروني" : "Email Address"}
                    </Label>
                    <Input
                      id="trial-email"
                      type="email"
                      placeholder={
                        lang === "ar"
                          ? "أدخل البريد الإلكتروني (مثال: name@domain.com)"
                          : "Enter email address (e.g. name@domain.com)"
                      }
                      required
                      className="text-sm"
                      value={trialEmail}
                      onChange={(e) => setTrialEmail(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="trial-subdomain"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {lang === "ar" ? "رابط موقع متجرك المطلوب" : "Desired Boutique Subdomain"}
                  </Label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs text-zinc-400 font-medium font-mono select-none">
                      https://
                    </span>
                    <Input
                      id="trial-subdomain"
                      placeholder={
                        lang === "ar"
                          ? "أدخل اسم المتجر المطلوب (مثال: velvet)"
                          : "Enter boutique name (e.g. velvet)"
                      }
                      required
                      className="pl-16 pr-24 font-mono text-xs text-primary"
                      value={trialSubdomain}
                      onChange={(e) => setTrialSubdomain(e.target.value)}
                      autoComplete="off"
                    />
                    <span className="absolute right-3 text-[10px] text-zinc-400 font-mono font-bold select-none">
                      .boutq.store
                    </span>
                  </div>

                  {trialSubdomain && (
                    <p className="text-[10px] flex items-center gap-1 mt-1">
                      {trialSubdomainChecking ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                          <span className="text-muted-foreground">
                            {lang === "ar"
                              ? "جاري التحقق من التوافر..."
                              : "Checking availability..."}
                          </span>
                        </>
                      ) : trialSubdomainAvailable === true ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span className="text-emerald-500 font-semibold">
                            {lang === "ar"
                              ? "الرابط متوفر وصالح للاستخدام!"
                              : "Subdomain handle is available!"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 inline-block" />
                          <span className="text-rose-500 font-semibold">
                            {lang === "ar"
                              ? "الرابط محجوز مسبقاً!"
                              : "This subdomain is already taken."}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="trial-business-type"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {lang === "ar" ? "نوع النشاط التجاري" : "Business / Store Type"}
                  </Label>
                  <Select value={trialBusinessType} onValueChange={setTrialBusinessType}>
                    <SelectTrigger
                      id="trial-business-type"
                      className="h-10 text-xs text-primary bg-background border-zinc-200"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Fashion">
                        {lang === "ar" ? "أزياء وملابس (Fashion)" : "Fashion & Apparel"}
                      </SelectItem>
                      <SelectItem value="Cafe / Restaurant">
                        {lang === "ar" ? "مقهى / مطعم (Cafe)" : "Cafe & Restaurant"}
                      </SelectItem>
                      <SelectItem value="Consulting / Services">
                        {lang === "ar" ? "خدمات / استشارات (Services)" : "Consulting & Services"}
                      </SelectItem>
                      <SelectItem value="Digital store">
                        {lang === "ar" ? "متجر رقمي (Digital)" : "Digital Store"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-xs font-semibold uppercase tracking-wider gap-2 bg-[#B76E79] hover:bg-[#a35e69] text-white mt-4"
                  disabled={trialSubdomainChecking || trialSubdomainAvailable === false}
                >
                  {lang === "ar"
                    ? "إرسال طلب تجربة الـ 3 أيام"
                    : "Submit Request & Start 3-Day Trial"}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* CARD B: Official Paid Registration */}
          <Card
            className={`border-zinc-100 dark:border-zinc-800/80 shadow-md flex-col justify-between relative overflow-hidden group ring-1 ring-primary/40 bg-primary/[0.01] ${
              activeOnboardTab === "paid" ? "flex" : "hidden lg:flex"
            }`}
          >
            <div className="absolute top-0 right-0 p-4 opacity-[0.02] select-none pointer-events-none">
              <Building2 className="h-32 w-32" />
            </div>

            <CardHeader className="border-b border-zinc-50 dark:border-zinc-900 pb-5">
              {/* Scarcity Founder Offer Badge */}
              <div className="flex">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500 text-[9px] font-bold uppercase tracking-wider mb-2.5 animate-pulse border border-rose-500/20">
                  {lang === "ar"
                    ? "🔥 عرض الإطلاق التأسيسي: ٤٩ د.ب/سنوياً (لأول متجرين فقط)"
                    : "🔥 Founder's Launch Offer: 49 BHD/year (First 2 Stores Only)"}
                </div>
              </div>

              <div className="flex justify-between items-start gap-4">
                <div>
                  <CardTitle className="text-lg font-display font-medium text-zinc-900 dark:text-zinc-100">
                    {lang === "ar" ? "تفعيل المتجر الفاخر الرسمي" : "Official Store Activation"}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    {lang === "ar"
                      ? "إصدار سنوي مرخص فوري ومدعوم بالكامل."
                      : "Activate your annual whitelabel boutique brand platform."}
                  </CardDescription>
                </div>
                <div className="text-right">
                  {loadingPrice ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-auto text-primary" />
                  ) : discountPrice !== null ? (
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-muted-foreground line-through font-mono">
                        {basePrice} {lang === "ar" ? "د.ب / سنوي" : "BHD / year"}
                      </span>
                      <span className="text-lg font-bold font-display text-emerald-500 animate-pulse">
                        {discountPrice} {lang === "ar" ? "د.ب / سنوي" : "BHD / year"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-lg font-bold font-display text-primary block">
                      {basePrice} {lang === "ar" ? "د.ب / سنوي" : "BHD / year"}
                    </span>
                  )}
                  <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider block mt-0.5">
                    {lang === "ar" ? "اشتراك سنوي" : "ANNUAL SUBSCRIPTION"}
                  </span>
                </div>
              </div>
            </CardHeader>

            <div className="px-6 py-4 bg-[#B76E79]/5 border-b border-[#B76E79]/10 space-y-2.5 text-xs select-none">
              <div className="flex items-center gap-2.5 text-[#B76E79] font-semibold">
                <Check className="h-4 w-4 shrink-0 text-[#B76E79]" />
                <span>
                  {lang === "ar"
                    ? "يتم الدفع سنوياً • يشمل نطاق فرعي، واستضافة، وبنفت بي وتحديثات برمجية."
                    : "Billed annually • Includes wildcard domain, hosting, BenefitPay integration & tech updates."}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>
                  {lang === "ar" ? "رابط مخصص ونطاق فرعي رسمي" : "Official custom subdomain handle"}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>
                  {lang === "ar"
                    ? "ضمان صيانة ودعم فني متواصل لـ 6 أشهر"
                    : "6 Months guaranteed technical support"}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>
                  {lang === "ar"
                    ? "صفر رسوم صيانة أو استضافة شهرية"
                    : "Zero monthly hosting or cloud storage fees"}
                </span>
              </div>
            </div>

            <CardContent className="pt-6 space-y-4">
              <form onSubmit={handleRegisterPaid} className="space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="paid-name"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {lang === "ar" ? "الاسم الكامل" : "Owner Full Name"}
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                    <Input
                      id="paid-name"
                      placeholder={lang === "ar" ? "أدخل اسمك الكامل" : "Enter your full name"}
                      required
                      className="pl-10 text-sm"
                      value={officialFullName}
                      onChange={(e) => setOfficialFullName(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="paid-phone"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {lang === "ar" ? "رقم الهاتف / الواتساب" : "WhatsApp Number"}
                    </Label>
                    <Input
                      id="paid-phone"
                      placeholder={
                        lang === "ar"
                          ? "أدخل رقم الواتساب (مثال: 39955508)"
                          : "Enter WhatsApp number (e.g. 39955508)"
                      }
                      required
                      className="text-sm"
                      value={officialContactNumber}
                      onChange={(e) => setOfficialContactNumber(e.target.value)}
                      autoComplete="off"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="paid-email"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {lang === "ar" ? "البريد الإلكتروني" : "Email Address"}
                    </Label>
                    <Input
                      id="paid-email"
                      type="email"
                      placeholder={
                        lang === "ar"
                          ? "أدخل البريد الإلكتروني (مثال: name@domain.com)"
                          : "Enter email address (e.g. name@domain.com)"
                      }
                      required
                      className="text-sm"
                      value={officialEmail}
                      onChange={(e) => setOfficialEmail(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="paid-subdomain"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {lang === "ar" ? "رابط موقع متجرك المطلوب" : "Desired Boutique Subdomain"}
                  </Label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs text-zinc-400 font-medium font-mono select-none">
                      https://
                    </span>
                    <Input
                      id="paid-subdomain"
                      placeholder={
                        lang === "ar"
                          ? "أدخل اسم المتجر المطلوب (مثال: velvet)"
                          : "Enter boutique name (e.g. velvet)"
                      }
                      required
                      className="pl-16 pr-24 font-mono text-xs text-primary"
                      value={officialSubdomain}
                      onChange={(e) => setOfficialSubdomain(e.target.value)}
                      autoComplete="off"
                    />
                    <span className="absolute right-3 text-[10px] text-zinc-400 font-mono font-bold select-none">
                      .boutq.store
                    </span>
                  </div>

                  {officialSubdomain && (
                    <p className="text-[10px] flex items-center gap-1 mt-1">
                      {officialSubdomainChecking ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                          <span className="text-muted-foreground">
                            {lang === "ar" ? "جاري التحقق..." : "Checking availability..."}
                          </span>
                        </>
                      ) : officialSubdomainAvailable === true ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span className="text-emerald-500 font-semibold">
                            {lang === "ar"
                              ? "الرابط متوفر وصالح للاستخدام!"
                              : "Subdomain handle is available!"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 inline-block" />
                          <span className="text-rose-500 font-semibold">
                            {lang === "ar"
                              ? "الرابط محجوز مسبقاً!"
                              : "This subdomain is already taken."}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="paid-business-type"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {lang === "ar" ? "نوع النشاط التجاري" : "Business / Store Type"}
                  </Label>
                  <Select value={officialBusinessType} onValueChange={setOfficialBusinessType}>
                    <SelectTrigger
                      id="paid-business-type"
                      className="h-10 text-xs text-primary bg-background border-zinc-200"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Fashion">
                        {lang === "ar" ? "أزياء وملابس (Fashion)" : "Fashion & Apparel"}
                      </SelectItem>
                      <SelectItem value="Cafe / Restaurant">
                        {lang === "ar" ? "مقهى / مطعم (Cafe)" : "Cafe & Restaurant"}
                      </SelectItem>
                      <SelectItem value="Consulting / Services">
                        {lang === "ar" ? "خدمات / استشارات (Services)" : "Consulting & Services"}
                      </SelectItem>
                      <SelectItem value="Digital store">
                        {lang === "ar" ? "متجر رقمي (Digital)" : "Digital Store"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Secure BenefitPay QR Mechanism inside Card B */}
                <div className="border border-zinc-100 dark:border-zinc-900 rounded-lg p-4 bg-zinc-50/50 dark:bg-zinc-950/20 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    <QrCode className="h-4 w-4 text-primary" />
                    <span>
                      {lang === "ar"
                        ? "مسح السداد عبر بنفت بي (BenefitPay)"
                        : "Scan & Pay via BenefitPay QR"}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-zinc-950 p-3 rounded border border-zinc-100 dark:border-zinc-900">
                    {/* Simulated or Custom Merchant QR Image */}
                    <div className="h-24 w-24 bg-zinc-50 dark:bg-zinc-900 rounded p-1.5 border border-zinc-100 dark:border-zinc-800 flex flex-col items-center justify-center shrink-0 overflow-hidden">
                      {benefitPayQrUrl ? (
                        <img
                          src={benefitPayQrUrl}
                          alt="BenefitPay QR"
                          className="h-full w-full object-contain animate-fade-in"
                        />
                      ) : (
                        <>
                          <QrCode className="h-16 w-16 stroke-[1.25] text-zinc-900 dark:text-zinc-100" />
                          <span className="text-[6px] font-bold text-zinc-400 dark:text-zinc-500 font-mono tracking-wider">
                            BOUTQ-MERCHANT
                          </span>
                        </>
                      )}
                    </div>

                    <div className="text-left space-y-1.5">
                      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        Merchant Account: {merchantAccountName}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {lang === "ar"
                          ? `امسح رمز الاستجابة السريع سدد المبلغ الموضح (${displayPrice})، ثم ارفع لقطة شاشة تأكيد الدفع لتأكيد المعاملة.`
                          : `Scan QR with BenefitPay, transfer ${displayPrice} to merchant, then upload the receipt screenshot below.`}
                      </p>
                    </div>
                  </div>

                  {/* IBAN Copy Field */}
                  <div className="bg-zinc-50 dark:bg-zinc-900/40 p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-85/80 flex items-center justify-between gap-3 text-xs select-none">
                    <div className="space-y-0.5 text-left">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">
                        {lang === "ar"
                          ? "رقم الحساب الدولي (IBAN)"
                          : "International Bank Account Number (IBAN)"}
                      </span>
                      <code className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200 font-bold">
                        BH12 KHCB 0000 0012 3456 7890
                      </code>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopyIban("BH12KHCB0000001234567890")}
                      className="h-8 w-8 text-primary hover:text-white hover:bg-primary border-primary/20 shrink-0"
                    >
                      {copiedIban ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>

                  {/* Receipt screenshot uploader */}
                  <div className="relative">
                    <input
                      id="onboarding-receipt-uploader"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleUploadReceipt}
                      className="hidden"
                      disabled={uploading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-10 border-dashed border-primary/45 bg-primary/[0.01] hover:bg-primary/[0.04]"
                      disabled={uploading}
                      onClick={() =>
                        document.getElementById("onboarding-receipt-uploader")?.click()
                      }
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span className="text-xs">
                            {lang === "ar" ? "جاري تشفير الرفع..." : "Encrypting R2 upload..."}
                          </span>
                        </>
                      ) : receiptKey ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-500" />
                          <span className="text-xs text-emerald-500 font-semibold">
                            {lang === "ar"
                              ? "تم رفع إيصال الدفع بنجاح!"
                              : "Receipt Screenshot Saved!"}
                          </span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="h-4 w-4 text-primary" />
                          <span className="text-xs">
                            {lang === "ar"
                              ? "تحميل لقطة شاشة إيصال الدفع"
                              : "Upload Receipt Screenshot"}
                          </span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="bg-zinc-100/60 dark:bg-zinc-900/30 p-3 rounded text-[10px] text-muted-foreground flex gap-2">
                  <Info className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                  <p className="leading-normal">
                    {lang === "ar"
                      ? "يشمل 6 أشهر من الدعم الفني المضمون. أي طلبات لميزات مخصصة في المستقبل سيتم تسعيرها عند الطلب."
                      : "6 months guaranteed technical support included. Future custom feature requests will be quoted on-demand."}
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-xs font-semibold uppercase tracking-wider gap-2 bg-primary text-white mt-4"
                  disabled={
                    officialSubdomainChecking ||
                    officialSubdomainAvailable === false ||
                    uploading ||
                    !receiptKey
                  }
                >
                  <Building2 className="h-4 w-4" />
                  {lang === "ar" ? "إرسال طلب التفعيل الرسمي" : "Submit Registration & Pay"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Footnote and sign-in links */}
        <div className="text-center text-xs text-muted-foreground border-t border-zinc-100 dark:border-zinc-900 pt-8 mt-10">
          <span>{lang === "ar" ? "لديك حساب بالفعل؟" : "Already have a boutique on Boutq?"} </span>
          <Link to="/auth" className="text-primary hover:underline font-semibold">
            {lang === "ar" ? "تسجيل الدخول للوحة التحكم" : "Sign in to Dashboard"}
          </Link>
        </div>
      </div>

      {/* Dynamic Features Transparency Modal */}
      {showFeaturesModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div
            dir={lang === "ar" ? "rtl" : "ltr"}
            className="bg-zinc-950/95 border border-zinc-800/85 rounded-3xl p-5 md:p-8 max-w-4xl w-full max-h-[90vh] md:max-h-[85vh] lg:max-h-none overflow-y-auto shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 text-white select-none"
          >
            {/* Close Button */}
            <button
              onClick={() => setShowFeaturesModal(false)}
              className={`absolute top-4 md:top-6 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 h-8 w-8 rounded-full flex items-center justify-center transition-all z-10 ${
                lang === "ar" ? "left-4 md:left-6" : "right-4 md:right-6"
              }`}
            >
              ✕
            </button>

            {/* Header */}
            <div
              className={`mb-6 flex items-center gap-3 border-b border-zinc-800/50 pb-4 ${
                lang === "ar" ? "pl-10" : "pr-10"
              }`}
            >
              <Store className="h-6 w-6 text-[#B76E79] shrink-0" />
              <div>
                <h3 className="text-lg md:text-xl font-display font-medium">
                  {lang === "ar"
                    ? "المميزات الفاخرة لمنصة Boutq"
                    : "Premium Features of the Boutq Platform"}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {lang === "ar"
                    ? "تفاصيل الشفافية الفنية والميزات المتوفرة في الكود البرمجي"
                    : "Full technical transparency of features ready in our codebase"}
                </p>
              </div>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Category 1: Storefront */}
              <div className="bg-zinc-900/40 border border-zinc-800/40 rounded-2xl p-5 space-y-3">
                <h4 className="text-xs font-bold text-[#B76E79] uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  {lang === "ar" ? "واجهة المتجر والتصميم" : "Storefront & UI"}
                </h4>
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>
                      {lang === "ar"
                        ? "روابط فرعية مخصصة فاخرة (اسم_متجرك.boutq.store)"
                        : "Sleek custom subdomain handles (yourname.boutq.store)"}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>
                      {lang === "ar"
                        ? "تصميم محمول فاخر متجاوب ومريح لنظر المشتري"
                        : "Couture mobile-first layout optimized for luxury catalog browsing"}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>
                      {lang === "ar"
                        ? "دعم كامل للغات المتعددة وعرض عملات متعددة (BHD, SAR, AED)"
                        : "Automatic localized languages (AR/EN) and multi-currency displays"}
                    </span>
                  </li>
                </ul>
              </div>

              {/* Category 2: Payments */}
              <div className="bg-zinc-900/40 border border-zinc-800/40 rounded-2xl p-5 space-y-3">
                <h4 className="text-xs font-bold text-[#B76E79] uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {lang === "ar" ? "المدفوعات والطلبات" : "Payments & Orders"}
                </h4>
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>
                      {lang === "ar"
                        ? "ربط فوري لرمز الاستجابة السريع لمحفظة BenefitPay"
                        : "Seamless custom QR image uploads for local BenefitPay transfers"}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>
                      {lang === "ar"
                        ? "خيارات دفع مرنة تشمل الدفع عند الاستلام (COD)"
                        : "Cash on Delivery checkout parameters integrated out-of-the-box"}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>
                      {lang === "ar"
                        ? "إرسال تفاصيل فواتير الطلبات فوراً لواتساب المتجر بنقرة واحدة"
                        : "Instant order detail generation dispatched directly to owner's WhatsApp"}
                    </span>
                  </li>
                </ul>
              </div>

              {/* Category 3: Dashboard */}
              <div className="bg-zinc-900/40 border border-zinc-800/40 rounded-2xl p-5 space-y-3">
                <h4 className="text-xs font-bold text-[#B76E79] uppercase tracking-wider flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  {lang === "ar" ? "لوحة التحكم والإدارة" : "Dashboard & Management"}
                </h4>
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>
                      {lang === "ar"
                        ? "كتالوج إدارة المنتجات وتتبع كميات المخزون المتعددة"
                        : "Dynamic product variants, size grids, and inventory stock control"}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>
                      {lang === "ar"
                        ? "سجل تتبع النفقات والمصروفات اليومية للتشغيل"
                        : "Operational expense tracking and real-time dashboard analytics"}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>
                      {lang === "ar"
                        ? "نظام أمان متطور وصلاحيات مخصصة لأعضاء الفريق"
                        : "Advanced RLS data isolating, secure passwordless logins & staff keys"}
                    </span>
                  </li>
                </ul>
              </div>

              {/* Category 4: Support */}
              <div className="bg-zinc-900/40 border border-zinc-800/40 rounded-2xl p-5 space-y-3">
                <h4 className="text-xs font-bold text-[#B76E79] uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {lang === "ar" ? "الدعم والبنية التحتية" : "Support & Infrastructure"}
                </h4>
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>
                      {lang === "ar"
                        ? "ضمان فني متكامل وصيانة خلو الأخطاء لـ 6 أشهر"
                        : "6 Months comprehensive technical bug fixes and support"}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>
                      {lang === "ar"
                        ? "استضافة صور سريعة مشفرة بالكامل عبر Cloudflare R2"
                        : "Secure localized imagery content cached over Cloudflare R2"}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>
                      {lang === "ar"
                        ? "صفر رسوم استضافة أو صيانة برمجية شهرية مدى الحياة"
                        : "Pay once, host forever with zero recurring monthly platform fees"}
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Footer Action */}
            <div className="mt-6 flex justify-end gap-3 border-t border-zinc-800/50 pt-4">
              <Button
                onClick={() => setShowFeaturesModal(false)}
                className="bg-[#B76E79] hover:bg-[#a35e69] text-white text-xs font-semibold rounded-xl px-5 h-10"
              >
                {lang === "ar" ? "حسناً، فهمت" : "Got it, thanks"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
