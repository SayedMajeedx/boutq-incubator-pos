import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Link as LinkIcon,
  Plus,
  ReceiptText,
  Trash2,
  Search,
  Clock3,
  CircleDollarSign,
  Truck,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Package,
  PackageCheck,
  CheckSquare,
  Square,
  Check,
  CheckCircle2,
  MoreHorizontal,
  ExternalLink,
  Copy,
  Phone,
  MessageCircle,
  MapPin,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { formatDate, formatMoney, formatOrderStatus } from "@/lib/format";
import { toast } from "sonner";
import {
  generateCourierWhatsAppUrl,
  formatNotifiedTimeAgo,
  recordCourierNotified,
} from "@/lib/courier-whatsapp";
import { CourierWhatsAppModal } from "@/components/courier/CourierWhatsAppModal";
import { useT, useI18n } from "@/lib/i18n";
import { resolvePaymentStatus, PAYMENT_BADGE_CLASSES } from "@/lib/payment-status";
import {
  matchesPaymentMethodFilter,
  normalizePaymentMethod,
  type PaymentMethodFilter,
} from "@/lib/payment-method";
import { useBrand } from "@/lib/brand-context";
import { useProfile } from "@/lib/profile-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteOrderWithPrivateReceipt } from "@/lib/benefit-receipt.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getOrderCustomerContact,
  getOrderCustomerName,
  getOrderCustomerPhone,
} from "@/lib/order-customer-snapshot";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { getFulfillmentStage, getOrderWorkflow } from "@/lib/order-workflow";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/orders/")({
  component: OrdersList,
});

async function copyInvoiceLink(id: string, t: (k: string) => string) {
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
    toast.success(t("orders.linkCopied"));
  } catch {
    toast.error(t("orders.linkFailed"));
  }
}

function deliveryStatusPresentation(status: string | null | undefined, lang: "en" | "ar") {
  const normalized = String(status ?? "").toLowerCase();
  const labels: Record<string, { en: string; ar: string; className: string }> = {
    assigned: {
      en: "Assigned",
      ar: "تم التعيين",
      className: "bg-slate-100 text-slate-800 border border-slate-300 font-semibold",
    },
    out_for_delivery: {
      en: "Out for delivery",
      ar: "خرج للتوصيل",
      className: "bg-blue-100 text-blue-900 border border-blue-300 font-semibold",
    },
    delivered: {
      en: "Delivered",
      ar: "تم التوصيل",
      className: "bg-emerald-100 text-emerald-900 border border-emerald-300 font-semibold",
    },
    failed: {
      en: "Delivery failed",
      ar: "فشل التوصيل",
      className: "bg-rose-100 text-rose-900 border border-rose-300 font-semibold",
    },
    delivery_failed: {
      en: "Delivery failed",
      ar: "فشل التوصيل",
      className: "bg-rose-100 text-rose-900 border border-rose-300 font-semibold",
    },
    returned: {
      en: "Returned",
      ar: "مرتجع",
      className: "bg-amber-100 text-amber-900 border border-amber-300 font-semibold",
    },
  };
  const item = labels[normalized];
  return item ? { label: item[lang], className: item.className } : null;
}

const getFulfillmentBadgeDetails = (
  status: string | null | undefined,
  lang: "en" | "ar",
  fulfillmentMethod?: string | null,
) => {
  const s = String(status || "ON_HOLD").toUpperCase();
  if (s === "NEEDS_PACKING") {
    return {
      label: lang === "ar" ? "بحاجة للتعبئة" : "Needs Packing",
      classes: "bg-amber-100 text-amber-900 border border-amber-300/80 font-semibold shadow-xs",
    };
  }
  if (s === "READY_FOR_PICKUP") {
    return {
      label: lang === "ar" ? "جاهز للاستلام" : "Ready for Pickup",
      classes: "bg-indigo-100 text-indigo-900 border border-indigo-300/80 font-semibold shadow-xs",
    };
  }
  if (["SHIPPED", "ASSIGNED", "OUT_FOR_DELIVERY", "READY_FOR_DELIVERY"].includes(s)) {
    return {
      label:
        s === "ASSIGNED"
          ? lang === "ar"
            ? "تم التعيين"
            : "Assigned to Courier"
          : lang === "ar"
            ? "خرج للتوصيل"
            : "Out for Delivery",
      classes: "bg-sky-100 text-sky-900 border border-sky-300/80 font-semibold shadow-xs",
    };
  }
  if (s === "COMPLETED" || s === "DELIVERED") {
    const isPickup = String(fulfillmentMethod ?? "").toLowerCase() === "pickup";
    return {
      label: isPickup
        ? lang === "ar"
          ? "تم الاستلام"
          : "Picked Up"
        : lang === "ar"
          ? "تم التوصيل"
          : "Delivered",
      classes:
        "bg-emerald-100 text-emerald-900 border border-emerald-300/80 font-semibold shadow-xs",
    };
  }
  if (["CANCELLED", "DELIVERY_FAILED", "FAILED", "RETURNED"].includes(s)) {
    return {
      label:
        s === "RETURNED"
          ? lang === "ar"
            ? "مرتجع"
            : "Returned"
          : ["DELIVERY_FAILED", "FAILED"].includes(s)
            ? lang === "ar"
              ? "فشل التوصيل"
              : "Delivery Failed"
            : lang === "ar"
              ? "ملغي"
              : "Cancelled",
      classes: "bg-rose-100 text-rose-900 border border-rose-300/80 font-semibold shadow-xs",
    };
  }
  // ON_HOLD / default
  return {
    label: lang === "ar" ? "قيد الانتظار" : "On Hold",
    classes: "bg-slate-200 text-slate-800 border border-slate-300/80 font-semibold shadow-xs",
  };
};

function normalizedFulfillmentStage(order: any): string {
  return getFulfillmentStage(order);
}

function orderNeedsOperatorAction(order: any): boolean {
  return getOrderWorkflow(order).needsAttention;
}

const renderPaymentMethodBadge = (paymentMethod: string | null | undefined, lang: "en" | "ar") => {
  const method = normalizePaymentMethod(paymentMethod);

  if (method === "card") {
    return (
      <div className="mt-1">
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900 shadow-xs">
          💳 {lang === "ar" ? "بطاقة (أونلاين)" : "Card (Online)"}
        </span>
      </div>
    );
  }
  if (method === "benefit") {
    return (
      <div className="mt-1">
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900 shadow-xs">
          📲 {lang === "ar" ? "بنفت بي (يدوي)" : "BenefitPay (Manual)"}
        </span>
      </div>
    );
  }
  if (method === "cod") {
    return (
      <div className="mt-1">
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900 shadow-xs">
          💵 {lang === "ar" ? "الدفع عند الاستلام" : "Cash on Delivery"}
        </span>
      </div>
    );
  }

  return null;
};

function CustomerContactActions({ customer, lang }: { customer: any; lang: "en" | "ar" }) {
  if (!customer?.phone) return null;
  const rawPhone = String(customer.phone);
  const cleanPhone = rawPhone.replace(/[^0-9+]/g, "");
  const waPhone = cleanPhone.startsWith("+")
    ? cleanPhone.replace("+", "")
    : cleanPhone.length === 8
      ? `973${cleanPhone}`
      : cleanPhone;

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <a
        href={`tel:${cleanPhone}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 transition-colors shadow-xs"
      >
        <Phone className="h-3 w-3 text-blue-600 dark:text-blue-400 shrink-0" />
        {lang === "ar" ? "اتصال" : "Call"}
      </a>
      <a
        href={`https://wa.me/${waPhone}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 transition-colors shadow-xs"
      >
        <MessageCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
        {lang === "ar" ? "واتساب" : "WhatsApp"}
      </a>
    </div>
  );
}

function DeliveryAddressSnapshot({ customer, lang }: { customer: any; lang: "en" | "ar" }) {
  if (!customer) return null;
  const parts = [];
  if (customer.house || customer.building) {
    parts.push(`${lang === "ar" ? "م" : "Bldg/House"} ${customer.house || customer.building}`);
  }
  if (customer.road) {
    parts.push(`${lang === "ar" ? "ط" : "Rd"} ${customer.road}`);
  }
  if (customer.block) {
    parts.push(`${lang === "ar" ? "مجمع" : "Blk"} ${customer.block}`);
  }
  if (customer.region || customer.city) {
    parts.push(customer.region || customer.city);
  }
  if (customer.flat) {
    parts.push(`${lang === "ar" ? "شقة" : "Flat"} ${customer.flat}`);
  }

  const text =
    parts.length > 0 ? parts.join(", ") : customer.address || customer.formatted_address || null;
  if (!text) return null;

  return (
    <div className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-500" />
      <span className="line-clamp-2">{text}</span>
    </div>
  );
}

function OrderItemsSummary({
  items,
  lang,
}: {
  items: any[] | undefined | null;
  lang: "en" | "ar";
}) {
  if (!items || items.length === 0) return null;

  const totalQty = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);
  const descriptions = items
    .map((it: any) => {
      const name = it.description || it.products?.title || (lang === "ar" ? "منتج" : "Item");
      const qty = Number(it.quantity) > 1 ? `${it.quantity}x ` : "";
      return `${qty}${name}`;
    })
    .join(", ");

  const truncated = descriptions.length > 35 ? descriptions.slice(0, 35) + "..." : descriptions;

  return (
    <div className="mt-1.5 text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 bg-secondary/50 px-2 py-0.5 rounded-md w-fit max-w-full">
      <Package className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="font-bold text-foreground">
        {totalQty} {lang === "ar" ? "منتج" : totalQty === 1 ? "item" : "items"}
      </span>
      <span className="truncate text-muted-foreground">({truncated})</span>
    </div>
  );
}

