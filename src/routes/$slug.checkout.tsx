import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { BAHRAIN_REGIONS } from "@/lib/bahrain-regions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  CreditCard,
  Banknote,
  QrCode,
  Truck,
  Store,
  User,
  Download,
  Mail,
  MessageCircle,
  Copy,
  UploadCloud,
  CheckCircle2,
  X,
} from "lucide-react";
import { uploadBenefitReceipt } from "@/lib/benefit-receipt";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { ResponsiveImage } from "@/components/responsive-media";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/$slug/checkout")({
  component: Checkout,
});

type Fulfillment = "delivery" | "pickup" | "digital";

function Checkout() {
  const { brand, settings, cart, cartTotal, currency, lang, t, clearCart, session } =
    useStorefront();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const paymentError = searchParams.get("payment_error");
      if (paymentError) {
        toast.error(
          t(
            "فشلت عملية الدفع بالبطاقة. يرجى التحقق من بيانات البطاقة والمحاولة مرة أخرى.",
            "Card payment failed. Please check your card details and try again.",
          ),
          { duration: 6000 },
        );
        // Clear the query parameter so it doesn't fire again on refresh
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }
  }, [mounted, t]);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    label: "",
    region: "",
    block: "",
    road: "",
    house: "",
    flat: "",
    notes: "",
  });
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [saveToProfile, setSaveToProfile] = useState(false);
  const [whatsappOrderUpdates, setWhatsappOrderUpdates] = useState(false);

  const [showAccountPopup, setShowAccountPopup] = useState<{
    show: boolean;
    field: "email" | "phone" | null;
    value: string;
  }>({
    show: false,
    field: null,
    value: "",
  });
  const [ignoredAccountWarning, setIgnoredAccountWarning] = useState(false);

  const checkRegisteredAccount = async (field: "email" | "phone", value: string) => {
    if (!value || session || ignoredAccountWarning) return;
    try {
      const { data: exists, error } = await supabase.rpc("check_registered_customer_exists", {
        p_brand_id: brand.id,
        p_email: field === "email" ? value.trim() : "",
        p_phone: field === "phone" ? value.trim() : "",
      });

      if (error) {
        console.error("Error executing check_registered_customer_exists RPC:", error);
        return;
      }

      if (exists === true) {
        setShowAccountPopup({
          show: true,
          field,
          value,
        });
      }
    } catch (e) {
      console.error("Failed to check registered account via RPC", e);
    }
  };

  // Pre-fill from linked customer when signed in
  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      try {
        const { data: customer } = await supabase
          .from("customers")
          .select("id, name, phone, email, region, block, road, house, flat")
          .eq("brand_id", brand.id)
          .eq("auth_user_id", session.user.id)
          .maybeSingle();

        if (customer) {
          // Fetch saved addresses from customer_addresses
          const { data: addresses } = await supabase
            .from("customer_addresses")
            .select("id, label, region, block, road, house, flat, is_default")
            .eq("customer_id", customer.id);

          if (addresses && addresses.length > 0) {
            setSavedAddresses(addresses);
            const defaultAddr = addresses.find((a) => a.is_default) || addresses[0];
            setSelectedAddressId(defaultAddr.id);
            setForm((f) => ({
              ...f,
              name: f.name || customer.name || "",
              phone: f.phone || customer.phone || "",
              email: f.email || customer.email || session.user.email || "",
              label: defaultAddr.label || "",
              region: defaultAddr.region || "",
              block: defaultAddr.block || "",
              road: defaultAddr.road || "",
              house: defaultAddr.house || "",
              flat: defaultAddr.flat || "",
            }));
          } else {
            setForm((f) => ({
              ...f,
              name: f.name || customer.name || "",
              phone: f.phone || customer.phone || "",
              email: f.email || customer.email || session.user.email || "",
              region: f.region || customer.region || "",
              block: f.block || (customer as any).block || "",
              road: f.road || customer.road || "",
              house: f.house || customer.house || "",
              flat: f.flat || customer.flat || "",
            }));
          }
        } else if (session.user.email) {
          setForm((f) => ({ ...f, email: f.email || session.user.email || "" }));
        }
      } catch (e) {
        console.error("checkout prefill failed", e);
      }
    })();
  }, [session, brand.id]);

  const handleAddressChange = (addressId: string) => {
    setSelectedAddressId(addressId);
    if (addressId === "manual") {
      setForm((f) => ({
        ...f,
        label: "",
        region: "",
        block: "",
        road: "",
        house: "",
        flat: "",
      }));
    } else {
      const selected = savedAddresses.find((a) => a.id === addressId);
      if (selected) {
        setForm((f) => ({
          ...f,
          label: selected.label || "",
          region: selected.region || "",
          block: selected.block || "",
          road: selected.road || "",
          house: selected.house || "",
          flat: selected.flat || "",
        }));
      }
    }
  };

  const availableMethods: Array<{
    id: "cod" | "card" | "benefit";
    ar: string;
    en: string;
    icon: any;
  }> = [
    settings.cod_enabled && {
      id: "cod" as const,
      ar: "الدفع عند الاستلام",
      en: "Cash on delivery",
      icon: Banknote,
    },
    settings.card_enabled && {
      id: "card" as const,
      ar: "الدفع بالبطاقة",
      en: "Card payment",
      icon: CreditCard,
    },
    settings.benefit_enabled && {
      id: "benefit" as const,
      ar: "عن طريق البنفت",
      en: "Benefit Pay",
      icon: QrCode,
    },
  ].filter(Boolean) as any;

  const [method, setMethod] = useState<"cod" | "card" | "benefit" | "">(
    availableMethods[0]?.id ?? "",
  );

  const fulfillmentOptions = useMemo(() => {
    const opts: Array<{ id: Fulfillment; ar: string; en: string; icon: any; fee: number }> = [];
    if (settings.delivery_enabled)
      opts.push({
        id: "delivery",
        ar: "توصيل",
        en: "Delivery",
        icon: Truck,
        fee: settings.delivery_fee,
      });
    if (settings.pickup_enabled)
      opts.push({
        id: "pickup",
        ar: "استلام من الفرع",
        en: "Pickup from branch",
        icon: Store,
        fee: 0,
      });
    if (settings.digital_delivery_enabled)
      opts.push({
        id: "digital",
        ar: "تسليم رقمي",
        en: "Digital delivery",
        icon: Download,
        fee: 0,
      });
    return opts;
  }, [
    settings.delivery_enabled,
    settings.pickup_enabled,
    settings.digital_delivery_enabled,
    settings.delivery_fee,
  ]);

  const [fulfillment, setFulfillment] = useState<Fulfillment>(
    fulfillmentOptions[0]?.id ?? "delivery",
  );
  useEffect(() => {
    if (fulfillmentOptions.length > 0 && !fulfillmentOptions.find((o) => o.id === fulfillment)) {
      setFulfillment(fulfillmentOptions[0].id);
    }
  }, [fulfillmentOptions, fulfillment]);

  const [branches, setBranches] = useState<
    Array<{
      id: string;
      name_ar: string | null;
      name_en: string | null;
      location_ar: string | null;
      location_en: string | null;
      notes_ar: string | null;
      notes_en: string | null;
    }>
  >([]);
  const [branchId, setBranchId] = useState<string>("");
  const [digitalChannel, setDigitalChannel] = useState<"email" | "whatsapp">("email");
  const [digitalContact, setDigitalContact] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; amount: number } | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [benefitReceipt, setBenefitReceipt] = useState<File | null>(null);
  useEffect(() => {
    if (!settings.pickup_enabled) return;
    (async () => {
      const { data } = await supabase.rpc("get_public_branches" as any, {
        p_brand_id: brand.id,
      });
      const list = (data ?? []) as any[];
      setBranches(list);
      setBranchId((cur) => cur || (list[0]?.id ?? ""));
    })();
  }, [brand.id, settings.pickup_enabled]);
  const branchLabel = (b: (typeof branches)[number]) =>
    lang === "ar" ? b.name_ar || b.name_en || "" : b.name_en || b.name_ar || "";
  const branchLoc = (b: (typeof branches)[number]) =>
    lang === "ar" ? b.location_ar || b.location_en || "" : b.location_en || b.location_ar || "";

  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const zones = useMemo(() => settings.shipping_zones ?? [], [settings.shipping_zones]);
  useEffect(() => {
    if (zones.length > 0) {
      setSelectedZoneId((cur) => cur || zones[0].id);
    }
  }, [zones]);

  const selectedZone = zones.find((z) => z.id === selectedZoneId);

  const shipping =
    fulfillment === "delivery"
      ? zones.length > 0
        ? (selectedZone?.fee ?? 0)
        : Number(settings.delivery_fee || 0)
      : 0;
  const promoDiscount = Math.min(appliedPromo?.amount ?? 0, cartTotal);
  const grandTotal = Math.max(0, cartTotal - promoDiscount) + shipping;

  useEffect(() => {
    if (!cart.length) return;
    trackStorefrontEvent(
      "begin_checkout",
      {
        currency,
        value: Number(cartTotal.toFixed(3)),
        items: cart.map((item) => ({
          item_id: item.product_id,
          item_name: item.name,
          price: item.price,
          quantity: item.qty,
        })),
      },
      cart.map((item) => `${item.cart_line_id}:${item.qty}`).join("|"),
    );
  }, [cart, cartTotal, currency]);

  useEffect(() => {
    setAppliedPromo(null);
  }, [cart, brand.id]);

  const applyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return toast.error(t("أدخل رمز الخصم", "Enter a promo code"));
    setCheckingPromo(true);
    const promoItems = cart.map((item) => ({
      variant_id: item.variant_id,
      line_total: Number((item.price * item.qty).toFixed(3)),
    }));
    const { data, error } = await supabase.rpc("validate_promo_code" as any, {
      p_brand_slug: brand.slug,
      p_code: code,
      p_subtotal: cartTotal,
      p_items: promoItems,
      p_customer_id: null,
    });
    setCheckingPromo(false);
    if (error) return toast.error(t("تعذر التحقق من الرمز", "Could not validate this code"));
    const result = data as any;
    if (!result?.valid) {
      setAppliedPromo(null);
      if (result?.reason === "MINIMUM_NOT_MET")
        return toast.error(
          t(
            `الحد الأدنى للطلب ${formatPrice(Number(result.minimum_order_amount), currency, lang)}`,
            `Minimum order is ${formatPrice(Number(result.minimum_order_amount), currency, lang)}`,
          ),
        );
      if (result?.reason === "CODE_INACTIVE")
        return toast.error(
          t("رمز الخصم هذا لم يعد نشطاً.", "This promotional code is no longer active."),
        );
      if (result?.reason === "FIRST_ORDER_ONLY")
        return toast.error(
          t(
            "رمز الخصم هذا مخصص للعملاء الجدد فقط.",
            "This promo code is restricted to first-time customers only.",
          ),
        );
      if (result?.reason === "AUTH_REQUIRED")
        return toast.error(t("سجّل الدخول لاستخدام هذا الرمز.", "Sign in to use this promo code."));
      if (result?.reason === "USAGE_LIMIT_REACHED")
        return toast.error(
          t(
            "لقد وصلت إلى الحد المسموح لاستخدام هذا الرمز.",
            "You have reached this code's usage limit.",
          ),
        );
      if (result?.reason === "NO_ELIGIBLE_ITEMS")
        return toast.error(
          t(
            "لا يمكن تطبيق رمز الخصم هذا على المنتجات المخفضة مسبقاً.",
            "This promo code cannot be applied to items already on discount/sale.",
          ),
        );
      if (result?.reason === "CODE_NOT_FOUND")
        return toast.error(
          t("رمز الخصم غير موجود لهذا المتجر.", "This promo code does not exist for this brand."),
        );
      return toast.error(
        t(
          "تعذر تطبيق رمز الخصم. تحقق من شروطه.",
          "This promo code could not be applied. Check its eligibility rules.",
        ),
      );
    }
    setAppliedPromo({ code: result.code, amount: Number(result.discount_amount) });
    setPromoInput(result.code);
    toast.success(t("تم تطبيق الخصم", "Promo code applied"));
  };

  if (cart.length === 0) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <Card className="p-8">
          <p className="mb-4">{t("السلة فارغة", "Your cart is empty")}</p>
          <Link to="/$slug" params={{ slug: brand.slug }} className="underline">
            {t("العودة للمتجر", "Back to store")}
          </Link>
        </Card>
      </div>
    );
  }

  const submit = async () => {
    if (!form.name.trim() || (fulfillment !== "digital" && !form.phone.trim())) {
      toast.error(t("الاسم والهاتف مطلوبان", "Name and phone are required"));
      return;
    }
    const customerEmail = form.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      toast.error(
        t(
          "يرجى إدخال بريد إلكتروني صحيح لتصلك تحديثات الطلب",
          "Enter a valid email address to receive order updates",
        ),
      );
      return;
    }
    if (fulfillment === "delivery") {
      if (!form.region || !form.block.trim() || !form.road.trim() || !form.house.trim()) {
        toast.error(t("يرجى تعبئة كامل عنوان التوصيل", "Please complete the delivery address"));
        return;
      }
    }
    if (!method) {
      toast.error(t("اختر طريقة دفع", "Choose a payment method"));
      return;
    }
    if (method === "benefit" && !benefitReceipt) {
      toast.error(
        t(
          "يرجى إرفاق صورة إيصال التحويل لتأكيد الطلب",
          "Please attach the transfer receipt to confirm your order",
        ),
      );
      return;
    }
    if (fulfillment === "pickup" && branches.length > 0 && !branchId) {
      toast.error(t("اختر الفرع", "Select a branch"));
      return;
    }
    if (fulfillment === "digital") {
      const contact = digitalContact.trim();
      if (!contact) {
        toast.error(
          t(
            "أدخل البريد الإلكتروني أو رقم/معرّف واتساب",
            "Enter the email or WhatsApp number/user ID",
          ),
        );
        return;
      }
      if (digitalChannel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
        toast.error(t("أدخل بريداً إلكترونياً صحيحاً", "Enter a valid email address"));
        return;
      }
    }
    setSubmitting(true);
    try {
      const benefitReceiptId =
        method === "benefit" && benefitReceipt
          ? await uploadBenefitReceipt(brand.id, benefitReceipt)
          : null;
      const { data, error } = await supabase.rpc("place_storefront_order", {
        p_brand_slug: brand.slug,
        p_customer: {
          name: form.name,
          phone: form.phone,
          email: customerEmail,
          label: form.label,
          region: form.region,
          block: form.block,
          road: form.road,
          house: form.house,
          flat: form.flat,
          save_to_profile: Boolean(session?.user && saveToProfile),
        },
        p_items: cart.map((c) => ({
          variant_id: c.variant_id,
          quantity: c.qty,
          selected_variant: {
            size: c.size,
            color: c.color,
            fabric: c.fabric ?? null,
          },
          // Send both names during rollout. The database normalizes these to
          // order_items.custom_field_values.
          custom_fields: c.custom_fields ?? [],
          custom_field_values: c.custom_fields ?? [],
        })),
        p_payment_method: method,
        p_notes: form.notes || undefined,
        p_fulfillment: fulfillment,
        p_branch_id: fulfillment === "pickup" ? branchId || null : null,
        p_digital_channel: fulfillment === "digital" ? digitalChannel : null,
        p_digital_contact: fulfillment === "digital" ? digitalContact.trim() : null,
        p_promo_code: appliedPromo?.code ?? null,
        p_benefit_receipt_id: benefitReceiptId,
        p_shipping_fee:
          fulfillment === "delivery"
            ? zones.length > 0
              ? (selectedZone?.fee ?? 0)
              : Number(settings.delivery_fee || 0)
            : 0,
        p_shipping_zone:
          fulfillment === "delivery"
            ? zones.length > 0
              ? selectedZone
                ? lang === "ar"
                  ? selectedZone.name_ar
                  : selectedZone.name_en
                : null
              : lang === "ar"
                ? "توصيل"
                : "Delivery"
            : null,
        p_idempotency_key: idempotencyKey,
      } as any);
      if (error) throw error;
      const orderId = (data as any)?.order_id;
      const confirmationToken = (data as any)?.confirmation_email_token;
      if (brand.slug === "pura" && whatsappOrderUpdates && orderId && confirmationToken) {
        const { error: whatsappOptInError } = await supabase.rpc(
          "record_order_whatsapp_opt_in" as any,
          {
            p_order_id: orderId,
            p_confirmation_token: confirmationToken,
          },
        );
        if (whatsappOptInError) {
          console.warn("[checkout] WhatsApp order-update consent could not be recorded");
        }
      }
      trackStorefrontEvent(
        "purchase",
        {
          transaction_id: String(orderId ?? ""),
          currency,
          value: Number(grandTotal.toFixed(3)),
          shipping: Number(shipping.toFixed(3)),
          coupon: appliedPromo?.code ?? undefined,
          items: cart.map((item) => ({
            item_id: item.product_id,
            item_name: item.name,
            price: item.price,
            quantity: item.qty,
          })),
        },
        String(orderId ?? ""),
      );
      // If they chose to pay via Card, redirect to payment gateway
      if (method === "card") {
        const toastId = toast.loading(
          t("جاري تحويلك لبوابة الدفع...", "Redirecting you to the payment gateway..."),
        );
        try {
          const chargeRes = await fetch("/api/public/payments/create-tap-charge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: String(orderId),
              brandId: brand.id,
              redirectUrl: `${window.location.origin}/api/public/payments/tap-redirect?order_id=${orderId}&brand_id=${brand.id}`,
            }),
          });

          if (!chargeRes.ok) {
            const errData = await chargeRes.json<{ error?: string }>();
            throw new Error(errData.error || "Failed to initiate card payment.");
          }

          const { redirectUrl } = await chargeRes.json<{ redirectUrl: string }>();
          toast.dismiss(toastId);
          window.location.href = redirectUrl;
          return;
        } catch (paymentErr: any) {
          toast.dismiss(toastId);
          throw new Error(paymentErr.message || "Failed to initiate payment gateway.");
        }
      }

      clearCart();
      toast.success(t("تم استلام طلبك!", "Order placed!"));
      navigate({
        to: "/$slug/thank-you/$orderId",
        params: { slug: brand.slug, orderId: String(orderId ?? "") },
        search: { fulfillment, channel: fulfillment === "digital" ? digitalChannel : "email" },
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("INSUFFICIENT_STOCK")) {
        toast.error(t("المخزون غير كافٍ لأحد المنتجات", "Insufficient stock for one item"));
      } else if (msg.includes("PAYMENT_METHOD_DISABLED")) {
        toast.error(t("طريقة الدفع غير متاحة", "Payment method unavailable"));
      } else if (
        msg.includes("DELIVERY_DISABLED") ||
        msg.includes("PICKUP_DISABLED") ||
        msg.includes("DIGITAL_DELIVERY_DISABLED")
      ) {
        toast.error(t("طريقة التسليم غير متاحة", "Fulfillment method unavailable"));
      } else if (
        msg.includes("DIGITAL_CONTACT") ||
        msg.includes("DIGITAL_EMAIL") ||
        msg.includes("DIGITAL_CHANNEL")
      ) {
        toast.error(t("تحقق من بيانات التسليم الرقمي", "Check the digital delivery details"));
      } else if (msg.includes("PROMO_FIRST_ORDER_ONLY")) {
        setAppliedPromo(null);
        toast.error(
          t(
            "رمز الخصم هذا مخصص للعملاء الجدد فقط.",
            "This promo code is restricted to first-time customers only.",
          ),
        );
      } else if (msg.includes("PROMO_USAGE_LIMIT_REACHED")) {
        setAppliedPromo(null);
        toast.error(
          t(
            "لقد وصلت إلى الحد المسموح لاستخدام هذا الرمز.",
            "You have reached this code's usage limit.",
          ),
        );
      } else if (msg.includes("PROMO_NO_ELIGIBLE_ITEMS")) {
        setAppliedPromo(null);
        toast.error(
          t(
            "لا يمكن تطبيق رمز الخصم هذا على المنتجات المخفضة مسبقاً.",
            "This promo code cannot be applied to items already on discount/sale.",
          ),
        );
      } else if (msg.includes("PROMO_AUTH_REQUIRED")) {
        setAppliedPromo(null);
        toast.error(t("سجّل الدخول لاستخدام هذا الرمز.", "Sign in to use this promo code."));
      } else if (msg.includes("RECEIPT_STORAGE_UNREACHABLE")) {
        toast.error(
          t(
            "تعذر الوصول إلى التخزين الآمن للإيصال. حاول مرة أخرى أو تواصل مع المتجر.",
            "The secure receipt upload could not be reached. Please retry or contact the store.",
          ),
        );
      } else if (msg.includes("BENEFIT_RECEIPT")) {
        toast.error(
          t(
            "تعذر التحقق من إيصال التحويل. أعد رفع الصورة وحاول مرة أخرى.",
            "The transfer receipt could not be verified. Upload it again and retry.",
          ),
        );
      } else if (msg.includes("CUSTOMER_ACCOUNT_EXISTS_SIGN_IN_REQUIRED")) {
        toast.error(
          t(
            "هذا البريد الإلكتروني أو رقم الهاتف مرتبط بحساب موجود. سجّل الدخول لإكمال الطلب بأمان.",
            "This email or phone belongs to an existing account. Sign in to continue securely.",
          ),
        );
      } else if (msg.includes("CUSTOMER_CONTACT_ALREADY_REGISTERED")) {
        toast.error(
          t(
            "البريد الإلكتروني أو رقم الهاتف مستخدم في حساب عميل آخر.",
            "This email or phone is already used by another customer account.",
          ),
        );
      } else if (msg.includes("PROMO_")) {
        setAppliedPromo(null);
        toast.error(
          t(
            "رمز الخصم لم يعد صالحاً لهذا الطلب",
            "The promo code is no longer valid for this order",
          ),
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-8 pb-28 md:py-8 grid md:grid-cols-[1fr_360px] gap-6">
      <h1 className="sr-only">{t("إتمام الطلب", "Checkout")}</h1>
      <div className="space-y-4">
        {!session && (
          <Card className="p-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-primary/30 bg-primary/5">
            <div className="flex min-w-0 items-center gap-3">
              <User className="h-5 w-5 shrink-0" />
              <p className="text-sm min-w-0 break-words">
                {t(
                  "لديك حساب؟ سجّل الدخول لملء البيانات تلقائيًا.",
                  "Have an account? Sign in to prefill your details.",
                )}
              </p>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link
                to="/$slug/auth"
                params={{ slug: brand.slug }}
                search={{ redirect: mounted ? window.location.pathname : "" }}
              >
                {t("سجّل الدخول", "Sign in")}
              </Link>
            </Button>
          </Card>
        )}

        <Card className="p-5 space-y-4">
          <h2 className="font-display text-xl">{t("بيانات العميل", "Customer details")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="checkout-name">{t("الاسم الكامل", "Full name")} *</Label>
              <Input
                id="checkout-name"
                name="name"
                autoComplete="name"
                className="h-11"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="checkout-phone">{t("رقم الهاتف", "Phone")} *</Label>
              <Input
                id="checkout-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="h-11"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                onBlur={(e) => checkRegisteredAccount("phone", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="checkout-email">{t("البريد الإلكتروني", "Email")}</Label>
              <Input
                id="checkout-email"
                name="email"
                required
                type="email"
                autoComplete="email"
                className="h-11"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                onBlur={(e) => checkRegisteredAccount("email", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="checkout-notes">{t("ملاحظات", "Notes")}</Label>
            <Textarea
              id="checkout-notes"
              name="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          {session?.user && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
              <Checkbox
                className="mt-0.5"
                checked={saveToProfile}
                onCheckedChange={(checked) => setSaveToProfile(checked === true)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {t("حفظ الاسم ورقم الهاتف في ملفي", "Save name and phone to my profile")}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "لن تتغير بيانات ملفك ما لم تحدد هذا الخيار. تغيير البريد الإلكتروني يتطلب التحقق من الحساب.",
                    "Your profile stays unchanged unless selected. Email changes require account verification.",
                  )}
                </span>
              </span>
            </label>
          )}
          {brand.slug === "pura" && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
              <Checkbox
                className="mt-0.5"
                checked={whatsappOrderUpdates}
                onCheckedChange={(checked) => setWhatsappOrderUpdates(checked === true)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {t(
                    "أرسل لي تحديثات هذا الطلب عبر واتساب",
                    "Send me updates for this order on WhatsApp",
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "سنستخدم رقم الهاتف أعلاه لإرسال تحديثات الطلب فقط. يمكنك إيقاف الرسائل في أي وقت.",
                    "We will use the phone number above for order updates only. You can opt out at any time.",
                  )}
                </span>
              </span>
            </label>
          )}
        </Card>

        {fulfillmentOptions.length > 0 && (
          <Card className="p-5 space-y-3">
            <h2 className="font-display text-xl">{t("طريقة التسليم", "Fulfillment method")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fulfillmentOptions.map((opt) => {
                const Icon = opt.icon;
                const active = fulfillment === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFulfillment(opt.id)}
                    className={`text-start flex items-center gap-3 p-4 rounded-lg border transition-all ${active ? "border-current" : "border-input"}`}
                    style={
                      active
                        ? {
                            borderColor: settings.primary_color,
                            backgroundColor: `${settings.primary_color}11`,
                          }
                        : undefined
                    }
                  >
                    <div
                      className="h-10 w-10 rounded-md grid place-items-center"
                      style={{
                        backgroundColor: active ? settings.primary_color : "hsl(var(--muted))",
                        color: active ? "#fff" : "inherit",
                      }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{lang === "ar" ? opt.ar : opt.en}</div>
                      <div className="text-xs text-muted-foreground">
                        {opt.fee > 0 ? formatPrice(opt.fee, currency, lang) : t("مجانًا", "Free")}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {fulfillment === "pickup" && (
          <Card className="p-5 space-y-3">
            <h2 className="font-display text-xl">{t("اختر الفرع", "Choose branch")}</h2>
            {branches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("لا توجد فروع متاحة حاليًا.", "No branches available right now.")}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {branches.map((b) => {
                  const active = branchId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBranchId(b.id)}
                      className={`relative text-start p-4 rounded-xl border-2 transition-all hover:shadow-sm ${active ? "shadow-sm" : "border-input bg-background hover:border-foreground/30"}`}
                      style={
                        active
                          ? {
                              borderColor: settings.primary_color,
                              backgroundColor: `${settings.primary_color}14`,
                            }
                          : undefined
                      }
                      aria-pressed={active}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 grid place-items-center transition-colors ${active ? "" : "border-muted-foreground/40"}`}
                          style={
                            active
                              ? {
                                  borderColor: settings.primary_color,
                                  backgroundColor: settings.primary_color,
                                }
                              : undefined
                          }
                          aria-hidden
                        >
                          {active && <span className="h-2 w-2 rounded-full bg-white" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold truncate">{branchLabel(b)}</div>
                          {branchLoc(b) && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {branchLoc(b)}
                            </div>
                          )}
                          {(lang === "ar" ? b.notes_ar : b.notes_en) && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {lang === "ar" ? b.notes_ar : b.notes_en}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {fulfillment === "digital" && (
          <Card className="p-5 space-y-4">
            <div>
              <h2 className="font-display text-xl">
                {t("طريقة استلام المنتج الرقمي", "Digital delivery channel")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  "اختر طريقة واحدة وأدخل بيانات الاستلام المطلوبة.",
                  "Choose one channel and enter the required delivery contact.",
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["email", t("البريد الإلكتروني", "Email"), Mail],
                  ["whatsapp", t("واتساب", "WhatsApp"), MessageCircle],
                ] as const
              ).map(([channel, label, Icon]) => (
                <button
                  key={channel}
                  type="button"
                  onClick={() => {
                    setDigitalChannel(channel);
                    setDigitalContact("");
                  }}
                  className="flex items-center gap-2 rounded-lg border p-3"
                  style={
                    digitalChannel === channel
                      ? {
                          borderColor: settings.primary_color,
                          backgroundColor: `${settings.primary_color}11`,
                        }
                      : undefined
                  }
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div>
              <Label htmlFor="digital-delivery-contact">
                {digitalChannel === "email"
                  ? t("البريد الإلكتروني", "Email address")
                  : t("رقم أو معرّف واتساب", "WhatsApp number or user ID")}{" "}
                *
              </Label>
              <Input
                id="digital-delivery-contact"
                name="digital-delivery-contact"
                className="h-11"
                type={digitalChannel === "email" ? "email" : "text"}
                inputMode={digitalChannel === "email" ? "email" : "text"}
                autoComplete={digitalChannel === "email" ? "email" : "tel"}
                value={digitalContact}
                onChange={(e) => setDigitalContact(e.target.value)}
                placeholder={
                  digitalChannel === "email"
                    ? "name@example.com"
                    : t("مثال: +973… أو معرّف المستخدم", "e.g. +973… or user ID")
                }
              />
            </div>
          </Card>
        )}

        {fulfillment === "delivery" && (
          <Card className="p-5 space-y-4">
            <h2 className="font-display text-xl">{t("عنوان التوصيل", "Delivery address")}</h2>

            {savedAddresses.length > 0 && (
              <div className="mb-4">
                <Label htmlFor="saved-address">
                  {t("اختر من العناوين المحفوظة", "Choose from saved addresses")}
                </Label>
                <Select
                  name="saved-address"
                  value={selectedAddressId}
                  onValueChange={(v) => handleAddressChange(v)}
                >
                  <SelectTrigger id="saved-address" className="mt-1.5 h-11 w-full">
                    <SelectValue placeholder={t("اختر عنواناً", "Select an address")} />
                  </SelectTrigger>
                  <SelectContent>
                    {savedAddresses.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label || t("عنوان", "Address")} - {a.region}, {t("مجمع", "Block")}{" "}
                        {a.block}, {t("طريق", "Road")} {a.road}, {t("منزل", "House")} {a.house}
                      </SelectItem>
                    ))}
                    <SelectItem value="manual">
                      {t("إدخال يدوي / عنوان جديد", "Enter manually / New address")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {zones.length > 0 && (
              <div className="mb-4">
                <Label className="font-semibold text-sm mb-1.5 block">
                  {t("منطقة الشحن والتوصيل", "Shipping & Delivery Zone")} *
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {zones.map((z) => {
                    const active = z.id === selectedZoneId;
                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => setSelectedZoneId(z.id)}
                        className="flex items-center justify-between p-3 rounded-lg border text-sm transition-all text-start cursor-pointer hover:bg-secondary/5"
                        style={
                          active
                            ? {
                                borderColor: settings.primary_color,
                                backgroundColor: `${settings.primary_color}11`,
                              }
                            : undefined
                        }
                      >
                        <div>
                          <p className="font-medium">{lang === "ar" ? z.name_ar : z.name_en}</p>
                        </div>
                        <div
                          className="text-end font-mono font-semibold"
                          style={active ? { color: settings.primary_color } : undefined}
                        >
                          {z.fee > 0 ? formatPrice(z.fee, currency, lang) : t("مجانًا", "Free")}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="checkout-address-label">{t("لقب العنوان", "Address label")}</Label>
                <Input
                  id="checkout-address-label"
                  name="address-label"
                  autoComplete="address-level3"
                  className="h-11"
                  placeholder={t("مثل: المنزل، المكتب", "e.g. Home, Work")}
                  value={form.label}
                  onChange={(e) => {
                    setSelectedAddressId("manual");
                    setForm({ ...form, label: e.target.value });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="checkout-region">{t("المنطقة", "Region")} *</Label>
                <Select
                  name="region"
                  value={form.region}
                  onValueChange={(v) => {
                    setSelectedAddressId("manual");
                    setForm({ ...form, region: v });
                  }}
                >
                  <SelectTrigger id="checkout-region" className="h-11">
                    <SelectValue placeholder={t("اختر المنطقة", "Select region")} />
                  </SelectTrigger>
                  <SelectContent>
                    {BAHRAIN_REGIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {lang === "ar" ? r.ar : r.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="checkout-block">{t("المجمع", "Block")} *</Label>
                <Input
                  id="checkout-block"
                  name="block"
                  inputMode="numeric"
                  autoComplete="address-level2"
                  className="h-11"
                  placeholder={t("مثال: 428", "e.g. 428")}
                  value={form.block}
                  onChange={(e) => {
                    setSelectedAddressId("manual");
                    setForm({ ...form, block: e.target.value });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="checkout-road">{t("الطريق / الشارع", "Road / Avenue")} *</Label>
                <Input
                  id="checkout-road"
                  name="road"
                  inputMode="numeric"
                  autoComplete="street-address"
                  className="h-11"
                  placeholder={t("مثال: 2825", "e.g. 2825")}
                  value={form.road}
                  onChange={(e) => {
                    setSelectedAddressId("manual");
                    setForm({ ...form, road: e.target.value });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="checkout-house">{t("منزل / بناية", "House / Building")} *</Label>
                <Input
                  id="checkout-house"
                  name="house"
                  inputMode="numeric"
                  autoComplete="address-line1"
                  className="h-11"
                  placeholder={t("مثال: 12", "e.g. 12")}
                  value={form.house}
                  onChange={(e) => {
                    setSelectedAddressId("manual");
                    setForm({ ...form, house: e.target.value });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="checkout-flat">{t("شقة (اختياري)", "Flat (optional)")}</Label>
                <Input
                  id="checkout-flat"
                  name="flat"
                  inputMode="numeric"
                  autoComplete="address-line2"
                  className="h-11"
                  placeholder={t("مثال: 4", "e.g. 4")}
                  value={form.flat}
                  onChange={(e) => {
                    setSelectedAddressId("manual");
                    setForm({ ...form, flat: e.target.value });
                  }}
                />
              </div>
            </div>
          </Card>
        )}

        <Card className="p-5 space-y-3">
          <h2 className="font-display text-xl">{t("طريقة الدفع", "Payment method")}</h2>
          {availableMethods.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("لا توجد طرق دفع مفعّلة حالياً.", "No payment methods enabled yet.")}
            </p>
          )}
          <div className="grid gap-2">
            {availableMethods.map((m: any) => {
              const Icon = m.icon;
              const active = method === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`text-start flex items-center gap-3 p-3 rounded-lg border ${active ? "border-current" : "border-input"}`}
                  style={
                    active
                      ? {
                          borderColor: settings.primary_color,
                          backgroundColor: `${settings.primary_color}11`,
                        }
                      : undefined
                  }
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{lang === "ar" ? m.ar : m.en}</span>
                </button>
              );
            })}
          </div>

          {method === "benefit" && (
            <div className="mt-3 p-4 border rounded-lg bg-muted/40 text-center">
              <p className="text-sm mb-3">
                {t(
                  "امسح رمز الاستجابة السريعة أدناه لإتمام الدفع عن طريق البنفت، ثم اضغط تأكيد الطلب.",
                  "Scan the QR code below to complete payment via Benefit, then confirm your order.",
                )}
              </p>
              {settings.benefit_qr_url ? (
                <div className="space-y-3">
                  <ResponsiveImage
                    src={settings.benefit_qr_url}
                    alt="Benefit QR"
                    preset="thumb"
                    sizes="240px"
                    className="mx-auto max-w-[240px] rounded-lg border bg-white p-2"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      try {
                        const response = await fetch(settings.benefit_qr_url!);
                        const blob = await response.blob();
                        const href = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = href;
                        a.download = `${brand.slug}-benefit-qr.png`;
                        a.click();
                        URL.revokeObjectURL(href);
                      } catch {
                        window.open(settings.benefit_qr_url!, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    <Download className="me-2 h-4 w-4" />
                    {t("اضغط هنا لحفظ الباركود في الاستوديو", "Save QR Code to Gallery")}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t(
                    "لم يقم المتجر برفع رمز البنفت بعد.",
                    "Store hasn't uploaded a Benefit QR yet.",
                  )}
                </p>
              )}
              {settings.benefit_account_number && (
                <div className="mt-4 rounded-lg border bg-background p-3">
                  <p className="mb-2 break-all font-semibold" dir="ltr">
                    {settings.benefit_account_number}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(settings.benefit_account_number!);
                      toast.success(t("تم نسخ رقم الحساب", "Account number copied"));
                    }}
                  >
                    <Copy className="me-2 h-4 w-4" />
                    {t("نسخ رقم الحساب", "Copy Account Number")}
                  </Button>
                </div>
              )}
              <div className="mt-4 text-start">
                <Label htmlFor="benefit-receipt" className="mb-2 block font-semibold">
                  {t(
                    "يرجى إرفاق صورة إيصال التحويل لتأكيد الطلب",
                    "Please attach a screenshot of the payment receipt",
                  )}
                </Label>
                <label
                  className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-background p-4 text-center hover:bg-muted/40"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) setBenefitReceipt(file);
                  }}
                >
                  <input
                    id="benefit-receipt"
                    name="benefit-receipt"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => setBenefitReceipt(e.target.files?.[0] ?? null)}
                  />
                  {benefitReceipt ? (
                    <>
                      <CheckCircle2 className="mb-2 h-7 w-7 text-emerald-600" />
                      <span className="max-w-full truncate font-medium">{benefitReceipt.name}</span>
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center text-xs text-destructive"
                        onClick={(e) => {
                          e.preventDefault();
                          setBenefitReceipt(null);
                        }}
                      >
                        <X className="me-1 h-3 w-3" />
                        {t("إزالة", "Remove")}
                      </button>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="mb-2 h-8 w-8 text-muted-foreground" />
                      <span>
                        {t(
                          "اسحب الصورة هنا أو اضغط للاختيار",
                          "Drop the image here or tap to choose",
                        )}
                      </span>
                      <span className="mt-1 text-xs text-muted-foreground">
                        JPG, PNG, WebP · 8 MB
                      </span>
                    </>
                  )}
                </label>
              </div>
            </div>
          )}

          {method === "card" && (
            <div className="mt-3 p-4 border rounded-lg text-sm text-center font-medium text-amber-800 border-amber-200/50 bg-amber-500/10 dark:text-amber-400 dark:border-amber-900/50 dark:bg-amber-950/10">
              {t(
                "سيتم تحويلك بشكل آمن إلى بوابة الدفع لإتمام عملية الدفع بالبطاقة فور تأكيد الطلب.",
                "You will be securely redirected to the payment gateway to complete your card payment upon placing the order.",
              )}
            </div>
          )}
        </Card>
      </div>

      <div>
        <Card className="p-5 sticky top-20 space-y-3">
          <h2 className="font-display text-xl">{t("ملخّص الطلب", "Order summary")}</h2>
          <div className="space-y-2 max-h-72 overflow-auto">
            {cart.map((c) => (
              <div key={c.cart_line_id} className="flex justify-between gap-3 text-sm">
                <div className="min-w-0 me-2">
                  <div className="truncate">
                    {c.name} × {c.qty}
                  </div>
                  {[c.size, c.color, c.fabric].filter(Boolean).length > 0 && (
                    <div className="truncate text-xs text-muted-foreground">
                      {[c.size, c.color, c.fabric].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {(c.custom_fields ?? []).map((field) => (
                    <div
                      key={field.key}
                      className="text-xs text-muted-foreground break-words flex flex-wrap items-center gap-1"
                    >
                      <span>
                        {lang === "ar"
                          ? field.label_ar || field.label_en || field.key
                          : field.label_en || field.label_ar || field.key}
                        :
                      </span>
                      {field.value.startsWith("http") ? (
                        <a
                          href={field.value}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline font-semibold inline-flex items-center gap-0.5"
                        >
                          📎 {lang === "ar" ? "عرض الملف" : "View File"}
                        </a>
                      ) : (
                        <span>{field.value}</span>
                      )}
                    </div>
                  ))}
                </div>
                <span className="flex flex-col items-end">
                  <span>{formatPrice(c.price * c.qty, currency, lang)}</span>
                  {Number(c.original_price || 0) > c.price && (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatPrice(Number(c.original_price) * c.qty, currency, lang)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("المجموع الفرعي", "Subtotal")}</span>
              <span>{formatPrice(cartTotal, currency, lang)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("رسوم التوصيل", "Delivery fee")}</span>
              <span>
                {shipping > 0 ? formatPrice(shipping, currency, lang) : t("مجانًا", "Free")}
              </span>
            </div>
            {promoDiscount > 0 && (
              <div className="flex justify-between font-medium text-emerald-700">
                <span>
                  {t("الخصم", "Discount")} ({appliedPromo?.code})
                </span>
                <span>− {formatPrice(promoDiscount, currency, lang)}</span>
              </div>
            )}
          </div>
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <Label htmlFor="promo-code">{t("هل لديك رمز خصم؟", "Have a promo code?")}</Label>
            <div className="flex gap-2">
              <Input
                id="promo-code"
                name="promo-code"
                autoComplete="off"
                className="h-11 uppercase"
                value={promoInput}
                onChange={(e) => {
                  const value = e.target.value.toUpperCase();
                  setPromoInput(value);
                  if (appliedPromo && value !== appliedPromo.code) setAppliedPromo(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyPromo();
                  }
                }}
                placeholder="EID20"
              />
              <Button type="button" variant="outline" onClick={applyPromo} disabled={checkingPromo}>
                {checkingPromo && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t("تطبيق", "Apply")}
              </Button>
            </div>
          </div>
          <div className="border-t pt-3 flex justify-between font-semibold text-lg">
            <span>{t("الإجمالي", "Total")}</span>
            <span style={{ color: settings.primary_color }}>
              {formatPrice(grandTotal, currency, lang)}
            </span>
          </div>
          <Button
            className="w-full h-12"
            style={{
              backgroundColor: settings.btn_checkout_bg ?? settings.primary_color,
              color: settings.btn_checkout_fg ?? "#fff",
            }}
            disabled={
              submitting ||
              availableMethods.length === 0 ||
              fulfillmentOptions.length === 0 ||
              (method === "benefit" && !benefitReceipt)
            }
            onClick={submit}
          >
            {submitting && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {t("تأكيد الطلب", "Place order")}
          </Button>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 shadow-[0_-6px_20px_-12px_rgba(0,0,0,0.35)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">{t("الإجمالي", "Total")}</div>
            <div
              className="truncate text-lg font-semibold"
              style={{ color: settings.primary_color }}
            >
              {formatPrice(grandTotal, currency, lang)}
            </div>
          </div>
          <Button
            className="h-12 min-w-36 shrink-0"
            style={{
              backgroundColor: settings.btn_checkout_bg ?? settings.primary_color,
              color: settings.btn_checkout_fg ?? "#fff",
            }}
            disabled={
              submitting ||
              availableMethods.length === 0 ||
              fulfillmentOptions.length === 0 ||
              (method === "benefit" && !benefitReceipt)
            }
            onClick={submit}
          >
            {submitting && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {t("تأكيد الطلب", "Place order")}
          </Button>
        </div>
      </div>

      <Dialog
        open={showAccountPopup.show}
        onOpenChange={(open) => {
          if (!open) {
            setShowAccountPopup({ show: false, field: null, value: "" });
            setIgnoredAccountWarning(true);
          }
        }}
      >
        <DialogContent className="max-w-md p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="text-xl font-display text-start">
              {t("لديك حساب بالفعل!", "You have an account already!")}
            </DialogTitle>
            <DialogDescription className="text-sm mt-3 text-start leading-relaxed text-muted-foreground">
              {showAccountPopup.field === "email"
                ? t(
                    `تم العثور على حساب مسجل بالبريد الإلكتروني (${showAccountPopup.value}). هل ترغب في تسجيل الدخول لتتبع طلباتك وتسهيل ملء بياناتك، أم تفضل المتابعة كزائر؟`,
                    `A registered account already exists for this email (${showAccountPopup.value}). Would you like to sign in to track your orders, or continue placing this order as a guest?`,
                  )
                : t(
                    `تم العثور على حساب مسجل برقم الهاتف (${showAccountPopup.value}). هل ترغب في تسجيل الدخول لتتبع طلباتك وتسهيل ملء بياناتك، أم تفضل المتابعة كزائر؟`,
                    `A registered account already exists for this phone number (${showAccountPopup.value}). Would you like to sign in to track your orders, or continue placing this order as a guest?`,
                  )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-5 flex flex-col sm:flex-row gap-2 justify-end">
            <Button
              variant="outline"
              className="w-full sm:w-auto h-11"
              onClick={() => {
                setShowAccountPopup({ show: false, field: null, value: "" });
                setIgnoredAccountWarning(true);
              }}
            >
              {t("المتابعة كزائر", "Continue as guest")}
            </Button>
            <Button
              className="w-full sm:w-auto h-11"
              style={{ backgroundColor: settings.primary_color, color: "#fff" }}
              asChild
            >
              <Link
                to="/$slug/auth"
                params={{ slug: brand.slug }}
                search={{ redirect: mounted ? window.location.pathname : "" }}
              >
                {t("تسجيل الدخول", "Sign in")}
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
