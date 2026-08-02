import { createFileRoute, Link, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  LogOut,
  Plus,
  Trash2,
  PackageSearch,
  MapPin,
  User as UserIcon,
  Award,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  FileText,
  Sparkles,
} from "lucide-react";
import { BAHRAIN_REGIONS, regionLabel } from "@/lib/bahrain-regions";
import { DeliveryAddressCard } from "@/components/delivery-address-card";
import { PhoneInput } from "@/components/phone-input";

export const Route = createFileRoute("/$slug/account")({
  component: AccountPage,
});

type Customer = {
  id: string;
  brand_id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at?: string;
};

type OrderRow = {
  id: string;
  invoice_number: number;
  order_date: string;
  status: string;
  payment_status: string | null;
  fulfillment_status: string | null;
  total: number;
  currency: string;
  order_items: Array<{ id: string; description: string; quantity: number; unit_price: number }>;
};

type Address = {
  id: string;
  brand_id: string;
  customer_id: string;
  label: string | null;
  region: string | null;
  block: string | null;
  road: string | null;
  house: string | null;
  flat: string | null;
  floor: string | null;
  landmark: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  delivery_notes: string | null;
  is_default: boolean;
};

function statusMeta(
  status: string,
  paymentStatus: string | null,
  fulfillmentStatus: string | null,
  isAr: boolean,
) {
  const s = status.toLowerCase();
  const pay = String(paymentStatus || "unpaid").toLowerCase();
  const ful = String(fulfillmentStatus || "ON_HOLD").toUpperCase();

  // If order is cancelled, return Cancelled directly
  if (s === "cancelled") {
    return {
      label: isAr ? "ملغى" : "Cancelled",
      tone: "bg-red-50 text-red-800 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200/50",
    };
  }

  // Decoupled status mappings:
  if (ful === "READY_FOR_PICKUP") {
    return {
      label: isAr ? "جاهز للاستلام" : "Ready for Pickup",
      tone: "bg-indigo-50 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-200/50",
    };
  }
  if (ful === "SHIPPED") {
    return {
      label: isAr ? "خرج للتوصيل" : "Out for Delivery",
      tone: "bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-400 border border-sky-200/50",
    };
  }
  if (ful === "COMPLETED" || s === "completed") {
    return {
      label: isAr ? "مكتمل" : "Completed",
      tone: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50",
    };
  }
  if (pay === "paid" && ful === "NEEDS_PACKING") {
    return {
      label: isAr ? "جاري تجهيز الطلب" : "Preparing Order",
      tone: "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200/50",
    };
  }
  if (pay === "unpaid" && (ful === "ON_HOLD" || ful === "NEEDS_PACKING")) {
    return {
      label: isAr ? "جاري معالجة الدفع" : "Processing Payment",
      tone: "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/50",
    };
  }

  // Fallback map
  const map: Record<string, { ar: string; en: string; tone: string }> = {
    pending: {
      ar: "جاري معالجة الدفع",
      en: "Processing Payment",
      tone: "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/50",
    },
    confirmed: {
      ar: "مؤكد",
      en: "Confirmed",
      tone: "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200/50",
    },
    paid: {
      ar: "مدفوع",
      en: "Paid",
      tone: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50",
    },
    shipped: {
      ar: "خرج للتوصيل",
      en: "Out for Delivery",
      tone: "bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-400 border border-sky-200/50",
    },
    completed: {
      ar: "مكتمل",
      en: "Completed",
      tone: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50",
    },
    cancelled: {
      ar: "ملغى",
      en: "Cancelled",
      tone: "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400 border border-red-200/50",
    },
    refunded: {
      ar: "مرتجع",
      en: "Refunded",
      tone: "bg-neutral-100 text-neutral-800 dark:bg-neutral-850 dark:text-neutral-300 border border-neutral-200/50",
    },
  };
  const m = map[s] ?? { ar: status, en: status, tone: "bg-neutral-100 text-neutral-800 border" };
  return { label: isAr ? m.ar : m.en, tone: m.tone };
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function OrderTimelineTracker({
  status,
  paymentStatus,
  fulfillmentStatus,
  isAr,
  t,
}: {
  status: string;
  paymentStatus: string | null;
  fulfillmentStatus: string | null;
  isAr: boolean;
  t: any;
}) {
  const currentStatus = status.toLowerCase();
  const pay = String(paymentStatus || "unpaid").toLowerCase();
  const ful = String(fulfillmentStatus || "ON_HOLD").toUpperCase();

  const steps = [
    { key: "pending", labelAr: "تم الاستلام", labelEn: "Placed" },
    { key: "confirmed", labelAr: "تأكيد الطلب", labelEn: "Confirmed" },
    { key: "shipped", labelAr: "قيد الشحن", labelEn: "Shipped" },
    { key: "completed", labelAr: "تم التوصيل", labelEn: "Delivered" },
  ];

  let activeIndex = 0;
  if (currentStatus === "cancelled" || currentStatus === "refunded") {
    activeIndex = -1;
  } else if (ful === "COMPLETED" || currentStatus === "completed") {
    activeIndex = 3;
  } else if (ful === "SHIPPED") {
    activeIndex = 2;
  } else if (
    ful === "NEEDS_PACKING" ||
    ful === "READY_FOR_PICKUP" ||
    currentStatus === "confirmed" ||
    pay === "paid"
  ) {
    activeIndex = 1;
  }

  if (activeIndex === -1) {
    return (
      <div className="mt-4 flex items-center justify-center p-3 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 text-xs font-medium gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
        <span>
          {currentStatus === "cancelled"
            ? t("تم إلغاء هذا الطلب", "This order was cancelled")
            : t("تم استرجاع مبلغ هذا الطلب", "This order was refunded")}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-5 pt-5 border-t border-border/50">
      <div className="relative flex justify-between w-full">
        {/* Connection bar */}
        <div className="absolute top-[14px] left-[5%] right-[5%] h-[2px] bg-muted dark:bg-zinc-800 -z-0">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{
              width: `${(activeIndex / (steps.length - 1)) * 100}%`,
              right: isAr ? 0 : "auto",
              left: isAr ? "auto" : 0,
            }}
          />
        </div>

        {/* Dynamic steps indicator */}
        {steps.map((step, idx) => {
          const isCompleted = idx <= activeIndex;
          const isActive = idx === activeIndex;
          return (
            <div key={step.key} className="flex flex-col items-center flex-1 relative z-10">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                  isCompleted
                    ? "bg-primary text-primary-foreground border-primary shadow-xs scale-105"
                    : "bg-background text-muted-foreground border-muted dark:border-zinc-800"
                }`}
              >
                {isCompleted ? "✓" : idx + 1}
              </div>
              <span
                className={`text-[10px] sm:text-xs mt-2 font-semibold transition-colors ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {isAr ? step.labelAr : step.labelEn}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccountPage() {
  const { brand, settings, session, isStoreMember, membershipLoading, t, lang, currency } =
    useStorefront();
  const isAr = lang === "ar";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: customer, isLoading: loadingCustomer } = useCustomer();

  const { data: orders, isLoading: loadingOrders } = useQuery({
    queryKey: ["storefront-account-orders", customer?.id],
    enabled: !!customer?.id,
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, invoice_number, order_date, status, total, currency, order_items(id, description, quantity, unit_price)",
        )
        .eq("customer_id", customer!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
  });

  const { data: addresses, isLoading: loadingAddresses } = useQuery({
    queryKey: ["storefront-account-addresses", customer?.id],
    enabled: !!customer?.id,
    queryFn: async (): Promise<Address[]> => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select(
          "id, brand_id, customer_id, label, region, block, road, house, flat, floor, landmark, formatted_address, latitude, longitude, place_id, delivery_notes, is_default",
        )
        .eq("customer_id", customer!.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Address[];
    },
  });

  const totalSpent = useMemo(() => {
    return (orders ?? []).reduce((sum, o) => sum + Number(o.total || 0), 0);
  }, [orders]);

  // Determine elegant customer loyalty rewards tiers based on BHD spend
  const loyaltyTier = useMemo(() => {
    if (totalSpent >= 350) {
      return {
        label: t("عضوية VIP الذهبية", "Gold VIP Member"),
        style:
          "bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/20 dark:text-amber-400",
      };
    }
    if (totalSpent >= 150) {
      return {
        label: t("عضوية VIP الفضية", "Silver VIP Member"),
        style:
          "bg-slate-50 text-slate-700 border-slate-200/60 dark:bg-slate-900/20 dark:text-slate-300",
      };
    }
    return {
      label: t("العضوية النخبوية", "Elite Member"),
      style:
        "bg-primary/5 text-primary border-primary/20 dark:bg-primary/10 dark:text-primary-foreground",
    };
  }, [totalSpent, t]);

  if (membershipLoading) {
    return (
      <div className="grid min-h-[45vh] place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!session || !isStoreMember) {
    return (
      <Navigate
        to="/$slug/auth"
        params={{ slug: brand.slug }}
        search={{ redirect: mounted ? window.location.pathname : "" }}
      />
    );
  }

  return (
    <section
      dir={isAr ? "rtl" : "ltr"}
      className={`mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 ${isAr ? "text-right" : "text-left"}`}
    >
      {/* Editorial Header */}
      <div className="border-b pb-6 mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-primary/80 block mb-1">
            {t("بوابة العميل", "Customer Portal")}
          </span>
          <h1 className="font-display text-3xl sm:text-4xl" style={{ color: "var(--sf-heading)" }}>
            {t("حسابي الخاص", "My Account")}
          </h1>
        </div>
        <p className="text-xs text-muted-foreground md:max-w-xs leading-relaxed">
          {t(
            "مرحباً بك في مساحتك الخاصة لإدارة طلباتك وتفضيلات الشحن الشخصية بشكل آمن.",
            "Manage your orders, active deliveries, and billing profiles in one dedicated workspace.",
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-8 items-start">
        {/* Luxury Profiler Side Panel */}
        <Card className="p-6 text-center space-y-6 bg-card/60 backdrop-blur-md border border-border/70 rounded-2xl shadow-xs relative overflow-hidden">
          <div className="space-y-4">
            {/* Elegant Monogram Monocle */}
            <div className="w-20 h-20 rounded-full mx-auto bg-primary/10 text-primary flex items-center justify-center font-display text-2xl font-bold border border-primary/20 shadow-inner relative">
              <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-amber-500 animate-pulse" />
              {getInitials(customer?.name || session.user?.email || "U")}
            </div>

            {/* Profile Identity Text */}
            <div className="space-y-1">
              <h2
                className="font-display text-xl truncate px-2"
                style={{ color: "var(--sf-heading)" }}
              >
                {customer?.name || t("ضيف", "Guest")}
              </h2>
              <p className="text-xs text-muted-foreground truncate px-2">{session.user?.email}</p>
            </div>

            {/* Brand Loyalty Badge */}
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${loyaltyTier.style}`}
            >
              <Award className="w-3.5 h-3.5" />
              {loyaltyTier.label}
            </div>
          </div>

          <hr className="border-border/50" />

          {/* Core metrics panel */}
          <div className="grid grid-cols-3 gap-1 divide-x divide-border/40 rtl:divide-x-reverse text-center">
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                {t("المشتريات", "Spent")}
              </p>
              <p
                className="text-xs font-bold mt-1 text-foreground"
                style={{ color: "var(--sf-heading)" }}
              >
                {formatPrice(totalSpent, currency, lang)}
              </p>
            </div>
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                {t("الطلبات", "Orders")}
              </p>
              <p
                className="text-xs font-bold mt-1 text-foreground"
                style={{ color: "var(--sf-heading)" }}
              >
                {orders?.length ?? 0}
              </p>
            </div>
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                {t("العناوين", "Addresses")}
              </p>
              <p
                className="text-xs font-bold mt-1 text-foreground"
                style={{ color: "var(--sf-heading)" }}
              >
                {addresses?.length ?? 0}
              </p>
            </div>
          </div>

          <hr className="border-border/50" />

          {/* Quick Sign Out control */}
          <div className="pt-1">
            <SignOutButton />
          </div>
        </Card>

        {/* Portal Active Sections */}
        <div className="space-y-6">
          <Tabs
            defaultValue="orders"
            className="w-full rounded-2xl border bg-card/40 backdrop-blur-md p-4 shadow-xs sm:p-6 border-border/70"
          >
            <TabsList className="grid w-full grid-cols-3 h-auto rounded-xl p-1 bg-muted/40 border border-border/40 mb-6">
              <TabsTrigger
                value="orders"
                className="gap-2 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition-all"
              >
                <PackageSearch className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline font-semibold text-xs">
                  {t("طلباتي", "My orders")}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="profile"
                className="gap-2 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition-all"
              >
                <UserIcon className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline font-semibold text-xs">
                  {t("البيانات الشخصية", "Profile")}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="addresses"
                className="gap-2 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition-all"
              >
                <MapPin className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline font-semibold text-xs">
                  {t("عناوين الشحن", "Addresses")}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="orders" className="mt-0 focus-visible:outline-none">
              <OrdersSection
                currency={currency}
                isAr={isAr}
                lang={lang}
                orders={orders}
                isLoading={loadingOrders}
              />
            </TabsContent>

            <TabsContent value="profile" className="mt-0 focus-visible:outline-none">
              <ProfileSection isAr={isAr} customer={customer} loadingCustomer={loadingCustomer} />
            </TabsContent>

            <TabsContent value="addresses" className="mt-0 focus-visible:outline-none">
              <AddressesSection
                isAr={isAr}
                lang={lang}
                addresses={addresses}
                isLoading={loadingAddresses}
                customer={customer}
                loadingCustomer={loadingCustomer}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </section>
  );
}

function SignOutButton() {
  const { signOut, brand, t } = useStorefront();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full text-xs font-semibold gap-1.5 transition-all duration-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20 dark:hover:text-rose-400"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
        navigate({ to: "/$slug", params: { slug: brand.slug }, replace: true });
      }}
    >
      <LogOut className="h-3.5 w-3.5 mr-1" />
      {t("تسجيل خروج", "Sign out")}
    </Button>
  );
}

/* ---------- Orders Section Overhaul ---------- */

function useCustomer() {
  const { brand, session } = useStorefront();
  return useQuery({
    queryKey: ["storefront-account-customer", brand.id, session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async (): Promise<Customer | null> => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, brand_id, user_id, name, phone, email, created_at")
        .eq("brand_id", brand.id)
        .eq("auth_user_id", session!.user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Customer | null;
    },
  });
}

function OrdersSection({
  currency,
  isAr,
  lang,
  orders,
  isLoading,
}: {
  currency: string;
  isAr: boolean;
  lang: "ar" | "en";
  orders?: OrderRow[];
  isLoading: boolean;
}) {
  const { t, settings } = useStorefront();
  const [expandedOrder, setExpandedOrder] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedOrder((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const contactSupport = (order: OrderRow) => {
    if (!settings.whatsapp_number) return;
    const digits = settings.whatsapp_number.replace(/\D/g, "");
    const totalText = formatPrice(Number(order.total), order.currency || currency, lang);
    const dateText = new Date(order.order_date).toLocaleDateString(
      isAr ? "ar-BH-u-nu-latn" : "en-BH",
    );

    const text = isAr
      ? `مرحباً! لدي استفسار بخصوص الطلب رقم #${order.invoice_number} (القيمة إجمالاً: ${totalText}، تاريخ الطلب: ${dateText}). هل يمكنكم مساعدتي؟`
      : `Hello! I have an inquiry regarding my Order #${order.invoice_number} (Total value: ${totalText}, Date: ${dateText}). Could you please assist me?`;
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const copyInvoiceLink = async (id: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/invoice/${id}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success(t("تم نسخ رابط الفاتورة", "Invoice link copied to clipboard"));
    } catch {
      toast.error(t("عذراً، فشل نسخ الرابط", "Failed to copy invoice link"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground bg-card/20 border border-dashed rounded-2xl">
        <PackageSearch className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
        <p className="font-semibold text-sm text-foreground">
          {t("لا توجد أي طلبات نشطة", "No orders placed yet")}
        </p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
          {t(
            "لم تسجل أي مشتريات من هذا المتجر بعد. بمجرد إتمامك للشراء ستظهر طلباتك بالتفصيل هنا.",
            "All purchases you make on this store will appear detailed in this panel.",
          )}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((o) => {
        const st = statusMeta(o.status, o.payment_status, o.fulfillment_status, isAr);
        const isExpanded = !!expandedOrder[o.id];
        const date = new Date(o.order_date).toLocaleDateString(isAr ? "ar-BH-u-nu-latn" : "en-BH", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

        return (
          <Card
            key={o.id}
            className="p-5 border border-border/70 hover:border-primary/20 shadow-xs hover:shadow-md transition-all duration-300 rounded-xl bg-card"
          >
            {/* Header info bar */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base" style={{ color: "var(--sf-heading)" }}>
                    {t("طلب رقم", "Order")} #{o.invoice_number}
                  </span>
                  <Badge
                    className={`${st.tone} text-[10px] font-bold border-0 px-2.5 py-0.5 rounded-full`}
                  >
                    {st.label}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">{date}</div>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                  {t("الإجمالي", "Total Value")}
                </p>
                <p className="text-lg font-bold mt-0.5" style={{ color: "var(--sf-heading)" }}>
                  {formatPrice(Number(o.total), o.currency || currency, lang)}
                </p>
              </div>
            </div>

            {/* Stepper tracking progress timeline */}
            <OrderTimelineTracker
              status={o.status}
              paymentStatus={o.payment_status}
              fulfillmentStatus={o.fulfillment_status}
              isAr={isAr}
              t={t}
            />

            {/* Expander list control */}
            <div className="mt-5 pt-3 border-t border-border/40">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleExpand(o.id)}
                className="w-full text-xs flex items-center justify-between text-muted-foreground hover:text-foreground font-semibold px-2"
              >
                <span>{t("عرض تفاصيل المنتجات والمشتريات", "View ordered items detail")}</span>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>

              {isExpanded && o.order_items && o.order_items.length > 0 && (
                <div className="mt-3 bg-muted/30 dark:bg-zinc-900/30 rounded-lg p-3.5 space-y-2 border border-border/30">
                  <ul className="space-y-2 text-xs">
                    {o.order_items.map((it) => (
                      <li
                        key={it.id}
                        className="flex justify-between items-center gap-3 border-b border-dashed border-border/50 pb-2 last:border-0 last:pb-0"
                      >
                        <span className="font-medium text-foreground">
                          {it.description}{" "}
                          <span className="text-primary text-[10px] bg-primary/10 px-1.5 py-0.5 rounded ml-1">
                            × {it.quantity}
                          </span>
                        </span>
                        <span className="font-semibold text-muted-foreground shrink-0">
                          {formatPrice(
                            Number(it.unit_price) * it.quantity,
                            o.currency || currency,
                            lang,
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Actions Bar Footer */}
            <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap gap-2 items-center justify-between">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 px-3 font-semibold gap-1"
                  onClick={() => copyInvoiceLink(o.id)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t("رابط الفاتورة", "Invoice Link")}
                </Button>
              </div>

              {settings.whatsapp_enabled && settings.whatsapp_number && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 px-3 font-bold gap-1 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 border-emerald-200 hover:border-emerald-300 transition-all"
                  onClick={() => contactSupport(o)}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {t("مساعدة VIP بالواتساب", "VIP WhatsApp Help")}
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------- Profile Section Overhaul ---------- */

function ProfileSection({
  isAr,
  customer,
  loadingCustomer,
}: {
  isAr: boolean;
  customer: Customer | null | undefined;
  loadingCustomer: boolean;
}) {
  const { session, t } = useStorefront();
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name ?? "",
        phone: customer.phone ?? "",
        email: customer.email ?? session?.user?.email ?? "",
      });
    } else if (session) {
      setForm((f) => ({ ...f, email: session.user?.email ?? "" }));
    }
  }, [customer, session]);

  if (loadingCustomer) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const save = async () => {
    if (!customer) {
      toast.error(
        t(
          "لا يوجد ملف عميل مرتبط بعد. أنشئ أول طلب لإنشائه.",
          "No customer profile linked yet. Place your first order to create one.",
        ),
      );
      return;
    }
    const name = form.name.trim();
    if (!name) return toast.error(t("الاسم مطلوب", "Name is required"));
    setSaving(true);
    const { error } = await supabase
      .from("customers")
      .update({
        name,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      })
      .eq("id", customer.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("تم حفظ التغييرات بنجاح", "Your changes have been saved successfully"));
    qc.invalidateQueries({ queryKey: ["storefront-account-customer"] });
  };

  return (
    <Card
      dir={isAr ? "rtl" : "ltr"}
      className={`p-5 sm:p-6 space-y-5 max-w-2xl border border-border/70 rounded-xl bg-card ${isAr ? "text-right" : "text-left"}`}
    >
      <div className="border-b pb-3 mb-2">
        <h3 className="font-semibold text-base" style={{ color: "var(--sf-heading)" }}>
          {t("الملف الشخصي", "Profile details")}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t(
            "يرجى تحديث بياناتك الشخصية للتأكد من وصول الشحنات والإشعارات في الوقت المناسب.",
            "Please keep your profile details updated to ensure smooth communication and deliveries.",
          )}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label
            htmlFor="account-name"
            className={`text-xs font-bold ${isAr ? "block text-right" : "block text-left"}`}
          >
            {t("الاسم الكامل", "Full name")}
          </Label>
          <Input
            id="account-name"
            name="name"
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            dir={isAr ? "rtl" : "ltr"}
            className={`h-11 text-sm ${isAr ? "text-right" : "text-left"}`}
            placeholder={t("اكتب اسمك الكامل", "Your full name")}
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="account-phone"
            className={`text-xs font-bold ${isAr ? "block text-right" : "block text-left"}`}
          >
            {t("رقم الهاتف", "Phone number")}
          </Label>
          <PhoneInput
            id="account-phone"
            name="phone"
            value={form.phone}
            onChange={(phone) => setForm({ ...form, phone })}
            placeholder="12345678"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="account-email"
            className={`text-xs font-bold ${isAr ? "block text-right" : "block text-left"}`}
          >
            {t("البريد الإلكتروني", "Email")}
          </Label>
          <Input
            id="account-email"
            name="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            type="email"
            dir="ltr"
            className="text-left h-11 text-sm"
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div className="pt-2 flex justify-start">
        <Button
          onClick={save}
          disabled={saving}
          className="h-11 text-xs font-semibold px-5 shadow-xs"
        >
          {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          {t("حفظ التغييرات", "Save changes")}
        </Button>
      </div>
    </Card>
  );
}

/* ---------- Addresses Section Overhaul ---------- */

const emptyAddress = () => ({
  label: "Home",
  region: "" as string,
  block: "",
  road: "",
  house: "",
  flat: "",
  floor: "",
  landmark: "",
  delivery_notes: "",
  is_default: false,
});

function AddressesSection({
  isAr,
  lang,
  addresses,
  isLoading,
  customer,
  loadingCustomer,
}: {
  isAr: boolean;
  lang: "ar" | "en";
  addresses?: Address[];
  isLoading: boolean;
  customer: Customer | null | undefined;
  loadingCustomer: boolean;
}) {
  const { t } = useStorefront();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyAddress());
  const [saving, setSaving] = useState(false);

  if (loadingCustomer || isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!customer) {
    return (
      <Card className="p-8 text-center text-muted-foreground bg-card/20 border border-dashed rounded-xl">
        {t(
          "لا يوجد ملف عميل بعد. أكمل أول طلب لتفعيل حفظ العناوين.",
          "No customer profile yet. Place your first order to enable saved addresses.",
        )}
      </Card>
    );
  }

  const addAddress = async () => {
    if (!form.region.trim()) {
      return toast.error(t("المنطقة مطلوبة", "Region is required"));
    }
    setSaving(true);
    if (form.is_default) {
      await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", customer.id);
    }
    const { error } = await supabase.from("customer_addresses").insert({
      customer_id: customer.id,
      brand_id: customer.brand_id,
      user_id: customer.user_id,
      label: form.label.trim() || null,
      region: form.region.trim() || null,
      block: form.block.trim() || null,
      road: form.road.trim() || null,
      house: form.house.trim() || null,
      flat: form.flat.trim() || null,
      floor: form.floor.trim() || null,
      landmark: form.landmark.trim() || null,
      delivery_notes: form.delivery_notes.trim() || null,
      is_default: form.is_default,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("تم إضافة العنوان بنجاح", "Address added successfully"));
    setForm(emptyAddress());
    setAdding(false);
    qc.invalidateQueries({ queryKey: ["storefront-account-addresses", customer.id] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("customer_addresses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("تم حذف العنوان بنجاح", "Address deleted successfully"));
    qc.invalidateQueries({ queryKey: ["storefront-account-addresses", customer.id] });
  };

  const setDefault = async (id: string) => {
    await supabase
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("customer_id", customer.id);
    const { error } = await supabase
      .from("customer_addresses")
      .update({ is_default: true })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("تم التحديد كعنوان افتراضي", "Set as default shipping destination"));
    qc.invalidateQueries({ queryKey: ["storefront-account-addresses", customer.id] });
  };

  return (
    <div className="space-y-4">
      {(!addresses || addresses.length === 0) && !adding && (
        <Card className="p-10 text-center text-muted-foreground bg-card/20 border border-dashed rounded-xl">
          <MapPin className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
          <p className="font-semibold text-sm text-foreground">
            {t("لا توجد أي عناوين شحن محفوظة", "No saved addresses")}
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            {t(
              "لم تحفظ أي عناوين توصيل حتى الآن. أضف عنوانك لتسريع عملية الشراء القادمة.",
              "Add your delivery addresses to streamline your next checkout experience.",
            )}
          </p>
        </Card>
      )}

      {!adding && addresses && addresses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((a) => (
            <Card
              key={a.id}
              className={`p-5 flex flex-col justify-between gap-4 border shadow-xs rounded-xl bg-card transition-all duration-300 ${a.is_default ? "border-primary/40 ring-1 ring-primary/10 bg-primary/[0.01]" : "border-border/70 hover:border-primary/20"}`}
            >
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-semibold text-sm" style={{ color: "var(--sf-heading)" }}>
                    {a.label || t("عنوان توصيل", "Shipping destination")}
                  </span>
                  {a.is_default && (
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/15 border-0 font-bold text-[10px] px-2.5 py-0.5 rounded-full">
                      {t("عنوان افتراضي", "Default")}
                    </Badge>
                  )}
                </div>
                <DeliveryAddressCard address={a} lang={lang} compact showLabel={false} />
              </div>
              <div className="flex gap-2 justify-end pt-3 border-t border-border/40">
                {!a.is_default && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] font-semibold"
                    onClick={() => setDefault(a.id)}
                  >
                    {t("تعيين افتراضي", "Set default")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  onClick={() => remove(a.id)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {adding ? (
        <Card className="p-5 sm:p-6 space-y-4 border border-border/80 rounded-xl bg-card">
          <div className="border-b pb-3 mb-2">
            <h3 className="font-semibold text-base" style={{ color: "var(--sf-heading)" }}>
              {t("إضافة عنوان شحن جديد", "New delivery destination")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "يرجى إدخال تفاصيل العنوان بدقة لضمان دقة وسرعة التوصيل من خلال المندوب.",
                "Fill in the fields accurately to facilitate quick and accurate delivery mapping.",
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="address-label" className="text-xs font-semibold">
                {t("الاسم (مثال: المنزل، المكتب)", "Label (e.g. Home, Work)")}
              </Label>
              <Input
                id="address-label"
                name="address-label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Home"
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="address-region" className="text-xs font-semibold">
                {t("المنطقة", "Region")}
              </Label>
              <Select
                name="address-region"
                value={form.region}
                onValueChange={(v) => setForm({ ...form, region: v })}
              >
                <SelectTrigger id="address-region" className="h-11 text-xs mt-1.5">
                  <SelectValue placeholder={t("اختر المنطقة", "Choose region")} />
                </SelectTrigger>
                <SelectContent>
                  {BAHRAIN_REGIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {isAr ? r.ar : r.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="address-block" className="text-xs font-semibold">
                {t("المجمع", "Block")}
              </Label>
              <Input
                id="address-block"
                name="address-block"
                value={form.block}
                onChange={(e) => setForm({ ...form, block: e.target.value })}
                inputMode="numeric"
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="address-road" className="text-xs font-semibold">
                {t("الطريق", "Road")}
              </Label>
              <Input
                id="address-road"
                name="address-road"
                value={form.road}
                onChange={(e) => setForm({ ...form, road: e.target.value })}
                inputMode="numeric"
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="address-house" className="text-xs font-semibold">
                {t("رقم المبنى", "Building")}
              </Label>
              <Input
                id="address-house"
                name="address-house"
                value={form.house}
                onChange={(e) => setForm({ ...form, house: e.target.value })}
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="address-flat" className="text-xs font-semibold">
                {t("رقم الشقة (اختياري)", "Flat (optional)")}
              </Label>
              <Input
                id="address-flat"
                name="address-flat"
                value={form.flat}
                onChange={(e) => setForm({ ...form, flat: e.target.value })}
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="address-floor" className="text-xs font-semibold">
                {t("الطابق (اختياري)", "Floor (optional)")}
              </Label>
              <Input
                id="address-floor"
                name="address-floor"
                value={form.floor}
                onChange={(e) => setForm({ ...form, floor: e.target.value })}
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="address-landmark" className="text-xs font-semibold">
                {t("علامة مميزة (اختياري)", "Landmark (optional)")}
              </Label>
              <Input
                id="address-landmark"
                name="address-landmark"
                value={form.landmark}
                onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="address-notes" className="text-xs font-semibold">
                {t("ملاحظات التوصيل (اختياري)", "Delivery notes (optional)")}
              </Label>
              <Input
                id="address-notes"
                name="address-notes"
                value={form.delivery_notes}
                onChange={(e) => setForm({ ...form, delivery_notes: e.target.value })}
                className="h-11 text-xs mt-1.5"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold mt-2 select-none cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-border text-primary focus:ring-primary h-4 w-4"
              checked={form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
            />
            {t("تعيين كعنوان افتراضي للشحن", "Set as default shipping destination")}
          </label>

          <div className="flex gap-2 pt-3 border-t">
            <Button
              onClick={addAddress}
              disabled={saving}
              className="h-11 text-xs font-semibold px-4 shadow-xs"
            >
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("حفظ العنوان", "Save address")}
            </Button>
            <Button
              variant="ghost"
              className="h-11 text-xs font-semibold px-4"
              onClick={() => {
                setAdding(false);
                setForm(emptyAddress());
              }}
            >
              {t("إلغاء", "Cancel")}
            </Button>
          </div>
        </Card>
      ) : (
        <Button
          variant="outline"
          className="text-xs h-11 px-4 font-semibold gap-1"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-4 w-4" />
          {t("إضافة عنوان شحن جديد", "Add new destination")}
        </Button>
      )}

      <div className="text-xs text-muted-foreground pt-4 border-t">
        <Link
          to="/$slug"
          params={{ slug: useStorefront().brand.slug }}
          className="hover:underline transition-all font-semibold flex items-center gap-1"
          style={{ color: "var(--sf-link)" }}
        >
          {isAr ? "← العودة لتصفح المتجر" : "← Back to browse store"}
        </Link>
      </div>
    </div>
  );
}