function OrdersList() {
  const t = useT();
  const { lang } = useI18n();
  const locale = lang === "ar" ? "ar-BH-u-nu-latn" : "en-BH";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { slug } = Route.useParams();
  const brand = useBrand();
  const { isCourier, isAdmin } = useProfile();
  const brandId = brand.id;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [fulfillmentStatusFilter, setFulfillmentStatusFilter] = useState("all");
  const [fulfillmentMethodFilter, setFulfillmentMethodFilter] = useState("all");
  const [gatewayFilter, setGatewayFilter] = useState<PaymentMethodFilter>("all");
  const [inspectOrder, setInspectOrder] = useState<any | null>(null);
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // New Quick Tab filter
  const [tabFilter, setTabFilter] = useState<
    "all" | "unpaid" | "action_required" | "shipped" | "completed"
  >("all");

  // New Fulfill states
  const [isFulfillModalOpen, setIsFulfillModalOpen] = useState(false);
  const [waModalState, setWaModalState] = useState<{
    isOpen: boolean;
    order: any;
    courier: any;
  }>({
    isOpen: false,
    order: null,
    courier: null,
  });
  const [selectedFulfillOrder, setSelectedFulfillOrder] = useState<any | null>(null);
  const [selectedCourierId, setSelectedCourierId] = useState<string>("unassigned");
  const [fulfillNotes, setFulfillNotes] = useState<string>("");
  const [isFulfilling, setIsFulfilling] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (selectedFulfillOrder) {
      const items = selectedFulfillOrder.order_items ?? [];
      const initial: Record<string, boolean> = {};
      items.forEach((it: any) => {
        initial[it.id] = false;
      });
      setCheckedItems(initial);
      setSelectedCourierId(selectedFulfillOrder.assigned_to || "unassigned");
      setFulfillNotes("");
    }
  }, [selectedFulfillOrder]);

  // Cash Collection Modal State for Couriers
  const [cashModalOrder, setCashModalOrder] = useState<any | null>(null);
  const [cashCollectedInput, setCashCollectedAmount] = useState<string>("");
  const [cashModalNotes, setCashModalNotes] = useState<string>("");
  const [isSubmittingCash, setIsSubmittingCash] = useState<boolean>(false);

  const handleCompleteDelivery = async (order: any, amountToCollect: number, notes?: string) => {
    if (amountToCollect < 0) {
      toast.error(
        lang === "ar"
          ? "لا يمكن أن يكون المبلغ المحصل بالسالب"
          : "Collected amount cannot be negative",
      );
      return;
    }
    const ordersQueryKey = ["orders", brandId, isCourier ? "assigned-courier" : "office"];
    const previousOrders = qc.getQueryData<any[]>(ordersQueryKey);
    setUpdatingOrderId(order.id);
    setIsSubmittingCash(true);
    qc.setQueryData<any[]>(ordersQueryKey, (current) =>
      current?.map((item) =>
        item.id === order.id
          ? {
              ...item,
              status: "completed",
              fulfillment_status: "COMPLETED",
              delivered_at: new Date().toISOString(),
            }
          : item,
      ),
    );
    try {
      // 1. Try atomic RPC first
      const { error: rpcErr } = await (supabase.rpc as any)("courier_complete_delivery", {
        p_order_id: order.id,
        p_collected_amount: amountToCollect,
        p_notes: notes || null,
      });

      if (rpcErr) {
        // 2. Direct table update fallback if RPC function missing or column schema mismatch
        const currentPaid = Number(order.advance_paid ?? order.paid_amount ?? 0);
        const newPaid = currentPaid + amountToCollect;
        const total = Number(order.total || 0);
        const newStatus =
          newPaid >= total
            ? "paid"
            : newPaid > 0
              ? "partially_paid"
              : order.payment_status || "unpaid";

        let updatedNotes = order.delivery_notes || "";
        if (notes && notes.trim()) {
          const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
          updatedNotes = updatedNotes
            ? `${updatedNotes}\n[${timestamp}]: ${notes.trim()}`
            : notes.trim();
        }

        const { error: updateErr } = await supabase
          .from("orders")
          .update({
            advance_paid: newPaid,
            cod_collected_amount: amountToCollect,
            cod_collected_at: new Date().toISOString(),
            payment_status: newStatus,
            fulfillment_status: "COMPLETED",
            status: "completed",
            delivery_notes: updatedNotes || null,
            delivered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", order.id);

        if (updateErr) throw updateErr;
      }

      toast.success(
        lang === "ar"
          ? "تم تسجيل تسليم الطلب وتأكيد التحصيل بنجاح!"
          : "Delivery completed and payment confirmed!",
      );
      setCashModalOrder(null);
      setCashCollectedAmount("");
      setCashModalNotes("");
      qc.invalidateQueries({ queryKey: ["orders", brandId] });
    } catch (err: any) {
      qc.setQueryData(ordersQueryKey, previousOrders);
      toast.error(err.message || "Failed to complete delivery");
    } finally {
      setUpdatingOrderId(null);
      setIsSubmittingCash(false);
    }
  };

  const del = async (id: string) => {
    try {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
      toast.success(lang === "ar" ? "تم حذف الطلب بنجاح" : "Order deleted successfully");
      qc.invalidateQueries({ queryKey: ["orders", brandId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete order");
    } finally {
      setDeleteTarget(null);
    }
  };

  // Fetch Couriers Query
  const couriersQ = useQuery({
    queryKey: ["couriers", brandId],
    enabled: Boolean(brandId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("profiles") as any)
        .select("id, name, email, phone")
        .eq("brand_id", brandId)
        .eq("role", "courier")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const [sortField, setSortField] = useState<
    "invoice_number" | "created_at" | "customer" | "status" | "total"
  >("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Reset page when sorting, search, filters or page size change
  useEffect(() => {
    setPage(1);
  }, [
    search,
    paymentFilter,
    fulfillmentStatusFilter,
    fulfillmentMethodFilter,
    sortField,
    sortDirection,
    pageSize,
  ]);

  useRealtimeInvalidate(
    [
      { table: "orders", brandId, queryKey: ["orders", brandId] },
      { table: "order_items", brandId, queryKey: ["orders", brandId] },
    ],
    `orders-list-${brandId}`,
  );

  const { data } = useQuery({
    queryKey: ["orders", brandId, isCourier ? "assigned-courier" : "office"],
    // Realtime can briefly disconnect on a courier's mobile device. A small
    // interval makes order state changes reliably appear in every workspace.
    refetchInterval: isCourier ? 10_000 : 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let query: any = supabase
        .from("orders")
        .select("*, customers(*), order_items(*)")
        .eq("brand_id", brandId);
      if (isCourier) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];
        query = query.eq("assigned_to", user.id).eq("fulfillment_method", "delivery");
      }
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const create = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: settings } = await supabase
      .from("business_settings")
      .select(
        "currency, default_tax_rate, delivery_enabled, pickup_enabled, digital_delivery_enabled, delivery_fee",
      )
      .eq("brand_id", brandId)
      .maybeSingle();
    const currency = settings?.currency ?? "BHD";
    const taxRate = settings?.default_tax_rate ?? 15;
    const fulfillmentMethod = settings?.delivery_enabled
      ? "delivery"
      : settings?.pickup_enabled
        ? "pickup"
        : (settings as any)?.digital_delivery_enabled
          ? "digital"
          : "delivery";
    const deliveryFee = fulfillmentMethod === "delivery" ? Number(settings?.delivery_fee ?? 0) : 0;
    const { data: order, error } = await (supabase.from("orders") as any)
      .insert({
        // The database trigger allocates the real brand-scoped number atomically.
        user_id: user.id,
        brand_id: brandId,
        invoice_number: 0,
        currency,
        tax_rate: taxRate,
        fulfillment_method: fulfillmentMethod,
        shipping: deliveryFee,
        total: deliveryFee,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    navigate({ to: "/admin/b/$slug/orders/$id", params: { slug, id: order.id } });
  };

  const orders = useMemo(() => data ?? [], [data]);
  const normalizedSearch = search.trim().toLowerCase();

  // Premium Quick Tabs counts in real time
  const tabCounts = useMemo(() => {
    let all = 0;
    let unpaid = 0;
    let action_required = 0;
    let shipped = 0;
    let completed = 0;

    for (const order of orders) {
      if (order.status === "archived_historical" && !includeHistorical) {
        continue;
      }

      const workflow = getOrderWorkflow(order);

      all++;
      if (workflow.awaitingPayment) unpaid++;
      if (workflow.needsAttention) action_required++;
      if (workflow.withCourier) shipped++;
      if (workflow.fulfillment === "completed") completed++;
    }

    return { all, unpaid, action_required, shipped, completed };
  }, [orders, includeHistorical]);

  // Combined search, standard drop-down filters, and our premium quick tab filter
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Hide archived historical orders by default unless includeHistorical is toggled on
      if (order.status === "archived_historical" && !includeHistorical) {
        return false;
      }

      const matchesSearch =
        !normalizedSearch ||
        [
          order.invoice_number,
          getOrderCustomerName(order),
          order.status,
          order.payment_method,
          order.digital_delivery_contact,
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(normalizedSearch),
        );

      if (!matchesSearch) return false;
      const paymentBadge = resolvePaymentStatus(
        order.payment_status,
        order.status,
        Number(order.total),
        Number(order.advance_paid ?? 0),
      );
      const ff = String(order.fulfillment_status || "").toUpperCase();
      const isPendingVerification =
        String(order.status ?? "").toLowerCase() === "pending_verification" &&
        paymentBadge === "unpaid" &&
        !["COMPLETED", "DELIVERED", "CANCELLED"].includes(ff);
      if (
        paymentFilter !== "all" &&
        (paymentFilter === "pending_verification"
          ? !isPendingVerification
          : paymentBadge !== paymentFilter || isPendingVerification)
      ) {
        return false;
      }
      if (
        fulfillmentStatusFilter !== "all" &&
        normalizedFulfillmentStage(order) !== fulfillmentStatusFilter
      ) {
        return false;
      }
      if (
        fulfillmentMethodFilter !== "all" &&
        order.fulfillment_method !== fulfillmentMethodFilter
      ) {
        return false;
      }
      if (!matchesPaymentMethodFilter(order.payment_method, gatewayFilter)) return false;

      // Quick tab routing
      if (tabFilter === "unpaid") {
        return getOrderWorkflow(order).awaitingPayment;
      }
      if (tabFilter === "action_required") {
        return orderNeedsOperatorAction(order);
      }
      if (tabFilter === "shipped") {
        return normalizedFulfillmentStage(order) === "out_for_delivery";
      }
      if (tabFilter === "completed") {
        return normalizedFulfillmentStage(order) === "completed";
      }

      return true; // tabFilter === "all"
    });
  }, [
    orders,
    normalizedSearch,
    paymentFilter,
    fulfillmentStatusFilter,
    fulfillmentMethodFilter,
    gatewayFilter,
    tabFilter,
    includeHistorical,
  ]);

  const sortedOrders = useMemo(() => {
    const list = [...filteredOrders];
    list.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      if (sortField === "invoice_number") {
        valA = a.invoice_number ?? 0;
        valB = b.invoice_number ?? 0;
        return sortDirection === "asc" ? valA - valB : valB - valA;
      } else if (sortField === "created_at") {
        valA = new Date(a.created_at ?? a.order_date).getTime();
        valB = new Date(b.created_at ?? b.order_date).getTime();
        return sortDirection === "asc" ? valA - valB : valB - valA;
      } else if (sortField === "customer") {
        valA = getOrderCustomerName(a);
        valB = getOrderCustomerName(b);
      } else if (sortField === "status") {
        valA = a.status ?? "";
        valB = b.status ?? "";
      } else if (sortField === "total") {
        valA = Number(a.total ?? 0);
        valB = Number(b.total ?? 0);
        return sortDirection === "asc" ? valA - valB : valB - valA;
      }

      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredOrders, sortField, sortDirection]);

  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedOrders.slice(start, start + pageSize);
  }, [sortedOrders, page, pageSize]);

  const totalPages = Math.ceil(sortedOrders.length / pageSize) || 1;

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const renderSortIcon = (field: typeof sortField) => {
    if (sortField !== field)
      return (
        <ArrowUpDown className="ms-1.5 h-3.5 w-3.5 opacity-50 shrink-0 inline text-muted-foreground" />
      );
    return sortDirection === "asc" ? (
      <ArrowUp className="ms-1.5 h-3.5 w-3.5 text-primary shrink-0 inline" />
    ) : (
      <ArrowDown className="ms-1.5 h-3.5 w-3.5 text-primary shrink-0 inline" />
    );
  };

  const tabsList = [
    {
      id: "action_required",
      label_en: "Needs attention",
      label_ar: "مطلوب إجراء",
      count: tabCounts.action_required,
      icon: Clock3,
    },
    {
      id: "unpaid",
      label_en: "Awaiting payment",
      label_ar: "بانتظار الدفع",
      count: tabCounts.unpaid,
      icon: CircleDollarSign,
    },
    {
      id: "shipped",
      label_en: "With courier",
      label_ar: "مع المندوب",
      count: tabCounts.shipped,
      icon: Truck,
    },
    {
      id: "completed",
      label_en: "Completed",
      label_ar: "مكتملة",
      count: tabCounts.completed,
      icon: CheckCircle2,
    },
    {
      id: "all",
      label_en: "All orders",
      label_ar: "كل الطلبات",
      count: tabCounts.all,
      icon: ReceiptText,
    },
  ] as const;

  const activeFilterCount = [
    paymentFilter !== "all",
    fulfillmentStatusFilter !== "all",
    fulfillmentMethodFilter !== "all",
    gatewayFilter !== "all",
    includeHistorical,
    Boolean(search.trim()),
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch("");
    setPaymentFilter("all");
    setFulfillmentStatusFilter("all");
    setFulfillmentMethodFilter("all");
    setGatewayFilter("all");
    setIncludeHistorical(false);
    setTabFilter("all");
    setPage(1);
  };

  const renderContextualButton = (o: any) => {
    const workflow = getOrderWorkflow(o);
    const paymentBadge = resolvePaymentStatus(
      o.payment_status,
      o.status,
      Number(o.total),
      Number(o.advance_paid ?? 0),
    );
    const isPaid = paymentBadge === "paid";
    const isPartiallyPaid = paymentBadge === "partial";
    const isRefunded = paymentBadge === "refunded";
    const ff = String(o.fulfillment_status || "ON_HOLD").toUpperCase();
    const orderStatus = String(o.status || "").toUpperCase();
    const isUpdating = updatingOrderId === o.id;
    const isDelivered =
      ["COMPLETED", "DELIVERED"].includes(ff) || ["COMPLETED", "DELIVERED"].includes(orderStatus);
    const isCancelled = ff === "CANCELLED" || orderStatus === "CANCELLED";
    const isOutForDelivery = [
      "SHIPPED",
      "ASSIGNED",
      "OUT_FOR_DELIVERY",
      "READY_FOR_DELIVERY",
    ].includes(ff);

    const method = String(o.payment_method || "").toLowerCase();
    const isBenefit = ["benefit", "benefitpay", "benefit_pay", "bank_transfer"].includes(method);
    const isCod = ["cash", "cod"].includes(method);

    const isPickup = String(o.fulfillment_method || "").toLowerCase() === "pickup";
    const isDigital = String(o.fulfillment_method || "").toLowerCase() === "digital";

    if (isDelivered) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          {isPickup
            ? lang === "ar"
              ? "تم الاستلام"
              : "Picked Up"
            : lang === "ar"
              ? "تم التوصيل"
              : "Delivered"}
        </span>
      );
    }

    if (isCancelled || isRefunded) {
      return (
        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
          {isRefunded
            ? lang === "ar"
              ? "تم الاسترجاع"
              : "Refunded"
            : lang === "ar"
              ? "ملغي"
              : "Cancelled"}
        </span>
      );
    }

    const handleStatusUpdate = async (payload: Record<string, any>, successMsg: string) => {
      setUpdatingOrderId(o.id);
      try {
        const res = await fetch("/api/orders/status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: o.id, admin_override: true, ...payload }),
        });
        const data = await res.json<{ error?: string; error_ar?: string }>();
        if (!res.ok) throw new Error(data.error_ar && lang === "ar" ? data.error_ar : data.error);
        toast.success(successMsg);
        qc.invalidateQueries({ queryKey: ["orders", brandId] });
      } catch (err: any) {
        toast.error(err.message || "Failed to update order status");
      } finally {
        setUpdatingOrderId(null);
      }
    };

    if (
      workflow.nextAction === "resolve_delivery_failure" ||
      workflow.nextAction === "review_order"
    ) {
      return (
        <Button size="sm" variant="destructive" className="h-8 px-3 text-xs font-semibold" asChild>
          <Link
            to="/admin/b/$slug/orders/$id"
            params={{ slug, id: o.id }}
            onClick={(e) => e.stopPropagation()}
          >
            {lang === "ar" ? "مراجعة الطلب" : "Resolve issue"}
          </Link>
        </Button>
      );
    }

    if (isPickup) {
      // B. STORE PICKUP WORKFLOW

      // 1. BenefitPay Manual Validation (Pickup)
      if (workflow.nextAction === "validate_payment") {
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs px-3 border-violet-300 text-violet-800 bg-violet-50 hover:bg-violet-100 dark:border-violet-800 dark:text-violet-200 dark:bg-violet-950/20 font-semibold"
            disabled={updatingOrderId !== null}
            onClick={(e) => {
              e.stopPropagation();
              handleStatusUpdate(
                { payment_status: "paid", fulfillment_status: "READY_FOR_PICKUP" },
                lang === "ar"
                  ? "تم تأكيد الدفع وتجهيز الطلب للاستلام!"
                  : "Payment validated and pickup prepared!",
              );
            }}
          >
            {isUpdating ? (
              <Loader2 className="animate-spin h-3.5 w-3.5" />
            ) : lang === "ar" ? (
              "تأكيد وتجهيز"
            ) : (
              "Validate & Prepare"
            )}
          </Button>
        );
      }

      // 2. Card Pickup Preparation
      if (workflow.nextAction === "prepare_pickup" && isPaid) {
        return (
          <Button
            size="sm"
            className="h-8 text-xs px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold dark:bg-indigo-800 dark:hover:bg-indigo-900"
            disabled={updatingOrderId !== null}
            onClick={(e) => {
              e.stopPropagation();
              handleStatusUpdate(
                { fulfillment_status: "READY_FOR_PICKUP" },
                lang === "ar" ? "تم تحديد الطلب كجاهز للاستلام!" : "Order marked ready for pickup!",
              );
            }}
          >
            {isUpdating ? (
              <Loader2 className="animate-spin h-3.5 w-3.5" />
            ) : lang === "ar" ? (
              "جاهز للاستلام"
            ) : (
              "Mark Ready"
            )}
          </Button>
        );
      }

      // 3. Pay at Store Preparation
      if (workflow.nextAction === "prepare_pickup" && isCod) {
        return (
          <Button
            size="sm"
            className="h-8 text-xs px-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold dark:bg-amber-800 dark:hover:bg-amber-900"
            disabled={updatingOrderId !== null}
            onClick={(e) => {
              e.stopPropagation();
              handleStatusUpdate(
                { fulfillment_status: "READY_FOR_PICKUP" },
                lang === "ar" ? "تم تجهيز الطلب للاستلام!" : "Order prepared!",
              );
            }}
          >
            {isUpdating ? (
              <Loader2 className="animate-spin h-3.5 w-3.5" />
            ) : lang === "ar" ? (
              "تجهيز الطلب"
            ) : (
              "Prepare Order"
            )}
          </Button>
        );
      }

      // 4. Pickup Handover
      if (
        workflow.nextAction === "hand_over_pickup" ||
        workflow.nextAction === "collect_and_hand_over"
      ) {
        if (workflow.nextAction === "collect_and_hand_over") {
          const totalAmt = Number(o.total || 0);
          const paidAmt = Number(o.paid_amount ?? o.advance_paid ?? 0);
          const remainingBal = Math.max(0, totalAmt - paidAmt);
          return (
            <Button
              size="sm"
              className="h-8 bg-amber-500 px-3 text-xs font-semibold text-black hover:bg-amber-600"
              disabled={updatingOrderId !== null || isSubmittingCash}
              onClick={(e) => {
                e.stopPropagation();
                setCashModalOrder(o);
                setCashCollectedAmount(remainingBal.toFixed(3));
                setCashModalNotes("");
              }}
            >
              {isUpdating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : lang === "ar" ? (
                "تحصيل وتسليم"
              ) : (
                "Collect & Hand Over"
              )}
            </Button>
          );
        } else {
          return (
            <Button
              size="sm"
              className="h-8 text-xs px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold dark:bg-emerald-800 dark:hover:bg-emerald-900"
              disabled={updatingOrderId !== null}
              onClick={(e) => {
                e.stopPropagation();
                handleStatusUpdate(
                  { fulfillment_status: "COMPLETED" },
                  lang === "ar" ? "تم تسليم الطلب بالكامل!" : "Handover completed!",
                );
              }}
            >
              {isUpdating ? (
                <Loader2 className="animate-spin h-3.5 w-3.5" />
              ) : lang === "ar" ? (
                "إتمام التسليم"
              ) : (
                "Complete Handover"
              )}
            </Button>
          );
        }
      }
    } else if (!isDigital) {
      // A. DELIVERY WORKFLOW

      // 1. BenefitPay Manual Validation
      if (workflow.nextAction === "validate_payment") {
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs px-3 border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-200 dark:bg-emerald-950/20 font-semibold"
            disabled={updatingOrderId !== null}
            onClick={(e) => {
              e.stopPropagation();
              handleStatusUpdate(
                { payment_status: "paid" },
                lang === "ar" ? "تم تسجيل الدفع بنجاح!" : "Order payment marked as Paid!",
              );
            }}
          >
            {isUpdating ? (
              <Loader2 className="animate-spin h-3.5 w-3.5" />
            ) : lang === "ar" ? (
              "تأكيد الدفع"
            ) : (
              "Validate Payment"
            )}
          </Button>
        );
      }

      // 2. Packing & Shipping (Card or Validated BenefitPay)
      if (workflow.nextAction === "pack_and_ship" && isPaid) {
        return (
          <Button
            size="sm"
            className="h-8 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground text-xs px-3 shadow"
            disabled={updatingOrderId !== null}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFulfillOrder(o);
              setSelectedCourierId(o.assigned_to ?? "unassigned");
              setFulfillNotes(o.delivery_notes ?? "");
              setIsFulfillModalOpen(true);
            }}
          >
            {lang === "ar" ? "تعبئة وشحن" : "Fulfill / Pack"}
          </Button>
        );
      }

      // 3. COD Dispatch
      if (workflow.nextAction === "pack_and_ship" && isCod) {
        return (
          <Button
            size="sm"
            className="h-8 font-semibold bg-amber-500 hover:bg-amber-600 text-black text-xs px-3 shadow"
            disabled={updatingOrderId !== null}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFulfillOrder(o);
              setSelectedCourierId(o.assigned_to ?? "unassigned");
              setFulfillNotes(o.delivery_notes ?? "");
              setIsFulfillModalOpen(true);
            }}
          >
            {lang === "ar" ? "تجهيز وشحن COD" : "Pack & Ship COD"}
          </Button>
        );
      }

      // 3.5 Confirm Courier Pickup
      if (workflow.nextAction === "confirm_pickup") {
        return (
          <Button
            size="sm"
            className="h-8 font-semibold bg-sky-600 hover:bg-sky-700 text-white text-xs px-3 shadow"
            disabled={updatingOrderId !== null}
            onClick={(e) => {
              e.stopPropagation();
              setUpdatingOrderId(o.id);
              handleStatusUpdate(
                { fulfillment_status: "SHIPPED" },
                lang === "ar"
                  ? "تم استلام الشحنة من المندوب وخرجت للتوصيل!"
                  : "Courier picked up parcel - Out for Delivery!",
              );
            }}
          >
            {updatingOrderId === o.id ? (
              <Loader2 className="animate-spin h-3.5 w-3.5" />
            ) : (
              <span className="flex items-center gap-1">
                <Truck className="h-3.5 w-3.5" />
                {lang === "ar"
                  ? "تأكيد استلام المندوب"
                  : "Confirm Courier Pickup"}
              </span>
            )}
          </Button>
        );
      }

      // 4. Delivery Handover & Cash Collection Actions (Courier / Driver)
      if (
        workflow.nextAction === "mark_delivered" ||
        workflow.nextAction === "collect_and_deliver"
      ) {
        const totalAmt = Number(o.total || 0);
        const paidAmt = Number(o.paid_amount ?? o.advance_paid ?? 0);
        const remainingBal = Math.max(0, totalAmt - paidAmt);

        if (workflow.nextAction === "mark_delivered") {
          return (
            <Button
              size="sm"
              className="h-8 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 shadow dark:bg-emerald-800 dark:hover:bg-emerald-900"
              disabled={updatingOrderId !== null || isSubmittingCash}
              onClick={(e) => {
                e.stopPropagation();
                handleCompleteDelivery(o, 0);
              }}
            >
              {isSubmittingCash && updatingOrderId === o.id ? (
                <Loader2 className="animate-spin h-3.5 w-3.5" />
              ) : (
                <span className="flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" />
                  {lang === "ar" ? "تأكيد التسليم" : "Mark as Delivered"}
                </span>
              )}
            </Button>
          );
        }

        if (isPartiallyPaid || (paidAmt > 0 && remainingBal > 0)) {
          return (
            <Button
              size="sm"
              className="h-8 font-semibold bg-amber-500 hover:bg-amber-600 text-black text-xs px-3 shadow"
              disabled={updatingOrderId !== null || isSubmittingCash}
              onClick={(e) => {
                e.stopPropagation();
                setCashModalOrder(o);
                setCashCollectedAmount(remainingBal.toFixed(3));
                setCashModalNotes("");
              }}
            >
              <span className="flex items-center gap-1">
                <CircleDollarSign className="h-3.5 w-3.5" />
                {lang === "ar"
                  ? "تحصيل المتبقي وتسليم"
                  : "Collect Remaining & Complete"}
              </span>
            </Button>
          );
        }

        // Unpaid COD Order
        return (
          <Button
            size="sm"
            className="h-8 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 shadow dark:bg-emerald-800 dark:hover:bg-emerald-900"
            disabled={updatingOrderId !== null || isSubmittingCash}
            onClick={(e) => {
              e.stopPropagation();
              setCashModalOrder(o);
              setCashCollectedAmount(totalAmt.toFixed(3));
              setCashModalNotes("");
            }}
          >
            <span className="flex items-center gap-1">
              <CircleDollarSign className="h-3.5 w-3.5" />
              {lang === "ar"
                ? "تحصيل نقدًا وتسليم"
                : "Collect Cash & Complete"}
            </span>
          </Button>
        );
      }
    } else if (workflow.nextAction === "deliver_digital") {
      return (
        <Button size="sm" className="h-8 px-3 text-xs font-semibold" asChild>
          <Link
            to="/admin/b/$slug/orders/$id"
            params={{ slug, id: o.id }}
            onClick={(e) => e.stopPropagation()}
          >
            {lang === "ar" ? "إرسال الطلب الرقمي" : "Deliver digital order"}
          </Link>
        </Button>
      );
    }

    // Shipped Track button fallback
    if (isOutForDelivery) {
      return (
        <Button size="sm" variant="outline" className="h-8 text-xs px-3" asChild>
          <Link
            to="/admin/b/$slug/orders/$id"
            params={{ slug, id: o.id }}
            onClick={(e) => e.stopPropagation()}
          >
            {lang === "ar" ? "تتبع" : "Track"}
          </Link>
        </Button>
      );
    }

    // General fallback -> details
    return (
      <Button size="sm" variant="ghost" className="h-8 text-xs px-3" asChild>
        <Link
          to="/admin/b/$slug/orders/$id"
          params={{ slug, id: o.id }}
          onClick={(e) => e.stopPropagation()}
        >
          {lang === "ar" ? "تفاصيل" : "View"}
        </Link>
      </Button>
    );
  };

  return (
    <div
      className="mx-auto max-w-[1500px] space-y-5 px-3 pb-3 pt-6 sm:p-6 lg:p-8 animate-fade-in"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t("orders.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === "ar"
              ? "ركّز على الطلب التالي الذي يحتاج إلى إجراء"
              : "Focus on the next order that needs action"}
          </p>
        </div>
        {!isCourier && (
          <div className="flex w-full items-center gap-2 shrink-0 sm:w-auto">
            <OrderImporterModal
              brandId={brandId}
              onComplete={() => qc.invalidateQueries({ queryKey: ["orders", brandId] })}
            />
            <Button onClick={create} className="h-11 flex-1 gap-2 shadow-sm sm:flex-none">
              <Plus className="h-4 w-4" /> {t("orders.new")}
            </Button>
          </div>
        )}
      </div>

      {/* Operational queue: ordered by what a single operator should handle next. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {tabsList.map((tab) => {
          const isActive = tabFilter === tab.id;
          const label = lang === "ar" ? tab.label_ar : tab.label_en;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setTabFilter(tab.id);
                setPage(1); // reset pagination when tab changes
              }}
              className={cn(
                "group min-w-0 rounded-xl border px-3 py-2.5 text-start transition-all sm:rounded-2xl sm:py-3",
                tab.id === "all" && "col-span-2 sm:col-span-1",
                isActive
                  ? "border-primary bg-primary text-primary-foreground shadow-md"
                  : "border-border/70 bg-card hover:border-primary/30 hover:bg-muted/40",
              )}
            >
              <span className="flex items-center justify-between gap-4">
                <TabIcon
                  className={cn(
                    "h-4 w-4",
                    isActive ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                />
                <span className="text-lg font-semibold tabular-nums sm:text-xl">{tab.count}</span>
              </span>
              <span
                className={cn(
                  "mt-2 block text-xs font-semibold",
                  !isActive && "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="sticky top-2 z-20 border-border/70 bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:static sm:rounded-2xl sm:p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 ps-9 sm:min-w-[320px]"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={
                lang === "ar"
                  ? "ابحث بالرقم أو العميل أو جهة الاتصال"
                  : "Search invoice, customer, or contact"
              }
            />
          </div>
          <Button
            type="button"
            variant={activeFilterCount > 0 ? "default" : "outline"}
            className="relative h-11 shrink-0 gap-2 lg:hidden"
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden xs:inline">{lang === "ar" ? "تصفية" : "Filters"}</span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-background/20 px-1.5 text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>
          {(search || activeFilterCount > 0 || tabFilter !== "all") && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 lg:hidden"
              onClick={clearFilters}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">
                {lang === "ar" ? "مسح عوامل التصفية" : "Clear filters"}
              </span>
            </Button>
          )}
        </div>
        <div
          className={cn(
            "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-[170px_180px_170px_auto_auto] lg:items-center",
            !showFilters && "hidden lg:grid",
          )}
        >
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {lang === "ar" ? "حالة الدفع: الكل" : "Payment: All"}
              </SelectItem>
              <SelectItem value="unpaid">{lang === "ar" ? "غير مدفوع" : "Unpaid"}</SelectItem>
              <SelectItem value="pending_verification">
                {lang === "ar" ? "بانتظار التحقق" : "Pending Verification"}
              </SelectItem>
              <SelectItem value="partial">
                {lang === "ar" ? "مدفوع جزئيًا" : "Partially Paid"}
              </SelectItem>
              <SelectItem value="paid">{lang === "ar" ? "مدفوع" : "Paid"}</SelectItem>
              <SelectItem value="refunded">{lang === "ar" ? "مسترجع" : "Refunded"}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fulfillmentStatusFilter} onValueChange={setFulfillmentStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {lang === "ar" ? "حالة التنفيذ: الكل" : "Fulfillment: All"}
              </SelectItem>
              <SelectItem value="on_hold">{lang === "ar" ? "قيد الانتظار" : "On Hold"}</SelectItem>
              <SelectItem value="needs_packing">
                {lang === "ar" ? "بحاجة للتعبئة" : "Needs Packing"}
              </SelectItem>
              <SelectItem value="ready_for_pickup">
                {lang === "ar" ? "جاهز للاستلام" : "Ready for Pickup"}
              </SelectItem>
              <SelectItem value="out_for_delivery">
                {lang === "ar" ? "خرج للتوصيل" : "Out for Delivery"}
              </SelectItem>
              <SelectItem value="completed">
                {lang === "ar" ? "تم التوصيل / الاستلام" : "Delivered / Picked Up"}
              </SelectItem>
              <SelectItem value="cancelled">{lang === "ar" ? "ملغي" : "Cancelled"}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fulfillmentMethodFilter} onValueChange={setFulfillmentMethodFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {lang === "ar" ? "طريقة التنفيذ: الكل" : "Method: All"}
              </SelectItem>
              <SelectItem value="delivery">{t("fulfillment.delivery")}</SelectItem>
              <SelectItem value="pickup">{t("fulfillment.pickup")}</SelectItem>
              <SelectItem value="digital">
                {lang === "ar" ? "تسليم رقمي" : "Digital delivery"}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={gatewayFilter}
            onValueChange={(value) => setGatewayFilter(value as PaymentMethodFilter)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {lang === "ar" ? "طريقة الدفع: الكل" : "Payment Method: All"}
              </SelectItem>
              <SelectItem value="benefit">
                {lang === "ar" ? "بنفت بي (يدوي)" : "BenefitPay (Manual)"}
              </SelectItem>
              <SelectItem value="cod">
                {lang === "ar" ? "الدفع عند الاستلام" : "Cash on Delivery"}
              </SelectItem>
              <SelectItem value="card">
                {lang === "ar" ? "بطاقة (أونلاين)" : "Card (Online)"}
              </SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 select-none border border-zinc-100 dark:border-zinc-800 p-2 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/20 max-w-[200px] h-10 shrink-0">
            <Switch
              id="include-historical"
              checked={includeHistorical}
              onCheckedChange={setIncludeHistorical}
            />
            <label
              htmlFor="include-historical"
              className="text-[11px] font-semibold cursor-pointer text-muted-foreground whitespace-nowrap"
            >
              {lang === "ar" ? "شمل الأرشيف التاريخي" : "Include Historical"}
            </label>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden justify-self-end text-muted-foreground lg:inline-flex"
            onClick={clearFilters}
          >
            <X className="me-1 h-3.5 w-3.5" />
            {lang === "ar" ? "مسح" : "Clear"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] font-medium text-muted-foreground">
          {lang === "ar"
            ? `${filteredOrders.length} طلب مطابق`
            : `${filteredOrders.length} matching ${filteredOrders.length === 1 ? "order" : "orders"}`}
        </p>
      </Card>

      {orders.length === 0 ? (
        <Card className="p-12 text-center">
          <ReceiptText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">{t("orders.none")}</p>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card className="p-10 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">
            {lang === "ar" ? "لا توجد طلبات مطابقة" : "No matching orders"}
          </p>
          <Button variant="ghost" className="mt-2" onClick={clearFilters}>
            {lang === "ar" ? "مسح عوامل التصفية" : "Clear filters"}
          </Button>
        </Card>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {paginatedOrders.map((o) => {
              const paymentBadge = resolvePaymentStatus(
                (o as any).payment_status,
                o.status,
                Number(o.total),
                Number((o as any).advance_paid ?? 0),
              );
              const fulfillmentDetails = getFulfillmentBadgeDetails(
                getOrderWorkflow(o).fulfillment,
                lang,
                (o as any).fulfillment_method,
              );
              const isCompleted =
                ["COMPLETED", "completed"].includes((o as any).fulfillment_status || "") ||
                o.status === "completed";

              return (
                <Card
                  key={o.id}
                  className={cn(
                    "relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-200",
                    !isCompleted &&
                      tabFilter === "action_required" &&
                      "border-s-4 border-s-amber-500",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link
                            to="/admin/b/$slug/orders/$id"
                            params={{ slug, id: o.id }}
                            className="text-lg font-semibold text-primary hover:underline"
                          >
                            #{o.invoice_number}
                          </Link>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {formatDate(o.created_at ?? o.order_date, locale)}
                          </p>
                        </div>
                        <div className="text-end text-base font-bold tabular-nums">
                          {formatMoney(Number(o.total), o.currency)}
                        </div>
                      </div>
                      <div className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                        <div className="text-sm font-semibold text-foreground">
                          {getOrderCustomerName(o) || (
                            <span className="text-muted-foreground italic">
                              {t("orders.noCustomer")}
                            </span>
                          )}
                        </div>
                        <CustomerContactActions customer={getOrderCustomerContact(o)} lang={lang} />
                        <OrderItemsSummary items={o.order_items} lang={lang} />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold border",
                            PAYMENT_BADGE_CLASSES[paymentBadge],
                          )}
                        >
                          {t(`payStatus.${paymentBadge}`)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold border",
                            fulfillmentDetails.classes,
                          )}
                        >
                          {fulfillmentDetails.label}
                        </span>
                        {renderPaymentMethodBadge(o.payment_method, lang)}
                      </div>

                      <div className="mt-4 flex items-center gap-2 border-t border-border/50 pt-3">
                        <div className="min-w-0 flex-1 [&>*]:w-full [&>*]:justify-center">
                          {renderContextualButton(o)}
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">
                                {lang === "ar" ? "فتح قائمة إجراءات الطلب" : "Open order actions"}
                              </span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => copyInvoiceLink(o.public_invoice_token, t)}
                            >
                              <Copy className="me-2 h-4 w-4" />
                              {lang === "ar" ? "نسخ رابط الفاتورة" : "Copy invoice link"}
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to="/admin/b/$slug/orders/$id" params={{ slug, id: o.id }}>
                                <ExternalLink className="me-2 h-4 w-4" />
                                {lang === "ar" ? "تفاصيل الطلب" : "Order details"}
                              </Link>
                            </DropdownMenuItem>
                            {!isCourier && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInspectOrder(null);
                                  setDeleteTarget(o.id);
                                }}
                              >
                                <Trash2 className="me-2 h-4 w-4" />
                                {t("common.delete")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="hidden overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm sm:block">
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto overflow-x-auto">
              <table className="w-full text-sm">
                <colgroup>
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[18%]" />
                  <col className="w-[12%]" />
                  <col className="w-[16%]" />
                  <col className="w-[11%]" />
                  <col className="w-[25%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 border-b bg-background/95 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur select-none">
                  <tr>
                    <th
                      className="p-4 text-start font-semibold cursor-pointer hover:bg-muted/60 transition-colors"
                      onClick={() => toggleSort("invoice_number")}
                    >
                      <span className="flex items-center">
                        {t("orders.invoice")} {renderSortIcon("invoice_number")}
                      </span>
                    </th>
                    <th
                      className="p-4 text-start font-semibold cursor-pointer hover:bg-muted/60 transition-colors"
                      onClick={() => toggleSort("created_at")}
                    >
                      <span className="flex items-center">
                        {t("orders.date")} {renderSortIcon("created_at")}
                      </span>
                    </th>
                    <th
                      className="p-4 text-start font-semibold cursor-pointer hover:bg-muted/60 transition-colors"
                      onClick={() => toggleSort("customer")}
                    >
                      <span className="flex items-center">
                        {t("orders.customer")} {renderSortIcon("customer")}
                      </span>
                    </th>
                    <th className="p-4 text-start font-semibold">
                      {lang === "ar" ? "حالة الدفع" : "Payment Status"}
                    </th>
                    <th className="p-4 text-start font-semibold">
                      {lang === "ar" ? "حالة التوصيل" : "Fulfillment Status"}
                    </th>
                    <th
                      className="p-4 text-end font-semibold cursor-pointer hover:bg-muted/60 transition-colors"
                      onClick={() => toggleSort("total")}
                    >
                      <span className="flex items-center justify-end">
                        {t("orders.total")} {renderSortIcon("total")}
                      </span>
                    </th>
                    <th className="p-4 text-end font-semibold">{t("orders.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map((o) => {
                    const paymentBadge = resolvePaymentStatus(
                      (o as any).payment_status,
                      o.status,
                      Number(o.total),
                      Number((o as any).advance_paid ?? 0),
                    );
                    const fulfillmentDetails = getFulfillmentBadgeDetails(
                      getOrderWorkflow(o).fulfillment,
                      lang,
                      (o as any).fulfillment_method,
                    );
                    const isCompleted =
                      ["COMPLETED", "completed"].includes((o as any).fulfillment_status || "") ||
                      o.status === "completed";

                    return (
                      <tr
                        key={o.id}
                        onClick={() => setInspectOrder(o)}
                        className={cn(
                          "group border-t border-border/70 transition-colors hover:bg-muted/60 cursor-pointer",
                          isCompleted && "bg-emerald-50/20 dark:bg-emerald-950/10",
                        )}
                      >
                        <td className="p-4 font-semibold">
                          <Link
                            to="/admin/b/$slug/orders/$id"
                            params={{ slug, id: o.id }}
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            #{o.invoice_number}
                          </Link>
                        </td>
                        <td className="p-4 text-muted-foreground whitespace-nowrap">
                          {formatDate(o.created_at ?? o.order_date, locale)}
                        </td>
                        <td className="p-4 font-medium">
                          <div>
                            {getOrderCustomerName(o) || (
                              <span className="text-muted-foreground italic">
                                {t("orders.noCustomer")}
                              </span>
                            )}
                          </div>
                          <CustomerContactActions
                            customer={getOrderCustomerContact(o)}
                            lang={lang}
                          />
                          <OrderItemsSummary items={o.order_items} lang={lang} />
                        </td>
                        <td className="p-4">
                          <span
                            className={cn(
                              "inline-flex whitespace-nowrap text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-bold border",
                              PAYMENT_BADGE_CLASSES[paymentBadge],
                            )}
                          >
                            {t(`payStatus.${paymentBadge}`)}
                          </span>
                          <div className="mt-1.5">
                            {renderPaymentMethodBadge(o.payment_method, lang)}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1.5 items-start">
                            <span
                              className={cn(
                                "inline-flex whitespace-nowrap text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-bold border",
                                fulfillmentDetails.classes,
                              )}
                            >
                              {fulfillmentDetails.label}
                            </span>

                            {o.assigned_to &&
                              (() => {
                                const assignedCourier = (couriersQ.data ?? []).find(
                                  (c: any) => c.id === o.assigned_to,
                                );
                                const courierName =
                                  assignedCourier?.name ||
                                  (o.assigned_profile as any)?.name ||
                                  (lang === "ar" ? "مندوب" : "Courier");
                                const courierPhone =
                                  assignedCourier?.phone || (o.assigned_profile as any)?.phone;
                                const notifiedAgo = formatNotifiedTimeAgo(
                                  (o as any).courier_notified_at,
                                  lang,
                                );

                                return (
                                  <div className="mt-1 flex flex-col gap-1 text-xs">
                                    <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                      <Truck className="h-3 w-3 text-sky-600 dark:text-sky-400 shrink-0" />
                                      <span className="font-semibold text-foreground truncate max-w-[120px]">
                                        {courierName}
                                      </span>
                                    </div>

                                    {!isCourier &&
                                      (notifiedAgo ? (
                                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 w-fit">
                                          🔔{" "}
                                          {lang === "ar"
                                            ? `تم الإشعار (${notifiedAgo})`
                                            : `Notified ${notifiedAgo}`}
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          className="text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-0.5 rounded flex items-center gap-1 shadow-xs transition-colors w-fit"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const courierObj =
                                              (couriersQ.data ?? []).find(
                                                (c: any) => c.id === o.assigned_to,
                                              ) || (o.assigned_profile as any);
                                            setWaModalState({
                                              isOpen: true,
                                              order: o,
                                              courier: courierObj || {
                                                id: o.assigned_to,
                                                name: courierName,
                                                phone: courierPhone,
                                              },
                                            });
                                          }}
                                        >
                                          📱 {lang === "ar" ? "إشعار واتساب" : "Notify WA"}
                                        </button>
                                      ))}
                                  </div>
                                );
                              })()}
                          </div>
                        </td>
                        <td className="p-4 text-end font-bold whitespace-nowrap">
                          {formatMoney(Number(o.total), o.currency)}
                        </td>
                        <td className="p-3 text-end whitespace-nowrap min-w-[200px]">
                          <div className="flex min-w-0 items-center justify-end gap-1">
                            {renderContextualButton(o)}

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-10 w-10 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">
                                    {lang === "ar"
                                      ? "فتح قائمة إجراءات الطلب"
                                      : "Open order actions"}
                                  </span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align={lang === "ar" ? "start" : "end"}>
                                <DropdownMenuItem
                                  onClick={() => copyInvoiceLink(o.public_invoice_token, t)}
                                >
                                  <Copy className="me-2 h-4 w-4" />
                                  {lang === "ar" ? "نسخ رابط الفاتورة" : "Copy invoice link"}
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link to="/admin/b/$slug/orders/$id" params={{ slug, id: o.id }}>
                                    <ExternalLink className="me-2 h-4 w-4" />
                                    {lang === "ar" ? "تفاصيل الطلب" : "Order details"}
                                  </Link>
                                </DropdownMenuItem>
                                {!isCourier && (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setInspectOrder(null);
                                      setDeleteTarget(o.id);
                                    }}
                                  >
                                    <Trash2 className="me-2 h-4 w-4" />
                                    {t("common.delete")}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Pagination Controls */}
          <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-3 text-sm shadow-sm select-none sm:flex-row sm:p-4">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs sm:text-sm">
                {lang === "ar" ? "الطلبات لكل صفحة:" : "Orders per page:"}
              </span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-xs ms-2">
                {lang === "ar"
                  ? `عرض ${Math.min((page - 1) * pageSize + 1, sortedOrders.length)}-${Math.min(page * pageSize, sortedOrders.length)} من ${sortedOrders.length} طلب`
                  : `Showing ${Math.min((page - 1) * pageSize + 1, sortedOrders.length)}-${Math.min(page * pageSize, sortedOrders.length)} of ${sortedOrders.length} orders`}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
              >
                {lang === "ar" ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
                <span className="sr-only">
                  {lang === "ar" ? "الصفحة السابقة" : "Previous page"}
                </span>
              </Button>
              <div className="text-xs px-2 text-muted-foreground">
                {lang === "ar" ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
              >
                {lang === "ar" ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="sr-only">{lang === "ar" ? "الصفحة التالية" : "Next page"}</span>
              </Button>
            </div>
          </div>
        </>
      )}
      {!isCourier && (
        <AlertDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTarget(null);
            } else {
              setInspectOrder(null);
            }
          }}
        >
          <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg z-[100]">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
              <AlertDialogDescription>{t("orders.deleteConfirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteTarget) void del(deleteTarget);
                }}
              >
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Interactive Packing Verification & Fulfillment Modal */}
      <Dialog open={isFulfillModalOpen} onOpenChange={setIsFulfillModalOpen}>
        <DialogContent
          className="max-w-[calc(100vw-2rem)] sm:max-w-lg bg-background border rounded-2xl shadow-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col"
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          {selectedFulfillOrder && (
            <>
              {/* Header: Order Number, Customer Name & Address Snapshot */}
              <DialogHeader className="pb-3 border-b shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle className="text-lg font-bold flex items-center gap-2">
                    <PackageCheck className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>
                      {lang === "ar"
                        ? `قائمة التعبئة والتجهيز #${selectedFulfillOrder.invoice_number}`
                        : `Packing Slip Verification #${selectedFulfillOrder.invoice_number}`}
                    </span>
                  </DialogTitle>
                </div>
                <div className="mt-1 text-xs text-muted-foreground flex flex-col gap-0.5">
                  <div className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                    <span>
                      {getOrderCustomerName(selectedFulfillOrder) ||
                        (lang === "ar" ? "عميل زائر" : "Customer")}
                    </span>
                    {getOrderCustomerPhone(selectedFulfillOrder) && (
                      <span className="text-xs font-normal text-muted-foreground">
                        ({getOrderCustomerPhone(selectedFulfillOrder)})
                      </span>
                    )}
                  </div>
                  <DeliveryAddressSnapshot customer={selectedFulfillOrder.customers} lang={lang} />
                </div>
              </DialogHeader>

              <div className="space-y-4 py-3 overflow-y-auto flex-1 pr-1 text-sm">
                {/* Pick Checklist Header */}
                {(() => {
                  const modalItems = selectedFulfillOrder.order_items ?? [];
                  const checkedCount = modalItems.filter((it: any) => checkedItems[it.id]).length;
                  const allChecked = modalItems.length > 0 && checkedCount === modalItems.length;

                  const toggleAll = () => {
                    const nextState = !allChecked;
                    const next: Record<string, boolean> = {};
                    modalItems.forEach((it: any) => {
                      next[it.id] = nextState;
                    });
                    setCheckedItems(next);
                  };

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 bg-muted/40 p-2.5 rounded-xl border">
                        <div className="flex items-center gap-2">
                          <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-semibold text-xs text-foreground">
                            {lang === "ar" ? "قائمة فحص المنتجات" : "Pick & Pack Checklist"}
                          </span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            {checkedCount} / {modalItems.length} {lang === "ar" ? "جاهز" : "packed"}
                          </span>
                        </div>
                        {modalItems.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={toggleAll}
                            className="h-7 text-xs font-semibold px-2 text-primary hover:text-primary/90"
                          >
                            {allChecked
                              ? lang === "ar"
                                ? "إلغاء تحديد الكل"
                                : "Uncheck All"
                              : lang === "ar"
                                ? "تحديد الكل"
                                : "Check All"}
                          </Button>
                        )}
                      </div>

                      {/* Items List */}
                      {modalItems.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground border rounded-xl bg-muted/20">
                          {lang === "ar"
                            ? "لا توجد تفاصيل منتجات مسجلة لهذا الطلب."
                            : "No item line details recorded for this order."}
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {modalItems.map((item: any, idx: number) => {
                            const isChecked = Boolean(checkedItems[item.id]);
                            const imgUrl =
                              item.products?.main_image ||
                              item.products?.image_url ||
                              item.product_variants?.products?.main_image ||
                              item.selected_variant?.image_url;
                            const sku = item.product_variants?.sku || item.sku || null;
                            const title =
                              item.description ||
                              item.products?.title ||
                              (lang === "ar" ? "منتج" : "Product");

                            return (
                              <div
                                key={item.id || idx}
                                onClick={() =>
                                  setCheckedItems((prev) => ({
                                    ...prev,
                                    [item.id]: !prev[item.id],
                                  }))
                                }
                                className={cn(
                                  "flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer select-none",
                                  isChecked
                                    ? "bg-emerald-50/80 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800"
                                    : "bg-card border-border hover:border-primary/50",
                                )}
                              >
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={(checked) =>
                                    setCheckedItems((prev) => ({
                                      ...prev,
                                      [item.id]: Boolean(checked),
                                    }))
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-5 w-5 rounded-md border-primary/50"
                                />

                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt={title}
                                    className="h-10 w-10 object-cover rounded-lg border shrink-0 bg-background"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded-lg border bg-muted/60 flex items-center justify-center shrink-0">
                                    <Package className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                )}

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className={cn(
                                        "font-semibold text-xs sm:text-sm truncate",
                                        isChecked && "line-through text-muted-foreground",
                                      )}
                                    >
                                      <span className="font-bold text-primary mr-1">
                                        {item.quantity}x
                                      </span>{" "}
                                      {title}
                                    </span>
                                    <span className="text-xs font-mono font-bold shrink-0 text-muted-foreground">
                                      {formatMoney(
                                        Number(item.line_total || item.unit_price * item.quantity),
                                        selectedFulfillOrder.currency || "BHD",
                                        locale,
                                      )}
                                    </span>
                                  </div>
                                  {sku && (
                                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                      SKU: {sku}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Courier & Shipping Details */}
                <div className="space-y-3 pt-2 border-t">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground block">
                      {lang === "ar" ? "تعيين مندوب التوصيل" : "Driver / Courier"}
                    </label>
                    <Select value={selectedCourierId} onValueChange={setSelectedCourierId}>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={lang === "ar" ? "اختر مندوب التوصيل" : "Select a courier"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">
                          {lang === "ar"
                            ? "غير مسند (تعبئة بدون تعيين)"
                            : "Unassigned (Pack without assigning)"}
                        </SelectItem>
                        {(couriersQ.data ?? []).map((courier: any) => (
                          <SelectItem key={courier.id} value={courier.id}>
                            {courier.name || courier.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground block">
                      {lang === "ar" ? "ملاحظات الشحن أو رقم التتبع" : "Delivery Notes or Tracking"}
                    </label>
                    <Input
                      value={fulfillNotes}
                      onChange={(e) => setFulfillNotes(e.target.value)}
                      placeholder={
                        lang === "ar"
                          ? "أدخل رقم التتبع أو أي تعليمات خاصة للتوصيل..."
                          : "Enter tracking number or special packing notes..."
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Primary Action Button Footer */}
              <div className="pt-3 border-t shrink-0 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFulfilling}
                  onClick={() => setIsFulfillModalOpen(false)}
                >
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  size="sm"
                  className={cn(
                    "font-bold shadow-md transition-all px-4",
                    (selectedFulfillOrder.order_items ?? []).every((it: any) => checkedItems[it.id])
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-amber-600 hover:bg-amber-700 text-white",
                  )}
                  disabled={isFulfilling}
                  onClick={async () => {
                    if (!selectedFulfillOrder) return;
                    setIsFulfilling(true);
                    try {
                      const res = await fetch("/api/orders/status", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          id: selectedFulfillOrder.id,
                          fulfillment_status: "ASSIGNED",
                          assigned_to:
                            selectedCourierId === "unassigned" ? null : selectedCourierId,
                          delivery_notes: fulfillNotes,
                          admin_override: ["cash", "cod"].includes(
                            String(selectedFulfillOrder.payment_method || "").toLowerCase(),
                          ),
                        }),
                      });
                      const data = await res.json<{ error?: string; error_ar?: string }>();
                      if (!res.ok)
                        throw new Error(
                          data.error_ar && lang === "ar" ? data.error_ar : data.error,
                        );
                      toast.success(
                        lang === "ar"
                          ? "تم تأكيد تعبئة الطلب وتجهيزه للشحن!"
                          : "Order packed and dispatched successfully!",
                      );

                      if (selectedCourierId !== "unassigned") {
                        const courierObj = (couriersQ.data ?? []).find(
                          (c: any) => c.id === selectedCourierId,
                        );
                        if (courierObj && courierObj.phone) {
                          const waUrl = generateCourierWhatsAppUrl({
                            order: selectedFulfillOrder,
                            courierPhone: courierObj.phone,
                            courierName: courierObj.name || courierObj.email,
                            brandSlug: slug,
                            lang,
                          });
                          toast(
                            lang === "ar"
                              ? `تم إسناد الطلب إلى "${courierObj.name || "المندوب"}"`
                              : `Assigned to ${courierObj.name || "Courier"}`,
                            {
                              action: {
                                label:
                                  lang === "ar" ? "📱 إشعار عبر واتساب" : "📱 Notify on WhatsApp",
                                onClick: async () => {
                                  await recordCourierNotified(selectedFulfillOrder.id);
                                  qc.invalidateQueries({ queryKey: ["orders", brandId] });
                                  window.open(waUrl, "_blank", "noopener,noreferrer");
                                },
                              },
                              duration: 10000,
                            },
                          );
                        }
                      }

                      qc.invalidateQueries({ queryKey: ["orders", brandId] });
                      setIsFulfillModalOpen(false);
                    } catch (err: any) {
                      toast.error(err.message || "Failed to fulfill order");
                    } finally {
                      setIsFulfilling(false);
                    }
                  }}
                >
                  {isFulfilling ? (
                    <Loader2 className="animate-spin h-4 w-4 mr-1.5 inline" />
                  ) : (
                    <PackageCheck className="h-4 w-4 mr-1.5 inline" />
                  )}
                  {lang === "ar" ? "تأكيد التعبئة والتجهيز للشحن" : "Confirm Packed & Dispatch"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 💵 Cash Collection & Courier Delivery Completion Modal */}
      <Dialog
        open={Boolean(cashModalOrder)}
        onOpenChange={(open) => {
          if (!open) setCashModalOrder(null);
        }}
      >
        <DialogContent
          className="max-w-[calc(100vw-2rem)] sm:max-w-md bg-background border rounded-2xl shadow-xl"
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <CircleDollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              {lang === "ar" ? "تأكيد تحصيل المبلغ والتسليم" : "Confirm Cash & Delivery"}
            </DialogTitle>
          </DialogHeader>

          {cashModalOrder && (
            <div className="space-y-4 py-2">
              <div className="rounded-xl bg-muted/60 border p-3.5 space-y-1.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {lang === "ar" ? "رقم الفاتورة / الطلب:" : "Invoice / Order #"}
                  </span>
                  <span className="font-mono font-bold text-primary">
                    #{cashModalOrder.invoice_number || cashModalOrder.id.slice(0, 8)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {lang === "ar" ? "العميل:" : "Customer:"}
                  </span>
                  <span className="font-semibold">
                    {getOrderCustomerName(cashModalOrder) || (lang === "ar" ? "عميل" : "Customer")}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {lang === "ar" ? "إجمالي الطلب:" : "Total Amount:"}
                  </span>
                  <span className="font-semibold">
                    {formatMoney(
                      Number(cashModalOrder.total),
                      cashModalOrder.currency ?? "BHD",
                      locale,
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400 font-bold border-t pt-2 mt-1">
                  <span>{lang === "ar" ? "المبلغ المتبقي للتحصيل:" : "Remaining Balance:"}</span>
                  <span className="text-base font-extrabold">
                    {formatMoney(
                      Math.max(
                        0,
                        Number(cashModalOrder.total) -
                          Number(cashModalOrder.paid_amount ?? cashModalOrder.advance_paid ?? 0),
                      ),
                      cashModalOrder.currency ?? "BHD",
                      locale,
                    )}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground block">
                  {lang === "ar" ? "المبلغ المستلم نقداً (د.ب)" : "Cash Amount Received (BHD)"}
                </label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={cashCollectedInput}
                  onChange={(e) => setCashCollectedAmount(e.target.value)}
                  placeholder="0.000"
                  className="font-mono text-lg font-extrabold h-11 border-emerald-300 focus:border-emerald-500 dark:border-emerald-800"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground block">
                  {lang === "ar" ? "ملاحظات التوصيل (اختياري)" : "Delivery Notes (Optional)"}
                </label>
                <Input
                  value={cashModalNotes}
                  onChange={(e) => setCashModalNotes(e.target.value)}
                  placeholder={
                    lang === "ar"
                      ? "مثال: تم الاستلام من البواب / تحصيل عبر بنفت باج"
                      : "e.g. Received at gate / BenefitPay transfer"
                  }
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCashModalOrder(null)}
                  disabled={isSubmittingCash}
                >
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md"
                  disabled={isSubmittingCash}
                  onClick={() => {
                    const amt = Number(cashCollectedInput);
                    if (isNaN(amt) || amt < 0) {
                      toast.error(
                        lang === "ar"
                          ? "يرجى إدخال مبلغ صحيح (غير سالب)"
                          : "Please enter a valid non-negative amount",
                      );
                      return;
                    }
                    handleCompleteDelivery(cashModalOrder, amt, cashModalNotes);
                  }}
                >
                  {isSubmittingCash ? (
                    <Loader2 className="animate-spin h-4 w-4 mr-1.5 inline" />
                  ) : null}
                  {lang === "ar" ? "تأكيد التحصيل والتسليم" : "Confirm Cash & Complete"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <OrderQuickInspectSheet
        order={inspectOrder}
        slug={slug}
        lang={lang}
        locale={locale}
        onClose={() => setInspectOrder(null)}
      />
      {waModalState.isOpen && waModalState.order && waModalState.courier && (
        <CourierWhatsAppModal
          isOpen={waModalState.isOpen}
          onClose={() => setWaModalState({ isOpen: false, order: null, courier: null })}
          order={waModalState.order}
          courier={waModalState.courier}
          lang={lang}
          brandSlug={slug}
          onNotified={async () => {
            await qc.invalidateQueries({ queryKey: ["orders", brandId] });
            await qc.invalidateQueries({ queryKey: ["activity_logs"] });
          }}
        />
      )}
    </div>
  );
}

const ORDER_HEADER_MAPS = {
  order_number: ["name", "order number", "order_number", "رقم الطلب", "id"],
  order_date: ["created at", "created_at", "order date", "order_date", "تاريخ الطلب", "date"],
  customer_name: [
    "billing name",
    "shipping name",
    "customer name",
    "اسم العميل",
    "الاسم الكامل",
    "name",
  ],
  customer_phone: ["billing phone", "shipping phone", "phone", "جوال العميل", "رقم الهاتف", "جوال"],
  customer_email: ["email", "billing email", "البريد الالكتروني", "البريد الإلكتروني"],
  total_price: ["total", "order total", "الإجمالي", "إجمالي الطلب", "total_price"],
  item_name: ["lineitem name", "item name", "اسم المنتج", "عنوان المنتج", "product_name"],
  item_quantity: ["lineitem quantity", "quantity", "الكمية", "item quantity"],
  item_price: ["lineitem price", "item price", "سعر المنتج", "السعر"],
};

function sanitizeGCCPhone(phoneStr: string | null): string | null {
  if (!phoneStr) return null;
  let clean = phoneStr.replace(/[^\d]/g, "");
  clean = clean.replace(/^0+/, "");

  if (clean.length === 8) {
    return `+973${clean}`;
  }
  if (clean.length === 9 && clean.startsWith("5")) {
    return `+966${clean}`;
  }
  if (clean.startsWith("973") || clean.startsWith("966")) {
    return `+${clean}`;
  }
  return `+${clean}`;
}

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentVal = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = "";
      if (row.length > 0 && row.some((val) => val !== "")) {
        lines.push(row);
      }
      row = [];
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
    } else {
      currentVal += char;
    }
  }
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    lines.push(row);
  }
  return lines.filter((r) => r.length > 0 && r.some((val) => val !== ""));
}

function OrderImporterModal({ brandId, onComplete }: { brandId: string; onComplete: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"preset" | "mapper" | "importing" | "success">("preset");
  const [preset, setPreset] = useState<"shopify" | "woocommerce" | "salla" | "zid" | "custom">(
    "shopify",
  );
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>({
    order_number: -1,
    order_date: -1,
    customer_name: -1,
    customer_phone: -1,
    customer_email: -1,
    total_price: -1,
    item_name: -1,
    item_quantity: -1,
    item_price: -1,
  });
  const [progress, setProgress] = useState("");
  const [successCount, setSuccessCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error(
          isAr
            ? "ملف الـ CSV فارغ أو يحتوي على صف الرأس فقط."
            : "CSV file is empty or only contains the header row.",
        );
        return;
      }

      const fileHeaders = rows[0].map((h) => h.trim());
      setParsedRows(rows.slice(1));
      setHeaders(fileHeaders);

      // Smart Header Mapping Detector
      const newMappings = {
        order_number: -1,
        order_date: -1,
        customer_name: -1,
        customer_phone: -1,
        customer_email: -1,
        total_price: -1,
        item_name: -1,
        item_quantity: -1,
        item_price: -1,
      };

      Object.entries(ORDER_HEADER_MAPS).forEach(([field, aliases]) => {
        const foundIdx = fileHeaders.findIndex((h) =>
          aliases.some(
            (alias) =>
              h.toLowerCase() === alias.toLowerCase() ||
              h.toLowerCase().includes(alias.toLowerCase()),
          ),
        );
        newMappings[field as keyof typeof newMappings] = foundIdx;
      });

      setMappings(newMappings);

      const mandatoryMapped = newMappings.order_number !== -1 && newMappings.item_name !== -1;
      if (mandatoryMapped && preset !== "custom") {
        startImport(rows.slice(1), newMappings, fileHeaders);
      } else {
        setStep("mapper");
      }
    };
    reader.readAsText(file);
  };

  const startImport = async (
    dataRows: string[][],
    finalMappings: Record<string, number>,
    headersList: string[] = headers,
  ) => {
    setStep("importing");
    setProgress(
      isAr ? "بدء عملية استيراد الطلبات الفاخرة..." : "Starting premium order import pipeline...",
    );

    const findHeaderIdx = (names: string[]) => {
      return headersList.findIndex((h) =>
        names.some((name) => h.trim().toLowerCase() === name.toLowerCase()),
      );
    };

    const ordersMap = new Map<string, any>();

    dataRows.forEach((row) => {
      let orderNum = "";
      let orderDate = new Date().toISOString();
      let customerName = null;
      let customerPhone = null;
      let customerEmail = null;
      let totalPrice = 0.0;
      let itemName = "";
      let itemQty = 1;
      let itemPrice = 0.0;
      let notesVal = null;

      if (preset === "shopify") {
        const orderNumIdx = findHeaderIdx(["name"]);
        const dateIdx = findHeaderIdx(["created at", "created_at"]);
        const phoneIdx = findHeaderIdx(["billing phone", "shipping phone", "phone"]);
        const emailIdx = findHeaderIdx(["email"]);
        const billingNameIdx = findHeaderIdx(["billing name", "shipping name", "customer name"]);
        const itemQtyIdx = findHeaderIdx(["lineitem quantity", "quantity"]);
        const itemNameIdx = findHeaderIdx(["lineitem name", "item name"]);
        const itemPriceIdx = findHeaderIdx(["lineitem price", "item price"]);
        const totalIdx = findHeaderIdx(["total"]);
        const notesIdx = findHeaderIdx(["note", "notes"]);

        orderNum = orderNumIdx !== -1 ? row[orderNumIdx] : "";
        orderDate =
          dateIdx !== -1 && row[dateIdx]
            ? new Date(row[dateIdx]).toISOString()
            : new Date().toISOString();
        customerPhone = phoneIdx !== -1 ? sanitizeGCCPhone(row[phoneIdx]) : null;
        customerEmail = emailIdx !== -1 ? row[emailIdx] || null : null;
        customerName = billingNameIdx !== -1 ? row[billingNameIdx] || null : null;
        itemQty =
          itemQtyIdx !== -1 ? parseInt(row[itemQtyIdx]?.replace(/[^\d]/g, "") || "1") || 1 : 1;
        itemName = itemNameIdx !== -1 ? row[itemNameIdx] : "Line Item";
        itemPrice =
          itemPriceIdx !== -1
            ? parseFloat(row[itemPriceIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0
            : 0.0;
        totalPrice =
          totalIdx !== -1 ? parseFloat(row[totalIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;
        notesVal = notesIdx !== -1 ? row[notesIdx] || null : null;
      } else if (preset === "woocommerce") {
        const orderNumIdx = findHeaderIdx(["order number", "order_number", "id", "post_id"]);
        const dateIdx = findHeaderIdx(["order date", "order_date", "post_date"]);
        const phoneIdx = findHeaderIdx(["billing phone", "_billing_phone", "phone"]);
        const emailIdx = findHeaderIdx(["billing email", "_billing_email", "email"]);
        const firstNameIdx = findHeaderIdx(["billing first name", "_billing_first_name"]);
        const lastNameIdx = findHeaderIdx(["billing last name", "_billing_last_name"]);
        const itemQtyIdx = findHeaderIdx(["item quantity", "quantity"]);
        const itemNameIdx = findHeaderIdx(["item name", "name"]);
        const itemPriceIdx = findHeaderIdx(["item price", "price"]);
        const totalIdx = findHeaderIdx(["order total", "_order_total", "total"]);

        orderNum = orderNumIdx !== -1 ? row[orderNumIdx] : "";
        orderDate =
          dateIdx !== -1 && row[dateIdx]
            ? new Date(row[dateIdx]).toISOString()
            : new Date().toISOString();
        customerPhone = phoneIdx !== -1 ? sanitizeGCCPhone(row[phoneIdx]) : null;
        customerEmail = emailIdx !== -1 ? row[emailIdx] || null : null;

        const first = firstNameIdx !== -1 ? row[firstNameIdx] : "";
        const last = lastNameIdx !== -1 ? row[lastNameIdx] : "";
        customerName = `${first} ${last}`.trim() || null;

        itemQty =
          itemQtyIdx !== -1 ? parseInt(row[itemQtyIdx]?.replace(/[^\d]/g, "") || "1") || 1 : 1;
        itemName = itemNameIdx !== -1 ? row[itemNameIdx] : "Line Item";
        itemPrice =
          itemPriceIdx !== -1
            ? parseFloat(row[itemPriceIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0
            : 0.0;
        totalPrice =
          totalIdx !== -1 ? parseFloat(row[totalIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;
      } else if (preset === "salla" || preset === "zid") {
        const orderNumIdx = findHeaderIdx(["رقم الطلب", "رقم طلب سلة", "id", "order_id"]);
        const dateIdx = findHeaderIdx(["تاريخ الطلب", "تاريخ طلب سلة", "date", "created_at"]);
        const phoneIdx = findHeaderIdx(["جوال العميل", "رقم الجوال", "رقم الهاتف", "phone"]);
        const emailIdx = findHeaderIdx(["البريد الالكتروني", "البريد الإلكتروني", "email"]);
        const nameIdx = findHeaderIdx(["اسم العميل", "الاسم الكامل", "name"]);
        const itemQtyIdx = findHeaderIdx(["الكمية", "كمية المنتج", "quantity"]);
        const itemNameIdx = findHeaderIdx(["اسم المنتج", "عنوان المنتج", "product_name"]);
        const itemPriceIdx = findHeaderIdx(["سعر المنتج", "السعر", "price"]);
        const totalIdx = findHeaderIdx(["إجمالي الطلب", "الإجمالي", "total"]);

        orderNum = orderNumIdx !== -1 ? row[orderNumIdx] : "";
        orderDate =
          dateIdx !== -1 && row[dateIdx]
            ? new Date(row[dateIdx]).toISOString()
            : new Date().toISOString();
        customerPhone = phoneIdx !== -1 ? sanitizeGCCPhone(row[phoneIdx]) : null;
        customerEmail = emailIdx !== -1 ? row[emailIdx] || null : null;
        customerName = nameIdx !== -1 ? row[nameIdx] || null : null;
        itemQty =
          itemQtyIdx !== -1 ? parseInt(row[itemQtyIdx]?.replace(/[^\d]/g, "") || "1") || 1 : 1;
        itemName = itemNameIdx !== -1 ? row[itemNameIdx] : "Line Item";
        itemPrice =
          itemPriceIdx !== -1
            ? parseFloat(row[itemPriceIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0
            : 0.0;
        totalPrice =
          totalIdx !== -1 ? parseFloat(row[totalIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;
      } else {
        orderNum = finalMappings.order_number !== -1 ? row[finalMappings.order_number] : "";
        orderDate =
          finalMappings.order_date !== -1 && row[finalMappings.order_date]
            ? new Date(row[finalMappings.order_date]).toISOString()
            : new Date().toISOString();
        customerPhone =
          finalMappings.customer_phone !== -1
            ? sanitizeGCCPhone(row[finalMappings.customer_phone])
            : null;
        customerEmail =
          finalMappings.customer_email !== -1 ? row[finalMappings.customer_email] || null : null;
        customerName =
          finalMappings.customer_name !== -1 ? row[finalMappings.customer_name] || null : null;
        itemQty =
          finalMappings.item_quantity !== -1
            ? parseInt(row[finalMappings.item_quantity]?.replace(/[^\d]/g, "") || "1") || 1
            : 1;
        itemName = finalMappings.item_name !== -1 ? row[finalMappings.item_name] : "Line Item";
        itemPrice =
          finalMappings.item_price !== -1
            ? parseFloat(row[finalMappings.item_price]?.replace(/[^\d.]/g, "") || "0") || 0.0
            : 0.0;
        totalPrice =
          finalMappings.total_price !== -1
            ? parseFloat(row[finalMappings.total_price]?.replace(/[^\d.]/g, "") || "0") || 0.0
            : 0.0;
      }

      if (!orderNum) return;

      if (ordersMap.has(orderNum)) {
        const existing = ordersMap.get(orderNum);
        existing.items.push({
          name: itemName,
          quantity: itemQty,
          price: itemPrice,
        });
      } else {
        ordersMap.set(orderNum, {
          orderNumber: orderNum,
          orderDate,
          customerName,
          customerPhone,
          customerEmail,
          totalPrice,
          paymentStatus: "paid",
          source: preset,
          notes: notesVal,
          items: [
            {
              name: itemName,
              quantity: itemQty,
              price: itemPrice,
            },
          ],
        });
      }
    });

    const parsedOrders = Array.from(ordersMap.values());
    setTotalCount(parsedOrders.length);

    if (parsedOrders.length === 0) {
      toast.error(
        isAr
          ? "لم نتمكن من تحديد أي طلبات صالحة في هذا الملف."
          : "No valid orders could be parsed from this file.",
      );
      setStep("preset");
      return;
    }

    try {
      const { importHistoricalOrders } = await import("@/lib/order-importer");

      const batchSize = 25;
      let totalSuccess = 0;

      for (let i = 0; i < parsedOrders.length; i += batchSize) {
        const chunk = parsedOrders.slice(i, i + batchSize);
        setProgress(
          isAr
            ? `جاري استيراد ${i} من أصل ${parsedOrders.length} طلب تاريخي...`
            : `Importing ${i} / ${parsedOrders.length} legacy orders...`,
        );

        const result = await importHistoricalOrders({
          data: {
            brandId,
            orders: chunk,
          },
        });

        totalSuccess += result.successCount;
        setSuccessCount(totalSuccess);
      }

      setStep("success");
      onComplete();
    } catch (err: any) {
      console.error(err);
      toast.error(isAr ? "فشل استيراد الطلبات" : "Order importer pipeline failed");
      setStep("preset");
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setStep("preset");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="hidden h-11 items-center gap-2 whitespace-nowrap rounded-xl border-primary/20 px-4 text-xs font-semibold shadow-sm transition-all hover:border-primary/50 sm:inline-flex"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
          {isAr ? "استيراد طلبات سابقة" : "Import Past Orders"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl p-6 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 shadow-2xl">
        <DialogHeader className="pb-4 border-b border-zinc-100 dark:border-zinc-900">
          <DialogTitle className="text-lg font-bold font-display flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {isAr ? "معالج ترحيل واستيراد الطلبات السابقة" : "Historical Orders Migration Engine"}
          </DialogTitle>
        </DialogHeader>

        {step === "preset" && (
          <div className="space-y-5 pt-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isAr
                ? "ارفع ملفات الطلبات السابقة للتصدير من Shopify، WooCommerce، Salla، أو Zid مباشرة لتهيئة سجلات مبيعاتك بالكامل مع مطابقة العملاء."
                : "Upload legacy order CSV exports from Shopify, WooCommerce, Salla, or Zid to populate sales history with zero downtime."}
            </p>

            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "shopify", label: "🛒 Shopify Orders", desc: "orders_export.csv" },
                { id: "woocommerce", label: "📦 WooCommerce CSV", desc: "wc_orders.csv" },
                { id: "salla", label: "🟢 Salla (سلة)", desc: "salla_orders.csv" },
                { id: "zid", label: "🟣 Zid (زد)", desc: "zid_orders.csv" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id as any)}
                  className={`p-4 rounded-xl border text-start transition-all ${
                    preset === p.id
                      ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                      : "border-zinc-100 dark:border-zinc-900 hover:border-zinc-200 hover:bg-zinc-50/50"
                  }`}
                >
                  <p className="text-xs font-semibold">{p.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{p.desc}</p>
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-900 flex justify-between items-center">
              <Button
                variant="ghost"
                onClick={() => setPreset("custom")}
                className="text-xs text-muted-foreground font-semibold"
              >
                {isAr ? "استخدام مطابقة مخصصة..." : "Use custom column mapper..."}
              </Button>

              <label className="bg-primary text-primary-foreground text-xs font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-primary/15 hover:shadow-xl transition-all cursor-pointer flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {isAr ? "اختر ملف الـ CSV" : "Select CSV File"}
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>
        )}

        {step === "mapper" && (
          <div className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "طابق أعمدة ملف الـ CSV المخصص الخاص بك مع الحقول المطلوبة لترحيل مبيعاتك بنجاح."
                : "Map your custom CSV file columns to match required fields in our historical sales engine."}
            </p>

            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {[
                { key: "order_number", label: isAr ? "رقم الطلب" : "Order Number", required: true },
                { key: "order_date", label: isAr ? "تاريخ الطلب" : "Order Date", required: true },
                {
                  key: "customer_name",
                  label: isAr ? "اسم العميل" : "Customer Name",
                  required: false,
                },
                {
                  key: "customer_phone",
                  label: isAr ? "رقم جوال العميل" : "Customer Phone",
                  required: false,
                },
                {
                  key: "customer_email",
                  label: isAr ? "البريد الإلكتروني" : "Customer Email",
                  required: false,
                },
                {
                  key: "total_price",
                  label: isAr ? "إجمالي الطلب" : "Total Price",
                  required: true,
                },
                { key: "item_name", label: isAr ? "اسم المنتج" : "Item Name", required: true },
                {
                  key: "item_quantity",
                  label: isAr ? "كمية المنتج" : "Item Quantity",
                  required: true,
                },
                { key: "item_price", label: isAr ? "سعر المنتج" : "Item Price", required: true },
              ].map((field) => (
                <div
                  key={field.key}
                  className="flex items-center justify-between gap-4 p-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-xl border border-zinc-100 dark:border-zinc-800"
                >
                  <span className="text-xs font-semibold text-foreground">
                    {field.label} {field.required && <span className="text-rose-500">*</span>}
                  </span>
                  <Select
                    value={mappings[field.key]?.toString() || "-1"}
                    onValueChange={(val) =>
                      setMappings((m) => ({ ...m, [field.key]: parseInt(val) }))
                    }
                  >
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue placeholder={isAr ? "اختر العمود..." : "Select..."} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-1">-- {isAr ? "تجاوز" : "Skip"} --</SelectItem>
                      {headers.map((h, idx) => (
                        <SelectItem key={idx} value={idx.toString()}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setStep("preset")}
                className="text-xs font-semibold"
              >
                {isAr ? "رجوع" : "Back"}
              </Button>
              <Button
                onClick={() => {
                  if (mappings.order_number === -1 || mappings.item_name === -1) {
                    toast.error(
                      isAr
                        ? "رقم الطلب واسم المنتج حقول إلزامية للتجهيز."
                        : "Order Number and Item Name are mandatory fields.",
                    );
                    return;
                  }
                  startImport(parsedRows, mappings);
                }}
                className="bg-primary text-xs text-primary-foreground font-semibold px-5 py-2"
              >
                {isAr ? "بدء الاستيراد" : "Start Import"}
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="space-y-1">
              <p className="font-semibold text-sm">
                {isAr ? "جاري استيراد تاريخ مبيعاتك..." : "Processing order database migration..."}
              </p>
              <p className="text-xs text-muted-foreground">{progress}</p>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-5 pt-6">
            <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 flex items-center justify-center border border-emerald-100 dark:border-emerald-900">
              <Check className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-lg">
                {isAr ? "اكتمل الترحيل بنجاح وافر!" : "Historical Migration Completed!"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                {isAr
                  ? `تم بنجاح ترحيل واستيراد ${successCount} من أصل ${totalCount} طلبات سابقة مع مطابقتها بالعملاء بنجاح.`
                  : `Successfully imported ${successCount} out of ${totalCount} historical sales, matching billing phone entries directly.`}
              </p>
            </div>
            <Button
              onClick={handleClose}
              className="bg-primary text-xs font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-primary/10"
            >
              {isAr ? "استمرار إلى اللوحة" : "Proceed to Dashboard"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OrderQuickInspectSheet({
  order,
  slug,
  lang,
  locale,
  onClose,
}: {
  order: any | null;
  slug: string;
  lang: string;
  locale: string;
  onClose: () => void;
}) {
  if (!order) return null;
  const isAr = lang === "ar";
  const items = order.order_items ?? [];

  return (
    <Sheet open={Boolean(order)} onOpenChange={(open: boolean) => !open && onClose()}>
      <SheetContent
        side={isAr ? "left" : "right"}
        className="w-full sm:max-w-lg p-0 flex flex-col bg-background shadow-2xl"
      >
        <div className="p-6 pe-16 ps-12 border-b space-y-2">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="text-2xl font-extrabold font-display">
              #{order.invoice_number}
            </SheetTitle>
            <span className="text-xs font-mono font-bold text-muted-foreground">
              {formatDate(order.created_at ?? order.order_date, locale)}
            </span>
          </div>
          <Link
            to="/admin/b/$slug/orders/$id"
            params={{ slug, id: order.id }}
            className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1.5 pt-1"
          >
            {isAr ? "تفاصيل الطلب الكاملة" : "Full Order Page"} <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Customer Card */}
          <div className="rounded-xl border p-4 space-y-2 bg-card">
            <h4 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
              {isAr ? "معلومات العميل" : "Customer Overview"}
            </h4>
            <div className="text-sm font-semibold">
              {getOrderCustomerName(order) || (isAr ? "عميل غير مسجل" : "Guest Customer")}
            </div>
            <CustomerContactActions customer={getOrderCustomerContact(order)} lang={lang as "en" | "ar"} />
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
              {isAr ? "المنتجات والأصناف" : "Order Line Items"}
            </h4>
            <div className="divide-y border rounded-xl overflow-hidden bg-card">
              {items.map((it: any, idx: number) => (
                <div key={it.id || idx} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-sm">
                      <span className="text-primary font-bold mr-1">{it.quantity}x</span>
                      {it.name_en || it.name_ar || "Item"}
                    </div>
                  </div>
                  <div className="font-mono font-bold shrink-0 text-sm">
                    {formatMoney(Number(it.line_total || it.unit_price * it.quantity), order.currency || "BHD", locale)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Breakdown */}
          <div className="rounded-xl border p-4 space-y-2 bg-card">
            <div className="flex justify-between items-center text-sm font-bold pt-1 border-t">
              <span>{isAr ? "الإجمالي النهائي" : "Total Amount"}</span>
              <span className="text-base text-primary font-mono">
                {formatMoney(Number(order.total), order.currency || "BHD", locale)}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-muted/20 flex gap-2">
          <Button
            asChild
            className="flex-1 bg-primary text-primary-foreground font-bold h-11 rounded-xl"
          >
            <Link to="/admin/b/$slug/orders/$id" params={{ slug, id: order.id }}>
              <ExternalLink className="h-4 w-4 me-2" />
              {isAr ? "فتح صفحة الطلب الكاملة" : "Open Order Record Page"}
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
