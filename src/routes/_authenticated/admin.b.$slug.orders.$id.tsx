import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef, lazy } from "react";
import { toast } from "sonner";
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
import {
  ArrowLeft,
  Plus,
  Trash2,
  Copy,
  Printer,
  Save,
  Send,
  Search,
  Receipt,
  Link as LinkIcon,
  ScanLine,
  Mail,
  Loader2,
  Lock,
  Unlock,
  X,
  Tag,
  CheckCircle2,
  ImageIcon,
  Truck,
  UserPlus,
  MoreHorizontal,
  UserRound,
  Package,
  CreditCard,
  MapPin,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  generateCourierWhatsAppUrl,
  formatNotifiedTimeAgo,
  recordCourierNotified,
} from "@/lib/courier-whatsapp";
import { CourierWhatsAppModal } from "@/components/courier/CourierWhatsAppModal";
import { formatDate, formatMoney, formatOrderStatus } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import {
  getOrderCustomerEmail,
  getOrderCustomerName,
  getOrderCustomerPhone,
} from "@/lib/order-customer-snapshot";
import {
  regionLabel,
  formatAddressLine,
  formatAddressDetailed,
  type StructuredAddress,
} from "@/lib/bahrain-regions";
import { printThermalReceipt } from "@/lib/thermal-print";
import { cn } from "@/lib/utils";
import {
  resolvePaymentStatus,
  PAYMENT_BADGE_CLASSES,
  PAYMENT_BADGE_LABEL,
  PAYMENT_BADGE_VALUES,
  type PaymentBadge,
} from "@/lib/payment-status";
import { logActivityBatch } from "@/lib/activity-log";
import { ActivityLogList } from "@/components/activity-log-list";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { PhoneInput } from "@/components/phone-input";
import { useBrand } from "@/lib/brand-context";
import { useProfile } from "@/lib/profile-context";
import { getBenefitReceiptViewUrl, rejectBenefitReceipt } from "@/lib/benefit-receipt.functions";
import { DeliveryAddressCard } from "@/components/delivery-address-card";
import { getOrderWorkflow } from "@/lib/order-workflow";
import {
  getFulfillmentLabel,
  getOrderStatusLabel,
  getFulfillmentMethodLabel,
  FULFILLMENT_STATUS_MAP,
} from "@/lib/status-labels";

function formatDeliveryAddress(
  c:
    | {
        region?: string | null;
        road?: string | null;
        house?: string | null;
        flat?: string | null;
        address?: string | null;
        city?: string | null;
      }
    | null
    | undefined,
  lang: "en" | "ar",
): string[] {
  if (!c) return [];
  const region = regionLabel(c.region, lang) || c.city || "";
  const road = c.road?.trim() || "";
  const house = c.house?.trim() || "";
  const flat = c.flat?.trim() || "";
  const parts =
    lang === "ar"
      ? [region, road, house, flat] // المنطقة، طريق، منزل، شقة
      : [flat, house, road, region]; // Flat, House, Road, Region
  const filtered = parts.filter((p) => p && p.length > 0);
  if (filtered.length === 0 && c.address) return c.address.split(/\r?\n/).filter(Boolean);
  const sep = lang === "ar" ? "، " : ", ";
  return filtered.length ? [filtered.join(sep)] : [];
}

type SavedAddress = {
  id: string;
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

export const Route = createFileRoute("/_authenticated/admin/b/$slug/orders/$id")({
  component: OrderDetail,
  errorComponent: OrderErrorBoundary,
  notFoundComponent: () => <OrderErrorBoundary />,
});

function OrderErrorBoundary({ error }: { error?: Error }) {
  const { slug } = Route.useParams();
  return (
    <div className="p-8 max-w-lg mx-auto">
      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-8 text-center space-y-3">
        <h2 className="text-xl font-display">Order</h2>
        <p className="text-muted-foreground">
          {error?.message || "This order could not be loaded. It may have been deleted."}
        </p>
        <Link to="/admin/b/$slug/orders" params={{ slug }} className="text-primary underline">
          ← Back to orders
        </Link>
      </Card>
    </div>
  );
}

type Order = any;
type Item = {
  id?: string;
  product_id?: string | null;
  variant_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  original_price?: number | null;
  customizations: { name: string; price_delta: number }[];
  customization_total: number;
  line_total: number;
  location: "main" | "incubator";
  selected_variant?: { size?: string | null; color?: string | null; fabric?: string | null } | null;
  custom_field_values?: Array<{
    key: string;
    label_ar: string | null;
    label_en: string | null;
    value: string;
  }>;
};

function BhdFeeInput({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [display, setDisplay] = useState(Number(value || 0).toFixed(3));
  useEffect(() => setDisplay(Number(value || 0).toFixed(3)), [value]);
  const commit = () => {
    const parsed = Math.max(0, Number(display) || 0);
    setDisplay(parsed.toFixed(3));
    onChange(parsed);
  };
  return (
    <Input
      inputMode="decimal"
      value={display}
      disabled={disabled}
      onChange={(event) => setDisplay(event.target.value.replace(/[^0-9.]/g, ""))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}

function normalizeCustomFieldValues(value: unknown): Item["custom_field_values"] {
  if (Array.isArray(value)) return value as Item["custom_field_values"];
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, fieldValue]) => ({
      key,
      label_ar: null,
      label_en: key,
      value: String(fieldValue ?? ""),
    }));
  }
  return [];
}

function normalizeWhatsAppNumber(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("973") ? digits : `973${digits.replace(/^0+/, "")}`;
}

function fillCourierMessage(template: string, order: any, brandName: string) {
  return template
    .replaceAll("{{customer_name}}", getOrderCustomerName(order) || "Customer")
    .replaceAll("{{invoice_number}}", String(order.invoice_number ?? ""))
    .replaceAll("{{brand_name}}", brandName)
    .replaceAll("{{total}}", formatMoney(Number(order.total ?? 0), order.currency || "BHD"))
    .replaceAll("{{customer_phone}}", getOrderCustomerPhone(order));
}

const CourierOrderView = lazy(() => import("@/components/orders/CourierOrderView"));

function OrderDetail() {
  const t = useT();
  const { lang } = useI18n();
  const { id, slug } = Route.useParams();
  const qc = useQueryClient();
  const brand = useBrand();
  const { isAdmin, isCourier } = useProfile();
  const brandId = brand.id;
  const [approvingBenefit, setApprovingBenefit] = useState(false);
  const [rejectingBenefit, setRejectingBenefit] = useState(false);
  const [rejectReasonOpen, setRejectReasonOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const orderQ = useQuery({
    queryKey: ["order", id, isCourier ? "assigned-courier" : "office"],
    // A courier can be working from a phone with an intermittent realtime
    // socket. Keep both courier and office views synchronized regardless.
    refetchInterval: isCourier ? 10_000 : 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(
          "*, customers(*), order_items(*), shipping_address:customer_addresses!orders_shipping_address_id_fkey(*)",
        )
        .eq("id", id);
      if (isCourier) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        query = (query as any).eq("assigned_to", user.id).eq("fulfillment_method", "delivery");
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Order not found. It may have been deleted.");
      return data as Order;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`order-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["order", id] });
          void qc.invalidateQueries({ queryKey: ["orders"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs", filter: `order_id=eq.${id}` },
        () => void qc.invalidateQueries({ queryKey: ["activity_logs"] }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, qc]);

  const productsQ = useQuery({
    queryKey: ["products", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (await supabase.from("products").select("*").eq("brand_id", brandId)).data ?? [],
  });
  const variantsQ = useQuery({
    queryKey: ["variants", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (await supabase.from("product_variants").select("*").eq("brand_id", brandId)).data ?? [],
  });
  const customersQ = useQuery({
    queryKey: ["customers", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (await supabase.from("customers").select("*").eq("brand_id", brandId).order("name")).data ??
      [],
  });
  const couriersQ = useQuery({
    queryKey: ["couriers", brandId],
    enabled: isAdmin,
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
  const [waModalOpen, setWaModalOpen] = useState(false);

  const assignCourier = async (courierId: string) => {
    const { error } = await (supabase.rpc as any)("assign_order_courier", {
      p_order_id: id,
      p_courier_id: courierId === "unassigned" ? null : courierId,
    });
    if (error) return toast.error(error.message);
    toast.success(lang === "ar" ? "تم تحديث مندوب التوصيل" : "Courier assignment updated");
    await orderQ.refetch();

    if (courierId !== "unassigned") {
      setWaModalOpen(true);
    }
  };
  const addressesQ = useQuery({
    queryKey: ["customer_addresses", brandId],
    enabled: !isCourier,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("brand_id", brandId);
      if (error) throw error;
      return (data ?? []) as SavedAddress[];
    },
  });

  const receiptViewQ = useQuery({
    queryKey: ["benefit-receipt-view", id, orderQ.data?.benefit_receipt_key],
    enabled:
      !isCourier &&
      Boolean(orderQ.data?.payment_method === "benefit" && orderQ.data?.benefit_receipt_key),
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
    queryFn: async () => getBenefitReceiptViewUrl({ data: { orderId: id } }),
    retry: false,
  });

  const approveBenefitPayment = async () => {
    setApprovingBenefit(true);
    try {
      const { error } = await supabase.rpc("approve_benefit_payment" as any, { p_order_id: id });
      if (error) throw error;

      await orderQ.refetch();
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success(
        lang === "ar" ? "تم التحقق من الدفع واعتماده" : "Payment verified and approved",
      );
    } catch (error: any) {
      toast.error(
        error?.message ?? (lang === "ar" ? "تعذر اعتماد الدفع" : "Could not approve payment"),
      );
    } finally {
      setApprovingBenefit(false);
    }
  };

  const rejectBenefitPayment = async () => {
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      toast.error(
        lang === "ar"
          ? "يرجى إدخال سبب الرفض ليظهر للعميل"
          : "Enter a rejection reason for the customer",
      );
      return;
    }
    setRejectingBenefit(true);
    try {
      await rejectBenefitReceipt({ data: { orderId: id, reason } });
      toast.success(
        lang === "ar" ? "تم رفض الإيصال وحذف الصورة" : "Receipt rejected and image deleted",
      );
      await orderQ.refetch();
      qc.removeQueries({ queryKey: ["benefit-receipt-view", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      setRejectReasonOpen(false);
      setRejectReason("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "ar"
            ? "تعذر رفض الإيصال"
            : "Unable to reject receipt",
      );
    } finally {
      setRejectingBenefit(false);
    }
  };
  const branchesQ = useQuery({
    queryKey: ["branches", brandId],
    enabled: !isCourier,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name_ar, name_en, location_ar, location_en")
        .eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const customQ = useQuery({
    queryKey: ["customizations", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (
        await supabase
          .from("customization_options")
          .select("*")
          .eq("brand_id", brandId)
          .order("name")
      ).data ?? [],
  });
  const settingsQ = useQuery({
    queryKey: ["business-settings", brandId],
    enabled: !isCourier,
    queryFn: async () => {
      const { data } = await supabase
        .from("business_settings")
        .select("*")
        .eq("brand_id", brandId)
        .maybeSingle();
      return data;
    },
  });

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [editingUnlocked, setEditingUnlocked] = useState(false);
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adminOverrideChecked, setAdminOverrideChecked] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [activeSection, setActiveSection] = useState<string>("sec-overview");

  useEffect(() => {
    if (!order?.id) return;
    const scrollContainer = document.querySelector(".os-scrollbar");
    const sectionIds = ["sec-overview", "sec-items", "sec-invoice", "sec-activity"];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { root: scrollContainer, rootMargin: "-60px 0px -50% 0px", threshold: 0.1 },
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [order?.id]);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const initialSnapshotRef = useRef<{ order: any; items: Item[] } | null>(null);

  const isDirty = useMemo(() => {
    if (!initialSnapshotRef.current || !order) return false;
    const snap = initialSnapshotRef.current;

    const currentOrderMin = {
      notes: order.notes ?? "",
      delivery_notes: order.delivery_notes ?? "",
      customer_id: order.customer_id ?? null,
      shipping_address_id: order.shipping_address_id ?? null,
      payment_status: order.payment_status,
      fulfillment_status: order.fulfillment_status,
      status: order.status,
      payment_method: order.payment_method ?? null,
      discount: Number(order.discount ?? 0),
      shipping: Number(order.shipping ?? 0),
      tax_rate: Number(order.tax_rate ?? 0),
      advance_paid: Number(order.advance_paid ?? 0),
      order_date: order.order_date,
    };

    const orderChanged = JSON.stringify(currentOrderMin) !== JSON.stringify(snap.order);

    const simplifyItem = (it: Item) => ({
      id: it.id,
      product_id: it.product_id,
      variant_id: it.variant_id,
      quantity: it.quantity,
      unit_price: Number(it.unit_price),
      line_total: Number(it.line_total),
      customizations: it.customizations ?? [],
    });

    const itemsChanged =
      JSON.stringify(items.map(simplifyItem)) !== JSON.stringify(snap.items.map(simplifyItem));

    return orderChanged || itemsChanged;
  }, [items, order]);

  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    id: string;
    amount: number;
  } | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [discountMode, setDiscountMode] = useState<"fixed" | "percent">("fixed");
  const [discountPercentInput, setDiscountPercentInput] = useState<string>("");
  const [lastNonZeroTaxRate, setLastNonZeroTaxRate] = useState<number>(10);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustRegion, setNewCustRegion] = useState("");
  const [newCustBlock, setNewCustBlock] = useState("");
  const [newCustRoad, setNewCustRoad] = useState("");
  const [newCustHouse, setNewCustHouse] = useState("");
  const [newCustFlat, setNewCustFlat] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const promoContextRef = useRef<string | null>(null);

  const handleCreateInlineCustomer = async () => {
    if (!newCustName.trim()) {
      return toast.error(lang === "ar" ? "أدخل اسم العميل" : "Customer name is required");
    }
    setCreatingCustomer(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const brandId = (settingsQ.data as any)?.brand_id || (brand as any)?.id;

      // 1. Insert customer
      const { data: cust, error: custErr } = await (supabase.from("customers") as any)
        .insert({
          user_id: user.id,
          brand_id: brandId,
          name: newCustName.trim(),
          phone: newCustPhone.trim() || null,
          email: newCustEmail.trim().toLowerCase() || null,
          region: newCustRegion.trim() || null,
          block: newCustBlock.trim() || null,
          road: newCustRoad.trim() || null,
          house: newCustHouse.trim() || null,
          flat: newCustFlat.trim() || null,
        })
        .select()
        .single();

      if (custErr) throw custErr;

      // 2. Insert default address if address details provided
      let addressId: string | null = null;
      if (newCustRegion || newCustBlock || newCustRoad || newCustHouse) {
        const { data: addr, error: addrErr } = await (supabase.from("customer_addresses") as any)
          .insert({
            user_id: user.id,
            brand_id: brandId,
            customer_id: cust.id,
            label: "Home",
            region: newCustRegion.trim() || null,
            block: newCustBlock.trim() || null,
            road: newCustRoad.trim() || null,
            house: newCustHouse.trim() || null,
            flat: newCustFlat.trim() || null,
            is_default: true,
          })
          .select()
          .single();

        if (!addrErr && addr) {
          addressId = addr.id;
        }
      }

      toast.success(
        lang === "ar"
          ? `تم إضافة العميل "${cust.name}" بنجاح!`
          : `Customer "${cust.name}" created successfully!`,
      );

      // Auto-assign to current order!
      setOrder({
        ...order,
        customer_id: cust.id,
        shipping_address_id: addressId,
      });

      // Refetch queries
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer_addresses"] });

      // Reset form & close modal
      setNewCustName("");
      setNewCustPhone("");
      setNewCustEmail("");
      setNewCustRegion("");
      setNewCustBlock("");
      setNewCustRoad("");
      setNewCustHouse("");
      setNewCustFlat("");
      setNewCustomerOpen(false);
    } catch (err: any) {
      toast.error(
        err.message || (lang === "ar" ? "تعذر إنشاء العميل" : "Failed to create customer"),
      );
    } finally {
      setCreatingCustomer(false);
    }
  };

  const filteredVariantsForSearch = useMemo(() => {
    if (!productSearchQuery.trim()) return (variantsQ.data ?? []).slice(0, 25);
    const tokens = productSearchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const products = productsQ.data ?? [];
    return (variantsQ.data ?? [])
      .filter((v: any) => {
        const p = products.find((x: any) => x.id === v.product_id);
        const title = String((p as any)?.name ?? "").toLowerCase();
        const titleAr = String((p as any)?.name_ar ?? "").toLowerCase();
        const titleEn = String((p as any)?.name_en ?? "").toLowerCase();
        const sku = String(v.sku ?? (p as any)?.sku ?? "").toLowerCase();
        const barcode = String(v.barcode ?? "").toLowerCase();
        const size = String(v.size ?? "").toLowerCase();
        const color = String(v.color ?? "").toLowerCase();
        const fabric = String(v.fabric ?? "").toLowerCase();

        const fullSearchableBlob = `${title} ${titleAr} ${titleEn} ${sku} ${barcode} ${size} ${color} ${fabric}`;
        return tokens.every((token) => fullSearchableBlob.includes(token));
      })
      .slice(0, 35);
  }, [productSearchQuery, variantsQ.data, productsQ.data]);

  const handleSelectVariantFromModal = (variant: any) => {
    const p = (productsQ.data ?? []).find((x: any) => x.id === variant.product_id);
    const isAr = lang === "ar";
    const sizeLabel = isAr ? "المقاس" : "Size";
    const colorLabel = isAr ? "اللون" : "Color";
    const variantTitle = [
      p ? (p as any).name : "",
      variant.size ? `${sizeLabel}: ${variant.size}` : "",
      variant.color ? `${colorLabel}: ${variant.color}` : "",
    ]
      .filter(Boolean)
      .join(" — ");
    const price = Number(
      variant.selling_price ??
        variant.price_override ??
        variant.price ??
        (p as any)?.selling_price ??
        (p as any)?.base_price ??
        (p as any)?.price ??
        0,
    );
    const preferredLoc: "main" | "incubator" = (variant.stock_main ?? 0) > 0 ? "main" : "incubator";

    setItems((prev) => [
      ...prev,
      {
        product_id: variant.product_id,
        variant_id: variant.id,
        description: variantTitle || "Custom Item",
        quantity: 1,
        unit_price: price,
        original_price: price,
        customizations: [],
        customization_total: 0,
        line_total: price,
        location: preferredLoc,
        selected_variant: variant,
      },
    ]);
    toast.success(
      isAr ? `تمت إضافة "${variantTitle}" إلى الطلب!` : `Added "${variantTitle}" to order!`,
    );
    setProductSearchOpen(false);
    setProductSearchQuery("");
  };

  const serverOrder = orderQ.data as any;
  const isBlankDraft =
    id === "new" ||
    (serverOrder?.status === "draft" &&
      !serverOrder?.customer_id &&
      !serverOrder?.payment_method &&
      (serverOrder?.order_items?.length ?? 0) === 0);

  useEffect(() => {
    if (orderQ.data) {
      // Prevent background query revalidations from overwriting unsaved local edits
      if (initialSnapshotRef.current && isDirty) return;

      setOrder(orderQ.data);
      const loadedItems = (orderQ.data.order_items ?? []).map((i: any) => ({
        id: i.id,
        product_id: i.product_id,
        variant_id: i.variant_id,
        description: i.description,
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
        original_price: i.original_price == null ? null : Number(i.original_price),
        customizations: i.customizations ?? [],
        customization_total: Number(i.customization_total),
        line_total: Number(i.line_total),
        location: (i.location === "incubator" ? "incubator" : "main") as "main" | "incubator",
        selected_variant: i.selected_variant ?? null,
        custom_field_values: normalizeCustomFieldValues(i.custom_field_values),
      }));

      // Check localStorage for uncommitted draft backup
      const cacheKey = `boutq_draft_${brandId}_${id}`;
      try {
        const cachedStr = localStorage.getItem(cacheKey);
        if (cachedStr && (id === "new" || isBlankDraft)) {
          const cached = JSON.parse(cachedStr);
          if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
            setItems(cached.items);
            if (cached.order) setOrder((prev: any) => ({ ...prev, ...cached.order }));
            toast.info(
              lang === "ar"
                ? "تم استعادة مسودتك الأخيرة تلقائياً!"
                : "Restored your unsaved draft!",
            );
            return;
          }
        }
      } catch (e) {
        // ignore cache read errors
      }

      setItems(loadedItems);

      initialSnapshotRef.current = {
        order: {
          notes: orderQ.data.notes ?? "",
          delivery_notes: orderQ.data.delivery_notes ?? "",
          customer_id: orderQ.data.customer_id ?? null,
          shipping_address_id: orderQ.data.shipping_address_id ?? null,
          payment_status: orderQ.data.payment_status,
          fulfillment_status: orderQ.data.fulfillment_status,
          status: orderQ.data.status,
          payment_method: orderQ.data.payment_method ?? null,
          discount: Number(orderQ.data.discount ?? 0),
          shipping: Number(orderQ.data.shipping ?? 0),
          tax_rate: Number(orderQ.data.tax_rate ?? 0),
          advance_paid: Number(orderQ.data.advance_paid ?? 0),
          order_date: orderQ.data.order_date,
        },
        items: loadedItems,
      };

      promoContextRef.current = JSON.stringify({
        customer: (orderQ.data as any).customer_id ?? null,
        items: loadedItems.map((item: Item) => [
          item.variant_id ?? null,
          item.quantity,
          Number(item.line_total).toFixed(3),
        ]),
      });
      setEditingUnlocked(false);
      const savedPromo = (orderQ.data as any).promo_code;
      setPromoInput(savedPromo ?? "");
      setAppliedPromo(
        savedPromo
          ? {
              code: savedPromo,
              id: (orderQ.data as any).promo_code_id ?? "",
              amount: Number((orderQ.data as any).discount ?? 0),
            }
          : null,
      );
    }
  }, [orderQ.data, brandId, id, isBlankDraft, isDirty, lang]);

  useEffect(() => {
    setHasSavedDraft(false);
  }, [id]);

  // Auto-save unsaved draft state to localStorage
  useEffect(() => {
    if (id === "new" || isBlankDraft) {
      const cacheKey = `boutq_draft_${brandId}_${id}`;
      if (items.length > 0 || order?.customer_id) {
        localStorage.setItem(cacheKey, JSON.stringify({ order, items, updatedAt: Date.now() }));
      }
    }
  }, [items, order, brandId, id, isBlankDraft]);

  // Backfill the tenant's flat delivery fee for untouched draft orders that
  // were created before the list-page initializer loaded the setting.
  useEffect(() => {
    if (
      !order ||
      !settingsQ.data ||
      order.fulfillment_method !== "delivery" ||
      Number(order.shipping ?? 0) !== 0
    )
      return;
    const source = orderQ.data as any;
    const untouchedDraft =
      source?.status === "draft" &&
      !source?.customer_id &&
      !source?.payment_method &&
      (source?.order_items?.length ?? 0) === 0;
    const configuredFee = Number((settingsQ.data as any).delivery_fee ?? 0);
    if (untouchedDraft && configuredFee > 0)
      setOrder((current: any) => (current ? { ...current, shipping: configuredFee } : current));
  }, [order, orderQ.data, settingsQ.data]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, i) => s + i.line_total, 0);
    const discount = Number(order?.discount ?? 0);
    const shipping = Number(order?.shipping ?? 0);
    const taxable = Math.max(0, subtotal - discount);
    const isInclusive = Boolean((settingsQ.data as any)?.vat_inclusive);
    const taxRate = Number(order?.tax_rate ?? 0);
    let taxAmount = 0;
    let total = 0;
    if (isInclusive) {
      taxAmount = taxable - taxable / (1 + taxRate / 100);
      total = taxable + shipping;
    } else {
      taxAmount = (taxable * taxRate) / 100;
      total = taxable + taxAmount + shipping;
    }
    const advancePaid = Math.max(0, Number(order?.advance_paid ?? 0));
    const remaining = Math.max(0, total - advancePaid);
    return { subtotal, discount, shipping, taxAmount, total, advancePaid, remaining };
  }, [
    items,
    order?.discount,
    order?.shipping,
    order?.tax_rate,
    order?.advance_paid,
    settingsQ.data,
  ]);

  useEffect(() => {
    const signature = JSON.stringify({
      customer: order?.customer_id ?? null,
      items: items.map((item) => [
        item.variant_id ?? null,
        item.quantity,
        Number(item.line_total).toFixed(3),
      ]),
    });
    if (promoContextRef.current === null) {
      promoContextRef.current = signature;
      return;
    }
    if (promoContextRef.current !== signature) {
      promoContextRef.current = signature;
      if (appliedPromo) {
        setAppliedPromo(null);
        setPromoInput("");
        setOrder((current: any) =>
          current ? { ...current, discount: 0, promo_code: null, promo_code_id: null } : current,
        );
        toast.info(
          lang === "ar"
            ? "تمت إزالة رمز الخصم بعد تغيير العميل أو المنتجات."
            : "Promo code removed after the customer or items changed.",
        );
      }
    }
  }, [items, order?.customer_id, appliedPromo, lang]);

  const promoFailureMessage = (result: any) => {
    switch (result?.reason) {
      case "FIRST_ORDER_ONLY":
        return lang === "ar"
          ? "رمز الخصم هذا مخصص للعملاء الجدد فقط."
          : "This promo code is restricted to first-time customers only.";
      case "MINIMUM_NOT_MET":
        return lang === "ar"
          ? `يتطلب رمز الخصم هذا حداً أدنى للشراء بقيمة ${formatMoney(Number(result.minimum_order_amount), "BHD")}.`
          : `This promo code requires a minimum purchase value of ${formatMoney(Number(result.minimum_order_amount), "BHD")}.`;
      case "NO_ELIGIBLE_ITEMS":
        return lang === "ar"
          ? "لا يمكن تطبيق رمز الخصم هذا على المنتجات المخفضة مسبقاً."
          : "This promo code cannot be applied to items already on discount/sale.";
      case "CODE_INACTIVE":
        return lang === "ar"
          ? "رمز الخصم هذا لم يعد نشطاً."
          : "This promotional code is no longer active.";
      case "USAGE_LIMIT_REACHED":
        return lang === "ar"
          ? "وصل هذا العميل إلى الحد المسموح لاستخدام الرمز."
          : "This customer has reached the usage limit for this promo code.";
      case "CUSTOMER_REQUIRED":
        return lang === "ar"
          ? "اختر عميلاً قبل تطبيق رمز الخصم."
          : "Select a customer before applying this promo code.";
      case "CODE_NOT_FOUND":
        return lang === "ar"
          ? "رمز الخصم غير موجود لهذا المتجر."
          : "This promo code does not exist for this brand.";
      default:
        return lang === "ar"
          ? "تعذر تطبيق رمز الخصم. تحقق من شروط الرمز."
          : "This promo code could not be applied. Check its eligibility rules.";
    }
  };

  const applyAdminPromo = async () => {
    if (!order) return;
    const code = promoInput.trim().toUpperCase();
    if (!code) return toast.error(lang === "ar" ? "أدخل رمز الخصم." : "Enter a promo code.");
    if (!items.length || totals.subtotal <= 0)
      return toast.error(
        lang === "ar" ? "أضف منتجات إلى الطلب أولاً." : "Add products to the order first.",
      );
    setCheckingPromo(true);
    const { data, error } = await supabase.rpc("validate_promo_code" as any, {
      p_brand_slug: brand.slug,
      p_code: code,
      p_subtotal: totals.subtotal,
      p_items: items.map((item) => ({
        variant_id: item.variant_id,
        line_total: Number(item.line_total.toFixed(3)),
      })),
      p_customer_id: order.customer_id ?? null,
    });
    setCheckingPromo(false);
    if (error)
      return toast.error(
        error.message ||
          (lang === "ar" ? "تعذر التحقق من الرمز." : "Could not validate this promo code."),
      );
    const result = data as any;
    if (!result?.valid) return toast.error(promoFailureMessage(result));
    const amount = Number(result.discount_amount ?? 0);
    const active = { code: String(result.code), id: String(result.promo_code_id), amount };
    setPromoInput(active.code);
    setAppliedPromo(active);
    setOrder({ ...order, discount: amount, promo_code: active.code, promo_code_id: active.id });
    toast.success(lang === "ar" ? "تم تطبيق رمز الخصم." : "Promo code applied.");
  };

  const removeAdminPromo = () => {
    if (!order) return;
    setAppliedPromo(null);
    setPromoInput("");
    setOrder({ ...order, discount: 0, promo_code: null, promo_code_id: null });
  };

  const paymentBadge: PaymentBadge = useMemo(
    () =>
      resolvePaymentStatus(order?.payment_status, order?.status, totals.total, totals.advancePaid),
    [order?.payment_status, order?.status, totals.total, totals.advancePaid],
  );

  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraStreamPromise, setCameraStreamPromise] = useState<Promise<MediaStream> | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  if (orderQ.isError) {
    const rawErr =
      orderQ.error instanceof Error ? orderQ.error.message : String(orderQ.error ?? "");
    const localizedErr =
      rawErr.includes("Cannot read properties of null") || rawErr.includes("customer_id")
        ? lang === "ar"
          ? "جاري إعداد بيانات الطلب..."
          : "Loading order details..."
        : lang === "ar"
          ? "تأكد من وجود الطلب ثم حاول مرة أخرى."
          : "Please confirm this order exists and try again.";

    return (
      <div className="mx-auto max-w-2xl p-6 sm:p-8">
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
          <h1 className="text-xl font-semibold">
            {lang === "ar" ? "تعذر فتح الطلب" : "Unable to open this order"}
          </h1>
          <p className="text-sm text-muted-foreground">{localizedErr}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void orderQ.refetch()}>
              {lang === "ar" ? "إعادة المحاولة" : "Try again"}
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/b/$slug/orders" params={{ slug }}>
                {lang === "ar" ? "العودة إلى الطلبات" : "Back to orders"}
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!order)
    return (
      <div className="p-8 text-center text-sm font-medium text-muted-foreground">
        {lang === "ar" ? "جاري التحميل..." : "Loading..."}
      </div>
    );

  // Courier access is intentionally limited by RLS. Their focused delivery
  // view must not wait for office-only settings, catalogue, or CRM queries.
  if (isCourier) {
    return (
      <CourierOrderView
        order={orderQ.data}
        slug={slug}
        onUpdated={async () => {
          await Promise.all([
            orderQ.refetch(),
            qc.invalidateQueries({ queryKey: ["orders"] }),
            qc.invalidateQueries({ queryKey: ["activity_logs"] }),
          ]);
        }}
      />
    );
  }

  if (settingsQ.isPending || !settingsQ.data) return <div className="p-8">Loading…</div>;

  const currency = order.currency ?? "BHD";
  const isClosedOrder = serverOrder?.status === "completed" || serverOrder?.status === "paid";
  const isReadOnly = isClosedOrder && !editingUnlocked;
  const isCreationMode = isBlankDraft && !hasSavedDraft;

  const addItem = () => {
    setItems([
      ...items,
      {
        description: "",
        quantity: 1,
        unit_price: 0,
        original_price: null,
        customizations: [],
        customization_total: 0,
        line_total: 0,
        location: "main",
      },
    ]);
  };

  const openBarcodeScanner = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    /* The scanner component owns camera acquisition. Avoid opening a competing
       warm-up stream here; it prevents autofocus on several mobile browsers. */
    setCameraStreamPromise(null);
    setScannerOpen(true);
  };

  const handleScanned = (code: string) => {
    const normalizeScan = (value: unknown) =>
      String(value ?? "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .toUpperCase();
    const trimmed = normalizeScan(code);
    if (!trimmed) return;
    const variants = variantsQ.data ?? [];
    const products = productsQ.data ?? [];
    const v =
      variants.find((x: any) => normalizeScan(x.barcode) === trimmed) ??
      variants.find((x: any) => normalizeScan(x.sku) === trimmed);
    if (!v) {
      toast.error(
        lang === "ar" ? `لم يتم العثور على الباركود: ${trimmed}` : `Barcode not found: ${trimmed}`,
      );
      return;
    }
    const p = products.find((x: any) => x.id === v.product_id);
    const isAr = lang === "ar";
    const sizeLabel = isAr ? "المقاس" : "Size";
    const colorLabel = isAr ? "اللون" : "Color";
    const fabricLabel = isAr ? "القماش" : "Fabric";
    const lines = [p?.name ?? ""];
    if (v.size) lines.push(`${sizeLabel}: ${v.size}`);
    if (v.color) lines.push(`${colorLabel}: ${v.color}`);
    if (v.fabric) lines.push(`${fabricLabel}: ${v.fabric}`);
    // Default to whichever location has stock; prefer main.
    const preferred: "main" | "incubator" =
      (v.stock_main ?? 0) > 0 ? "main" : (v.stock_incubator ?? 0) > 0 ? "incubator" : "main";
    const newItem: Item = {
      product_id: v.product_id,
      variant_id: v.id,
      description: lines.filter(Boolean).join("\n"),
      quantity: 1,
      unit_price: Number(v.selling_price ?? 0),
      original_price: (v as any).original_price == null ? null : Number((v as any).original_price),
      customizations: [],
      customization_total: 0,
      line_total: Number(v.selling_price ?? 0),
      location: preferred,
    };
    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.variant_id === v.id && item.location === preferred && !item.customizations?.length,
      );
      if (existingIndex < 0) return [...prev, newItem];
      return prev.map((item, index) =>
        index === existingIndex ? recalc({ ...item, quantity: Number(item.quantity) + 1 }) : item,
      );
    });
    toast.success(isAr ? "تمت إضافة القطعة" : "Item added");
  };

  const recalc = (i: Item): Item => {
    const custTotal = i.customizations.reduce((s, c) => s + Number(c.price_delta), 0);
    const line = (Number(i.unit_price) + custTotal) * Number(i.quantity);
    return { ...i, customization_total: custTotal, line_total: line };
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems(items.map((it, i) => (i === idx ? recalc({ ...it, ...patch }) : it)));
  };

  const pickVariant = (idx: number, variantId: string) => {
    const v = variantsQ.data?.find((x: any) => x.id === variantId);
    const p = productsQ.data?.find((x: any) => x.id === v?.product_id);
    if (!v || !p) return;
    const isAr = lang === "ar";
    const sizeLabel = isAr ? "المقاس" : "Size";
    const colorLabel = isAr ? "اللون" : "Color";
    const fabricLabel = isAr ? "القماش" : "Fabric";
    const lines = [p.name];
    if (v.size) lines.push(`${sizeLabel}: ${v.size}`);
    if (v.color) lines.push(`${colorLabel}: ${v.color}`);
    if (v.fabric) lines.push(`${fabricLabel}: ${v.fabric}`);
    updateItem(idx, {
      product_id: p.id,
      variant_id: v.id,
      description: lines.join("\n"),
      unit_price: Number(v.selling_price),
      original_price: (v as any).original_price == null ? null : Number((v as any).original_price),
    });
  };

  const toggleCustom = (idx: number, c: { name: string; price_delta: number }) => {
    const it = items[idx];
    const exists = it.customizations.find((x) => x.name === c.name);
    const newCust = exists
      ? it.customizations.filter((x) => x.name !== c.name)
      : [...it.customizations, c];
    updateItem(idx, { customizations: newCust });
  };

  const DEDUCTING = new Set(["confirmed", "paid", "shipped", "completed"]);

  const save = async () => {
    if (isReadOnly) return;
    const fulfillmentMethod = order.fulfillment_method ?? "delivery";
    if (fulfillmentMethod === "pickup" && !order.branch_id) {
      return toast.error(lang === "ar" ? "اختر فرع الاستلام" : "Select a pickup branch");
    }
    if (fulfillmentMethod === "delivery" && !order.shipping_address_id) {
      return toast.error(lang === "ar" ? "اختر عنوان التوصيل" : "Select a delivery address");
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    // Stock precheck when order will be in a deducting state.
    if (DEDUCTING.has(order.status)) {
      const variants = variantsQ.data ?? [];
      const wasDeducted = !!(orderQ.data as any)?.stock_deducted;
      const priorItems = wasDeducted ? ((orderQ.data as any)?.order_items ?? []) : [];
      const prevByVariant = new Map<string, number>();
      for (const p of priorItems as any[]) {
        if (!p.variant_id) continue;
        prevByVariant.set(
          p.variant_id,
          (prevByVariant.get(p.variant_id) ?? 0) + Number(p.quantity),
        );
      }
      const wantByVariant = new Map<string, number>();
      for (const it of items) {
        if (!it.variant_id) continue;
        wantByVariant.set(
          it.variant_id,
          (wantByVariant.get(it.variant_id) ?? 0) + Number(it.quantity),
        );
      }
      for (const [vid, want] of wantByVariant) {
        const v = variants.find((x: any) => x.id === vid);
        if (!v) continue;
        const available = Number(v.stock) + (prevByVariant.get(vid) ?? 0);
        if (want > available) {
          setSaving(false);
          return toast.error(t("orderDetail.insufficientStock"));
        }
      }
    }

    const { error: oe } = await supabase
      .from("orders")
      .update({
        customer_id: order.customer_id,
        status: order.status,
        notes: order.notes,
        fulfillment_method: fulfillmentMethod,
        branch_id: fulfillmentMethod === "pickup" ? (order.branch_id ?? null) : null,
        shipping_address_id:
          fulfillmentMethod === "delivery" ? (order.shipping_address_id ?? null) : null,
        digital_delivery_channel:
          fulfillmentMethod === "digital" ? order.digital_delivery_channel : null,
        digital_delivery_contact:
          fulfillmentMethod === "digital" ? order.digital_delivery_contact : null,
        payment_method: order.payment_method ?? null,
        payment_status: order.payment_status ?? "unpaid",
        fulfillment_status: order.fulfillment_status ?? "ON_HOLD",
        discount: totals.discount,
        tax_rate: order.tax_rate,
        tax_amount: totals.taxAmount,
        promo_code: appliedPromo?.code ?? null,
        promo_code_id: appliedPromo?.id || null,
        shipping: totals.shipping,
        subtotal: totals.subtotal,
        total: totals.total,
        advance_paid: totals.advancePaid,
        currency,
        order_date: order.order_date,
      } as any)
      .eq("id", order.id);
    if (oe) {
      setSaving(false);
      return toast.error(oe.message);
    }

    // ── Activity log: detect changes vs saved state
    const prev = (orderQ.data ?? {}) as any;
    const prevStatus = prev.status;
    const newStatus = order.status;
    const statusChanged = prevStatus !== newStatus;

    const logs: Array<{ action: string; en: string; ar: string; order_id: string }> = [];
    if (statusChanged) {
      logs.push({
        action: "status_change",
        order_id: order.id,
        en: `Order status changed from "${prev.status ?? "—"}" to "${order.status}"`,
        ar: `تم تغيير حالة الطلب من "${prev.status ?? "—"}" إلى "${order.status}"`,
      });
    }
    const prevPay = prev.payment_status ?? "unpaid";
    const nextPay = order.payment_status ?? "unpaid";
    if (prevPay !== nextPay) {
      logs.push({
        action: "payment_change",
        order_id: order.id,
        en: `Payment status manually changed from "${prevPay}" to "${nextPay}"`,
        ar: `تم تغيير حالة الدفع يدوياً من "${prevPay}" إلى "${nextPay}"`,
      });
    }
    const prevAdvance = Number(prev.advance_paid ?? 0);
    const nextAdvance = totals.advancePaid;
    if (prevAdvance !== nextAdvance) {
      logs.push({
        action: "advance_change",
        order_id: order.id,
        en: `Advance payment updated from ${prevAdvance} to ${nextAdvance} ${currency}`,
        ar: `تم تحديث المبلغ المقدم من ${prevAdvance} إلى ${nextAdvance} ${currency}`,
      });
    }

    // Only update order_items if they actually changed
    const originalItems = (orderQ.data?.order_items ?? []) as any[];
    let itemsModified = originalItems.length !== items.length;
    if (!itemsModified) {
      for (const item of items) {
        const orig = originalItems.find((o) => o.id === item.id);
        if (
          !orig ||
          orig.product_id !== item.product_id ||
          orig.variant_id !== item.variant_id ||
          Number(orig.quantity) !== Number(item.quantity) ||
          Number(orig.unit_price) !== Number(item.unit_price) ||
          orig.description !== item.description ||
          (orig.location === "incubator" ? "incubator" : "main") !== item.location ||
          JSON.stringify(orig.customizations ?? []) !== JSON.stringify(item.customizations ?? [])
        ) {
          itemsModified = true;
          break;
        }
      }
    }

    if (itemsModified) {
      await supabase.from("order_items").delete().eq("order_id", order.id);
      if (items.length > 0) {
        const { error: ie } = await (supabase.from("order_items") as any).insert(
          items.map((i) => ({
            user_id: user.id,
            order_id: order.id,
            product_id: i.product_id ?? null,
            variant_id: i.variant_id ?? null,
            description: i.description,
            quantity: i.quantity,
            unit_price: i.unit_price,
            original_price: i.original_price ?? null,
            customizations: i.customizations,
            customization_total: i.customization_total,
            line_total: i.line_total,
            location: i.location ?? "main",
          })),
        );
        if (ie) {
          setSaving(false);
          return toast.error(ie.message);
        }
      }
    }

    // Sync inventory (deduct or restore based on status).
    const { error: se } = await supabase.rpc("sync_order_stock", { p_order_id: order.id });
    if (se) {
      if (se.message?.includes("INSUFFICIENT_STOCK")) {
        toast.error(t("orderDetail.insufficientStock"));
      } else {
        console.warn("[sync_order_stock]", se.message);
        toast.error(se.message);
      }
    }

    // Stock deltas: compare prior deducted items vs current, log per-variant changes
    if (!se) {
      const variants = variantsQ.data ?? [];
      const wasDeducted = !!(orderQ.data as any)?.stock_deducted;
      const priorItems = wasDeducted ? ((orderQ.data as any)?.order_items ?? []) : [];
      const nowDeducting = DEDUCTING.has(order.status);
      const prevByV = new Map<string, number>();
      for (const p of priorItems as any[]) {
        if (!p.variant_id) continue;
        prevByV.set(p.variant_id, (prevByV.get(p.variant_id) ?? 0) + Number(p.quantity));
      }
      const wantByV = new Map<string, number>();
      if (nowDeducting) {
        for (const it of items) {
          if (!it.variant_id) continue;
          wantByV.set(it.variant_id, (wantByV.get(it.variant_id) ?? 0) + Number(it.quantity));
        }
      }
      const vids = new Set<string>([...prevByV.keys(), ...wantByV.keys()]);
      for (const vid of vids) {
        const delta = (wantByV.get(vid) ?? 0) - (prevByV.get(vid) ?? 0);
        if (delta === 0) continue;
        const v = variants.find((x: any) => x.id === vid) as any;
        const p = v ? (productsQ.data ?? []).find((x: any) => x.id === v.product_id) : null;
        const vLabel = v
          ? `${(p as any)?.name ?? ""}${v.size ? ` · ${v.size}` : ""}${v.color ? ` · ${v.color}` : ""}`
          : vid;
        const before = Number(v?.stock ?? 0) + (prevByV.get(vid) ?? 0);
        const after = before - (wantByV.get(vid) ?? 0);
        const inv = order.invoice_number ?? "";
        if (delta > 0) {
          logs.push({
            action: "stock_change",
            order_id: order.id,
            en: `Stock decreased from ${before} to ${after} for ${vLabel} due to Order #${inv}`,
            ar: `انخفض المخزون من ${before} إلى ${after} لـ ${vLabel} بسبب الطلب رقم ${inv}`,
          } as any);
        } else {
          logs.push({
            action: "stock_change",
            order_id: order.id,
            en: `Stock restored from ${before} to ${after} for ${vLabel} due to Order #${inv}`,
            ar: `استُعيد المخزون من ${before} إلى ${after} لـ ${vLabel} بسبب الطلب رقم ${inv}`,
          } as any);
        }
      }
    }

    if (logs.length > 0) await logActivityBatch(logs);

    toast.success(lang === "ar" ? "تم الحفظ بنجاح" : "Saved successfully");
    try {
      localStorage.removeItem(`boutq_draft_${brandId}_${id}`);
      localStorage.removeItem(`boutq_draft_${brandId}_new`);
    } catch {
      // ignore storage errors
    }
    setHasSavedDraft(true);
    setEditingUnlocked(false);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["order", id] });
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["variants"] });
    qc.invalidateQueries({ queryKey: ["activity_logs"] });
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/invoice/${order.public_invoice_token}`;
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
  };

  const printReceipt = () => {
    const settings: any = settingsQ.data ?? {};
    const LEGACY = new Set(["Abaya Atelier", "أباية أتيليه"]);
    const rawBrand = (settings.business_name ?? "").trim();
    const brand = !rawBrand || LEGACY.has(rawBrand) ? (lang === "ar" ? "بوتك" : "Boutq") : rawBrand;

    const paymentLabel = order.payment_method ? t(`payment.${order.payment_method}`) : "";
    const statusLabel = formatOrderStatus(order.status, order.fulfillment_method, lang);

    const ok = printThermalReceipt({
      brand,
      invoiceNumber: order.invoice_number,
      orderDate: order.order_date,
      status: statusLabel,
      customerName: getOrderCustomerName(order) || null,
      customerPhone: getOrderCustomerPhone(order) || null,
      paymentMethod: paymentLabel || null,
      items: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        customization_total: i.customization_total,
        line_total: i.line_total,
        customizations: i.customizations,
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxRate: Number(order.tax_rate ?? 0),
      taxAmount: totals.taxAmount,
      shipping: totals.shipping,
      total: totals.total,
      currency,
      lang,
      labels: {
        receipt: t("orders.printReceipt"),
        invoiceNumber: t("orders.invoice") + " #",
        date: t("orders.date"),
        status: t("orders.status"),
        payment: t("orderDetail.paymentMethod"),
        customer: t("orderDetail.customer"),
        item: t("orderDetail.description"),
        qty: t("orderDetail.qty"),
        price: t("orderDetail.unitPrice"),
        total: t("orderDetail.total"),
        subtotal: t("orderDetail.subtotal"),
        discount: t("orderDetail.discount"),
        vat: t("orderDetail.vat"),
        shipping: t("orderDetail.shipping"),
        grandTotal: t("orderDetail.grandTotal"),
        thankYou:
          settings.footer_note?.trim() ||
          (lang === "ar" ? "شكراً لتسوّقكم معنا" : "Thank you for your order"),
      },
      footerNote: null,
    });
    if (!ok) toast.error(t("orders.popupBlocked"));
  };

  const method = String(order?.payment_method || "").toLowerCase();
  const isCod = ["cash", "cod"].includes(method);
  const isUnpaid = (order?.payment_status ?? "unpaid") === "unpaid";
  const isPickup = String(order?.fulfillment_method || "").toLowerCase() === "pickup";

  const renderTopPrimaryAction = () => {
    if (isCreationMode || !order) return null;
    const workflow = getOrderWorkflow(order);

    if (workflow.nextAction === "pack_and_ship") {
      return (
        <Button
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  fulfillment_status: "ASSIGNED",
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(
                lang === "ar" ? "تم جاهزية الطلب وتعيينه للمندوب" : "Packed & Assigned to Courier",
              );
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(
                err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
              );
            }
          }}
        >
          <Truck className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تجهيز وتعيين المندوب" : "Pack & Assign"}
        </Button>
      );
    }

    if (workflow.nextAction === "confirm_pickup") {
      return (
        <Button
          className="bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  fulfillment_status: "SHIPPED",
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(
                lang === "ar"
                  ? "تم استلام الشحنة من المندوب وخرجت للتوصيل"
                  : "Courier picked up parcel - Out for Delivery",
              );
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(
                err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
              );
            }
          }}
        >
          <Truck className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تأكيد استلام المندوب (خرج للتوصيل)" : "Confirm Pickup (Start Transit)"}
        </Button>
      );
    }

    if (workflow.nextAction === "validate_payment") {
      return (
        <Button
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          disabled={approvingBenefit}
          onClick={approveBenefitPayment}
        >
          {approvingBenefit ? (
            <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
          ) : (
            <Receipt className="h-4 w-4 me-1.5" />
          )}
          {lang === "ar" ? "اعتماد دفع البنفت" : "Approve Benefit Payment"}
        </Button>
      );
    }

    if (workflow.nextAction === "mark_delivered" || workflow.nextAction === "collect_and_deliver") {
      return (
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  fulfillment_status: "COMPLETED",
                  status: "completed",
                  delivered_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(
                lang === "ar" ? "تم تسجيل تسليم الطلب وإتمامه" : "Order delivered & completed",
              );
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(
                err?.message ||
                  (lang === "ar" ? "تعذر إكمال التسليم" : "Unable to complete delivery"),
              );
            }
          }}
        >
          <CheckCircle2 className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تسليم الطلب" : "Mark Delivered"}
        </Button>
      );
    }

    if (workflow.nextAction === "prepare_pickup") {
      return (
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  fulfillment_status: "READY_FOR_PICKUP",
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(lang === "ar" ? "تم تجهيز الطلب للاستلام" : "Ready for pickup");
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(
                err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
              );
            }
          }}
        >
          <CheckCircle2 className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تجهيز للاستلام" : "Prepare for Pickup"}
        </Button>
      );
    }

    if (
      workflow.nextAction === "hand_over_pickup" ||
      workflow.nextAction === "collect_and_hand_over"
    ) {
      return (
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  fulfillment_status: "COMPLETED",
                  status: "completed",
                  delivered_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(lang === "ar" ? "تم تسليم الطلب للعميل" : "Handed over to customer");
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(
                err?.message ||
                  (lang === "ar" ? "تعذر إكمال التسليم" : "Unable to complete handover"),
              );
            }
          }}
        >
          <CheckCircle2 className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تسليم العميل" : "Hand Over"}
        </Button>
      );
    }

    return null;
  };

  const renderMobileActionBar = () => (
    <div
      className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3"
      aria-label={lang === "ar" ? "إجراءات الطلب" : "Order actions"}
    >
      {!isReadOnly && (isDirty || isCreationMode) ? (
        <Button
          onClick={save}
          disabled={saving}
          className="min-h-11 flex-1 rounded-xl font-bold shadow-md"
        >
          {saving ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="me-2 h-4 w-4" />
          )}
          {isCreationMode
            ? lang === "ar"
              ? "إنشاء وحفظ"
              : "Create & save"
            : lang === "ar"
              ? "حفظ التغييرات"
              : "Save changes"}
        </Button>
      ) : (
        <div className="flex min-w-0 flex-1 [&>button]:min-h-11 [&>button]:w-full [&>button]:rounded-xl">
          {renderTopPrimaryAction() || (
            <Button
              variant="outline"
              onClick={() => scrollToSection("sec-overview")}
              className="font-bold"
            >
              {lang === "ar" ? "عرض تفاصيل الطلب" : "Review order details"}
            </Button>
          )}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11 shrink-0 rounded-xl bg-card"
        onClick={() => setMobileActionsOpen(true)}
        aria-label={lang === "ar" ? "المزيد من إجراءات الطلب" : "More order actions"}
      >
        <MoreHorizontal className="h-5 w-5" />
      </Button>
    </div>
  );

  return (
    <div
      className="mx-auto max-w-[1500px] space-y-3 p-1 pb-24 sm:space-y-4 sm:p-2 sm:pb-20 animate-fade-in"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      <div className="no-print mb-2 flex items-center justify-between gap-2.5 rounded-2xl border border-border/60 bg-card/70 px-3 py-2.5 shadow-sm backdrop-blur sm:mb-4 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/admin/b/$slug/orders"
            params={{ slug }}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />{" "}
            <span className="hidden sm:inline">{t("orderDetail.back")}</span>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base sm:text-2xl font-display font-bold tracking-tight">
              {isCreationMode
                ? lang === "ar"
                  ? "طلب جديد"
                  : "New order"
                : `${lang === "ar" ? "الطلب" : "Order"} #${order.invoice_number ?? order.id}`}
            </h1>
          </div>
        </div>

        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          {!isCreationMode && (
            <>
              {/* Primary Next Workflow Quick Action (e.g. Approve Payment, Hand Over, Pack & Ship) */}
              {renderTopPrimaryAction()}

              {/* Copy Link button on all screen sizes */}
              {order.public_invoice_token && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyLink}
                  className="h-9 px-3 text-xs font-semibold shadow-2xs hover:bg-accent"
                >
                  <LinkIcon className="h-3.5 w-3.5 me-1 text-muted-foreground" />
                  <span>{t("orders.copyLink")}</span>
                </Button>
              )}

              <div className="hidden sm:flex items-center gap-2">
                <SendInvoiceDialog
                  order={order}
                  totals={totals}
                  settings={settingsQ.data}
                  currency={currency}
                />
                <ResendConfirmationEmailButton
                  order={order}
                  lang={lang}
                  onDone={() => qc.invalidateQueries({ queryKey: ["order", id] })}
                />
                <Button
                  variant="outline"
                  onClick={printReceipt}
                  className="shadow-xs transition-all hover:bg-accent"
                >
                  <Receipt className="h-4 w-4 me-1.5 text-muted-foreground" />{" "}
                  {t("orders.printReceipt")}
                </Button>
                <Button
                  variant="outline"
                  className="shadow-xs transition-all hover:bg-accent"
                  onClick={async () => {
                    try {
                      const el = document.querySelector<HTMLElement>(".printable-invoice");
                      const { downloadInvoicePdf } = await import("@/lib/download-invoice-pdf");
                      await downloadInvoicePdf(el, `invoice-${order.invoice_number ?? order.id}`);
                    } catch (err) {
                      console.error("PDF download failed", err);
                      toast.error(
                        (err as Error)?.message ??
                          (lang === "ar" ? "فشل تحميل ملف PDF" : "PDF download failed"),
                      );
                    }
                  }}
                >
                  <Printer className="h-4 w-4 me-1.5 text-muted-foreground" /> {t("orders.printA4")}
                </Button>
              </div>
            </>
          )}

          {/* Lock / Unlock or Save button */}
          {isReadOnly ? (
            isAdmin && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setEditingUnlocked(true)}
                className="shadow-sm font-semibold bg-primary hover:bg-primary/90"
              >
                <Unlock className="h-4 w-4 me-1.5" />
                {lang === "ar" ? "فتح للتعديل" : "Unlock for editing"}
              </Button>
            )
          ) : (
            <Button
              onClick={save}
              disabled={saving}
              size="sm"
              className={cn("shadow-sm transition-all font-bold", isCreationMode ? "min-w-32" : "")}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 me-1.5" />
              )}
              {isCreationMode ? (lang === "ar" ? "إنشاء وحفظ" : "Create & Save") : t("common.save")}
            </Button>
          )}
        </div>
      </div>

      {isReadOnly && (
        <div className="no-print mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="h-4 w-4 shrink-0" />
          {lang === "ar"
            ? "هذا طلب مغلق. الحقول مقفلة لحماية السجل التاريخي."
            : "This order is closed. Fields are locked to protect its history."}
        </div>
      )}

      {!isCreationMode && (
        <section
          className="no-print overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.04] p-4 shadow-sm sm:hidden"
          aria-label={lang === "ar" ? "ملخص الطلب" : "Order summary"}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {lang === "ar" ? "الإجمالي" : "Order total"}
              </p>
              <p className="mt-1 font-display text-2xl font-extrabold tracking-tight">
                {formatMoney(totals.total, currency)}
              </p>
            </div>
            <div className="flex max-w-[55%] flex-wrap justify-end gap-1.5">
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-bold",
                  PAYMENT_BADGE_CLASSES[paymentBadge],
                )}
              >
                {t(`payStatus.${paymentBadge}`)}
              </span>
              <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-bold text-foreground">
                {getFulfillmentLabel(order.fulfillment_status, lang)}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
            <div className="min-w-0 rounded-xl bg-background/60 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <UserRound className="h-3.5 w-3.5" />
                {lang === "ar" ? "العميل" : "Customer"}
              </div>
              <p className="mt-1 truncate text-sm font-bold">
                {getOrderCustomerName(order) || (lang === "ar" ? "عميل زائر" : "Guest customer")}
              </p>
            </div>
            <div className="min-w-0 rounded-xl bg-background/60 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {lang === "ar" ? "التنفيذ" : "Fulfillment"}
              </div>
              <p className="mt-1 truncate text-sm font-bold">
                {getFulfillmentMethodLabel(order.fulfillment_method, lang)}
              </p>
            </div>
          </div>
          {renderMobileActionBar()}
        </section>
      )}

      {/* Sticky Section Navigation Bar */}
      {!isCreationMode && (
        <div className="no-print sticky top-0 z-30 mb-3 grid grid-cols-4 gap-1 rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-sm backdrop-blur select-none sm:mb-6 sm:flex sm:overflow-x-auto sm:gap-2 sm:rounded-xl">
          <button
            type="button"
            onClick={() => scrollToSection("sec-overview")}
            className={cn(
              "min-h-11 justify-center rounded-xl px-1.5 py-1.5 text-[10px] font-bold transition-colors flex flex-col sm:flex-row items-center gap-1 sm:px-3.5 sm:text-xs sm:whitespace-nowrap touch-manipulation",
              activeSection === "sec-overview"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "hover:bg-muted text-muted-foreground",
            )}
          >
            <UserRound className="h-3.5 w-3.5" />
            <span>{lang === "ar" ? "نظرة عامة" : "Overview"}</span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("sec-items")}
            className={cn(
              "min-h-11 justify-center rounded-xl px-1.5 py-1.5 text-[10px] font-bold transition-colors flex flex-col sm:flex-row items-center gap-1 sm:px-3.5 sm:text-xs sm:whitespace-nowrap touch-manipulation",
              activeSection === "sec-items"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "hover:bg-muted text-muted-foreground",
            )}
          >
            <Package className="h-3.5 w-3.5" />
            <span>{lang === "ar" ? "المنتجات" : "Items"}</span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("sec-invoice")}
            className={cn(
              "min-h-11 justify-center rounded-xl px-1.5 py-1.5 text-[10px] font-bold transition-colors flex flex-col sm:flex-row items-center gap-1 sm:px-3.5 sm:text-xs sm:whitespace-nowrap touch-manipulation",
              activeSection === "sec-invoice"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "hover:bg-muted text-muted-foreground",
            )}
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>{lang === "ar" ? "الفاتورة" : "Invoice"}</span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("sec-activity")}
            className={cn(
              "min-h-11 justify-center rounded-xl px-1.5 py-1.5 text-[10px] font-bold transition-colors flex flex-col sm:flex-row items-center gap-1 sm:px-3.5 sm:text-xs sm:whitespace-nowrap touch-manipulation",
              activeSection === "sec-activity"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "hover:bg-muted text-muted-foreground",
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            <span>{lang === "ar" ? "المزيد" : "More"}</span>
          </button>
        </div>
      )}

      {/* Editor - hidden on print */}
      <fieldset
        disabled={isReadOnly}
        className="no-print m-0 min-w-0 border-0 p-0 disabled:opacity-80"
      >
        <div className="mb-6 grid grid-cols-1 items-start gap-3 sm:gap-6 lg:grid-cols-3">
          {/* RIGHT COLUMN (35% width) - Customer, Address & Workflow Controls */}
          <div className="space-y-3 sm:space-y-6 lg:col-span-1">
            <Card
              id="sec-overview"
              className="scroll-mt-24 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-sm sm:bg-card/40 sm:p-6 sm:shadow-lg"
            >
              <div className="mb-4">
                <Label className="flex items-center gap-2">
                  <Search className="h-3 w-3" /> {t("customers.searchByPhone")}
                </Label>
                <Input
                  className="text-start"
                  placeholder={t("customers.searchByPhonePh")}
                  value={phoneSearch}
                  onChange={(e) => {
                    const q = e.target.value;
                    setPhoneSearch(q);
                    const digits = q.replace(/\D/g, "");
                    if (digits.length < 3) return;
                    const match = (customersQ.data ?? []).find((c: any) =>
                      (c.phone ?? "").replace(/\D/g, "").includes(digits),
                    );
                    if (match) {
                      const def =
                        (addressesQ.data ?? []).find(
                          (a) => a.customer_id === match.id && a.is_default,
                        ) ?? (addressesQ.data ?? []).find((a) => a.customer_id === match.id);
                      setOrder({
                        ...order,
                        customer_id: match.id,
                        shipping_address_id: def?.id ?? null,
                      });
                    }
                  }}
                />
                {phoneSearch.replace(/\D/g, "").length >= 3 &&
                  !(customersQ.data ?? []).some((c: any) =>
                    (c.phone ?? "").replace(/\D/g, "").includes(phoneSearch.replace(/\D/g, "")),
                  ) && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      {t("customers.noMatch")}
                    </p>
                  )}
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>{t("orderDetail.customer")}</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px] font-semibold text-primary"
                      onClick={() => setNewCustomerOpen(true)}
                    >
                      <Plus className="h-3 w-3 me-1" />
                      {lang === "ar" ? "زبون جديد" : "New Customer"}
                    </Button>
                  </div>
                  <Select
                    value={order.customer_id ?? "none"}
                    onValueChange={(v) => {
                      const cid = v === "none" ? null : v;
                      const def = cid
                        ? ((addressesQ.data ?? []).find(
                            (a) => a.customer_id === cid && a.is_default,
                          ) ?? (addressesQ.data ?? []).find((a) => a.customer_id === cid))
                        : null;
                      setOrder({
                        ...order,
                        customer_id: cid,
                        shipping_address_id: def?.id ?? null,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("orderDetail.noCustomerOption")}</SelectItem>
                      {(customersQ.data ?? []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.phone ? ` — ${c.phone}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {order.customer_id &&
                (() => {
                  const selected = (customersQ.data ?? []).find(
                    (c: any) => c.id === order.customer_id,
                  );
                  if (!selected) return null;
                  const customerAddrs = (addressesQ.data ?? []).filter(
                    (a) => a.customer_id === order.customer_id,
                  );
                  const legacyLines = formatDeliveryAddress(selected, lang);
                  return (
                    <div className="mt-4 pt-4 border-t border-border text-start">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                        {order.fulfillment_method === "digital"
                          ? lang === "ar"
                            ? "بيانات العميل"
                            : "Customer details"
                          : t("orderDetail.deliveryAddress")}
                      </p>
                      <p className="font-medium">{selected.name}</p>
                      {selected.email && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 break-all">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <a href={`mailto:${selected.email}`} className="hover:underline">
                            {selected.email}
                          </a>
                        </p>
                      )}
                      {selected.phone && (
                        <p className="text-sm text-muted-foreground">{selected.phone}</p>
                      )}
                      {order.fulfillment_method === "delivery" &&
                      legacyLines.length > 0 &&
                      customerAddrs.length === 0
                        ? legacyLines.map((line, index) => (
                            <p key={index} className="text-sm text-muted-foreground">
                              {line}
                            </p>
                          ))
                        : null}
                    </div>
                  );
                })()}
              {(() => {
                const method = order.fulfillment_method ?? "delivery";
                const deliveryEnabled = Boolean((settingsQ.data as any).delivery_enabled);
                const pickupEnabled = Boolean((settingsQ.data as any).pickup_enabled);
                const digitalEnabled = Boolean((settingsQ.data as any).digital_delivery_enabled);
                const defaultDeliveryFee = Number((settingsQ.data as any).delivery_fee ?? 0);
                const selectedCustomer = (customersQ.data ?? []).find(
                  (c: any) => c.id === order.customer_id,
                );
                const selectedAddress = (addressesQ.data ?? []).find(
                  (a) => a.id === order.shipping_address_id,
                );
                const storedAddressSnapshot = (order as any)
                  .delivery_address_snapshot as StructuredAddress | null;
                const snapshotMatchesSavedSelection =
                  storedAddressSnapshot &&
                  (!order.shipping_address_id ||
                    !storedAddressSnapshot.id ||
                    storedAddressSnapshot.id === order.shipping_address_id);
                const addressSnapshot =
                  (snapshotMatchesSavedSelection ? storedAddressSnapshot : null) ??
                  selectedAddress ??
                  storedAddressSnapshot ??
                  (selectedCustomer as StructuredAddress | null);
                const selectedBranch = (branchesQ.data ?? []).find(
                  (b: any) => b.id === order.branch_id,
                );
                const address = selectedAddress
                  ? formatAddressLine(selectedAddress as StructuredAddress, lang)
                  : formatDeliveryAddress(selectedCustomer, lang).join("، ");
                const branchName = selectedBranch
                  ? lang === "ar"
                    ? selectedBranch.name_ar || selectedBranch.name_en
                    : selectedBranch.name_en || selectedBranch.name_ar
                  : null;
                const branchLocation = selectedBranch
                  ? lang === "ar"
                    ? selectedBranch.location_ar || selectedBranch.location_en
                    : selectedBranch.location_en || selectedBranch.location_ar
                  : null;
                const customerAddresses = (addressesQ.data ?? []).filter(
                  (item) => item.customer_id === order.customer_id,
                );
                const defaultAddress =
                  customerAddresses.find((item) => item.is_default) ?? customerAddresses[0] ?? null;
                const title =
                  method === "digital"
                    ? lang === "ar"
                      ? "تسليم رقمي"
                      : "Digital delivery"
                    : method === "pickup"
                      ? lang === "ar"
                        ? "استلام من الفرع"
                        : "Pickup from branch"
                      : lang === "ar"
                        ? "توصيل"
                        : "Delivery";
                return (
                  <div className="mt-5 overflow-hidden rounded-xl border bg-muted/20 text-start shadow-sm">
                    <div className="flex flex-col gap-3 border-b bg-muted/50 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {lang === "ar" ? "طريقة التسليم" : "Fulfillment"}
                        </p>
                        <p className="text-lg font-semibold">{title}</p>
                      </div>
                      <div className="w-full sm:w-64">
                        <Label className="sr-only">
                          {lang === "ar" ? "طريقة التسليم" : "Fulfillment method"}
                        </Label>
                        <Select
                          value={method}
                          onValueChange={(value) =>
                            setOrder({
                              ...order,
                              fulfillment_method: value,
                              branch_id: value === "pickup" ? (order.branch_id ?? null) : null,
                              shipping_address_id:
                                value === "delivery"
                                  ? (order.shipping_address_id ?? defaultAddress?.id ?? null)
                                  : null,
                              shipping:
                                value === "delivery"
                                  ? isCreationMode
                                    ? defaultDeliveryFee
                                    : Number(order.shipping ?? defaultDeliveryFee)
                                  : 0,
                            })
                          }
                        >
                          <SelectTrigger className="bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(pickupEnabled || method === "pickup") && (
                              <SelectItem value="pickup">
                                {lang === "ar" ? "استلام من الفرع" : "Pickup from Branch"}
                              </SelectItem>
                            )}
                            {(deliveryEnabled || method === "delivery") && (
                              <SelectItem value="delivery">
                                {lang === "ar" ? "توصيل للمنزل" : "Home Delivery"}
                              </SelectItem>
                            )}
                            {(digitalEnabled || method === "digital") && (
                              <SelectItem value="digital">
                                {lang === "ar" ? "تسليم رقمي" : "Digital Delivery"}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="p-4">
                      {method === "delivery" && isAdmin && (
                        <div className="mb-4 space-y-3 rounded-lg border bg-background p-3">
                          <Label>
                            {lang === "ar" ? "مندوب التوصيل المسند" : "Assigned courier"}
                          </Label>
                          <Select
                            value={order.assigned_to ?? "unassigned"}
                            onValueChange={assignCourier}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">
                                {lang === "ar" ? "غير مسند" : "Unassigned"}
                              </SelectItem>
                              {(couriersQ.data ?? []).map((courier: any) => (
                                <SelectItem key={courier.id} value={courier.id}>
                                  {courier.name || courier.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {(() => {
                            if (!order.assigned_to) return null;
                            const assignedCourierObj = (couriersQ.data ?? []).find(
                              (c: any) => c.id === order.assigned_to,
                            );
                            const notifiedAgo = formatNotifiedTimeAgo(
                              (order as any).courier_notified_at,
                              lang,
                            );
                            return (
                              <div className="space-y-2 pt-2 border-t">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  {notifiedAgo ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800 text-[11px] font-bold px-2.5 py-1">
                                      🔔{" "}
                                      {lang === "ar"
                                        ? `تم الإشعار (${notifiedAgo})`
                                        : `Notified ${notifiedAgo}`}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800 text-[11px] font-bold px-2.5 py-1">
                                      ⏳{" "}
                                      {lang === "ar"
                                        ? "لم يتم الإشعار عبر واتساب بعد"
                                        : "WhatsApp notification pending"}
                                    </span>
                                  )}

                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 shadow-sm flex items-center gap-1.5"
                                    onClick={() => setWaModalOpen(true)}
                                  >
                                    📱{" "}
                                    {lang === "ar"
                                      ? `إشعار ${assignedCourierObj?.name ? assignedCourierObj.name.split(" ")[0] : "المندوب"} عبر واتساب`
                                      : `Notify ${assignedCourierObj?.name ? assignedCourierObj.name.split(" ")[0] : "Courier"} on WhatsApp`}
                                  </Button>
                                </div>
                              </div>
                            );
                          })()}

                          <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
                            <span className="text-muted-foreground">
                              {lang === "ar" ? "حالة التوصيل:" : "Delivery status:"}
                            </span>
                            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                              {getFulfillmentLabel(order.fulfillment_status, lang)}
                            </span>
                            {order.payment_method === "cod" && (
                              <span
                                className={`rounded-full px-2.5 py-1 font-medium ${order.cod_collected_at ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                              >
                                {order.cod_collected_at
                                  ? `${lang === "ar" ? "تم استلام النقد" : "Cash received"}: ${formatMoney(Number(order.cod_collected_amount || 0), order.currency || "BHD")}`
                                  : lang === "ar"
                                    ? "النقد بانتظار التحصيل"
                                    : "Cash collection pending"}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {method === "digital" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label>{lang === "ar" ? "قناة التسليم" : "Delivery channel"}</Label>
                            <Select
                              value={order.digital_delivery_channel ?? "email"}
                              onValueChange={(value) =>
                                setOrder({ ...order, digital_delivery_channel: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="email">
                                  {lang === "ar" ? "البريد الإلكتروني" : "Email"}
                                </SelectItem>
                                <SelectItem value="whatsapp">
                                  {lang === "ar" ? "واتساب" : "WhatsApp"}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>
                              {order.digital_delivery_channel === "whatsapp"
                                ? lang === "ar"
                                  ? "رقم أو معرّف واتساب"
                                  : "WhatsApp number or user ID"
                                : lang === "ar"
                                  ? "البريد الإلكتروني"
                                  : "Email address"}
                            </Label>
                            <Input
                              dir="ltr"
                              value={order.digital_delivery_contact ?? ""}
                              onChange={(e) =>
                                setOrder({ ...order, digital_delivery_contact: e.target.value })
                              }
                            />
                          </div>
                        </div>
                      ) : method === "pickup" ? (
                        <div className="space-y-2">
                          <Label>{lang === "ar" ? "فرع الاستلام" : "Pickup location"}</Label>
                          <Select
                            value={order.branch_id ?? ""}
                            onValueChange={(branchId) =>
                              setOrder({ ...order, branch_id: branchId })
                            }
                          >
                            <SelectTrigger className="text-start">
                              <SelectValue
                                placeholder={lang === "ar" ? "اختر الفرع" : "Select a branch"}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {(branchesQ.data ?? []).map((branch: any) => {
                                const name =
                                  lang === "ar"
                                    ? branch.name_ar || branch.name_en
                                    : branch.name_en || branch.name_ar;
                                const location =
                                  lang === "ar"
                                    ? branch.location_ar || branch.location_en
                                    : branch.location_en || branch.location_ar;
                                return (
                                  <SelectItem key={branch.id} value={branch.id}>
                                    {name}
                                    {location ? ` — ${location}` : ""}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {selectedBranch && (
                            <p className="text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">{branchName}</span>
                              {branchLocation ? ` — ${branchLocation}` : ""}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="grid gap-4 grid-cols-1">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Label>{lang === "ar" ? "عنوان التوصيل" : "Delivery address"}</Label>
                              {defaultAddress && (
                                <button
                                  type="button"
                                  className="text-xs font-medium text-primary hover:underline"
                                  onClick={() =>
                                    setOrder({ ...order, shipping_address_id: defaultAddress.id })
                                  }
                                >
                                  {lang === "ar"
                                    ? "استخدام عنوان ملف العميل"
                                    : "Use Customer Profile Address"}
                                </button>
                              )}
                            </div>
                            <Select
                              value={order.shipping_address_id ?? ""}
                              onValueChange={(addressId) =>
                                setOrder({ ...order, shipping_address_id: addressId })
                              }
                            >
                              <SelectTrigger className="text-start">
                                <SelectValue
                                  placeholder={lang === "ar" ? "اختر عنواناً" : "Select an address"}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {customerAddresses.map((savedAddress) => (
                                  <SelectItem key={savedAddress.id} value={savedAddress.id}>
                                    {savedAddress.label || t("customers.address")}
                                    {savedAddress.is_default ? " ★" : ""} —{" "}
                                    {formatAddressLine(savedAddress as StructuredAddress, lang) ||
                                      "—"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {addressSnapshot && (
                              <DeliveryAddressCard
                                address={addressSnapshot}
                                lang={lang}
                                compact
                                showLabel={false}
                              />
                            )}
                            <p className="hidden text-sm text-muted-foreground">
                              {address ||
                                (lang === "ar"
                                  ? "لا يوجد عنوان توصيل محفوظ لهذا العميل"
                                  : "No saved delivery address for this customer")}
                            </p>
                          </div>
                          <div>
                            <Label>{lang === "ar" ? "رسوم التوصيل" : "Delivery fee"}</Label>
                            <BhdFeeInput
                              value={Number(order.shipping ?? 0)}
                              disabled={isReadOnly}
                              onChange={(shipping) => setOrder({ ...order, shipping })}
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatMoney(Number(order.shipping ?? 0), order.currency ?? "BHD")}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              <div className="mt-4 grid grid-cols-1 gap-4">
                <div>
                  <Label>{t("orderDetail.notes")}</Label>
                  <Textarea
                    value={order.notes ?? ""}
                    onChange={(e) => setOrder({ ...order, notes: e.target.value })}
                    rows={3}
                    placeholder={lang === "ar" ? "ملاحظات داخلية للطلب" : "Internal order notes"}
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-bold mb-1.5">
                    <Truck className="h-4 w-4" />
                    {lang === "ar"
                      ? "ملاحظات التوصيل وسجل السائق"
                      : "Courier Delivery Notes & Trace"}
                  </Label>
                  <Textarea
                    value={order.delivery_notes ?? ""}
                    onChange={(e) => setOrder({ ...order, delivery_notes: e.target.value })}
                    rows={3}
                    placeholder={
                      lang === "ar"
                        ? "ملاحظات السائق وسجل التوصيل"
                        : "Driver notes and courier logs"
                    }
                    className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 font-mono text-xs"
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* LEFT COLUMN (65% width) - Products, Line Items & Notes */}
          <div className="space-y-3 sm:space-y-6 lg:col-span-2">
            <Card
              id="sec-items"
              className="scroll-mt-24 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-sm sm:bg-card/40 sm:p-6 sm:shadow-lg"
            >
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <h3 className="font-display text-lg">{t("orderDetail.lineItems")}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground font-semibold"
                    onClick={() => setProductSearchOpen(true)}
                  >
                    <Search className="h-3.5 w-3.5 me-1.5" />
                    {lang === "ar" ? "بحث المنتجات والـ SKU" : "Search Products & SKUs"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={openBarcodeScanner}>
                    <ScanLine className="h-3.5 w-3.5 me-1.5" />
                    {lang === "ar" ? "مسح الباركود" : "Scan Barcode"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={addItem}>
                    <Plus className="h-3.5 w-3.5 me-1.5" /> {t("orderDetail.addLine")}
                  </Button>
                </div>
              </div>
              {items.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("orderDetail.noLines")}</p>
              )}
              <div className="space-y-3">
                {items.map((it, idx) => {
                  const variant = it.variant_id
                    ? (variantsQ.data ?? []).find((x: any) => x.id === it.variant_id)
                    : null;
                  const product =
                    (variant
                      ? productsQ.data?.find((x: any) => x.id === (variant as any).product_id)
                      : null) ??
                    (it.product_id
                      ? (productsQ.data ?? []).find((x: any) => x.id === it.product_id)
                      : null) ??
                    (productsQ.data ?? []).find((x: any) =>
                      it.description && x.name
                        ? String(it.description)
                            .trim()
                            .toLowerCase()
                            .includes(String(x.name).trim().toLowerCase()) ||
                          String(x.name)
                            .trim()
                            .toLowerCase()
                            .includes(String(it.description).trim().toLowerCase())
                        : false,
                    );

                  const getMediaUrl = (obj: any) => {
                    if (!obj) return null;
                    if (typeof obj.image_url === "string" && obj.image_url) return obj.image_url;
                    if (typeof obj.image === "string" && obj.image) return obj.image;
                    if (Array.isArray(obj.images) && obj.images[0]) return obj.images[0];
                    if (Array.isArray(obj.media) && obj.media[0]) {
                      const m = obj.media[0];
                      return typeof m === "string" ? m : m.url || m.poster_url || null;
                    }
                    return null;
                  };

                  const imageUrl = getMediaUrl(variant) || getMediaUrl(product);
                  const sku = (variant as any)?.sku || (product as any)?.sku;
                  const mainStock = Number((variant as any)?.stock_main ?? 0);
                  const incStock = Number((variant as any)?.stock_incubator ?? 0);
                  const isAr = lang === "ar";
                  return (
                    <div
                      key={idx}
                      className="space-y-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-xs transition-all"
                    >
                      {/* Item Thumbnail & SKU Header */}
                      <div className="flex items-center gap-3 pb-2.5 border-b border-border/60">
                        <div className="h-12 w-12 rounded-lg border bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={it.description || ""}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm truncate text-foreground">
                            {it.description ||
                              (product?.name ?? (isAr ? "منتج مخصص" : "Custom Item"))}
                          </p>
                          {sku ? (
                            <span className="inline-flex items-center text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-muted/80 text-muted-foreground border border-border/60 mt-1">
                              SKU: {sku}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              {variant
                                ? `${variant.size || ""} ${variant.color || ""}`.trim() ||
                                  (isAr ? "متغير" : "Variant")
                                : isAr
                                  ? "بند مخصص"
                                  : "Custom Line"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        <div className="sm:col-span-4">
                          <Label>{t("orderDetail.fromInventory")}</Label>
                          <Select
                            value={it.variant_id ?? "custom"}
                            onValueChange={(v) => v !== "custom" && pickVariant(idx, v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t("orderDetail.pickVariant")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="custom">{t("orderDetail.customLine")}</SelectItem>
                              {(variantsQ.data ?? []).map((v: any) => {
                                const p = productsQ.data?.find((x: any) => x.id === v.product_id);
                                if (!p) return null;
                                return (
                                  <SelectItem key={v.id} value={v.id}>
                                    {p.name} {v.size ? `· ${v.size}` : ""}{" "}
                                    {v.color ? `· ${v.color}` : ""} —{" "}
                                    {formatMoney(v.selling_price, currency)}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-3">
                          <Label>{t("orderDetail.description")}</Label>
                          <Textarea
                            rows={3}
                            value={it.description}
                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                            className="text-sm leading-snug"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label>{t("orderDetail.qty")}</Label>
                          <Input
                            type="number"
                            min={1}
                            className="min-w-[70px] text-center"
                            value={it.quantity}
                            onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <Label>{t("orderDetail.unitPrice")}</Label>
                          <Input
                            type="number"
                            step="0.001"
                            value={it.unit_price}
                            onChange={(e) =>
                              updateItem(idx, { unit_price: Number(e.target.value) })
                            }
                          />
                          {Number(it.original_price ?? (variant as any)?.original_price ?? 0) >
                            Number(it.unit_price) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {isAr ? "السعر الأصلي" : "Original"}:{" "}
                              <span className="line-through">
                                {formatMoney(
                                  Number(it.original_price ?? (variant as any)?.original_price),
                                  currency,
                                )}
                              </span>
                              <span className="mx-1">·</span>
                              {isAr ? "سعر التخفيض" : "Sale"}:{" "}
                              <span className="font-medium text-foreground">
                                {formatMoney(it.unit_price, currency)}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      {it.variant_id && (
                        <div>
                          <Label className="text-xs">
                            {isAr ? "الموقع (خصم من)" : "Location (deduct from)"}
                          </Label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {(
                              [
                                {
                                  key: "main",
                                  en: `Direct Sales · Main (${mainStock})`,
                                  ar: `الرئيسي (${mainStock})`,
                                },
                                {
                                  key: "incubator",
                                  en: `Incubator (${incStock})`,
                                  ar: `الحاضنة (${incStock})`,
                                },
                              ] as const
                            ).map((opt) => {
                              const active = it.location === opt.key;
                              return (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() => updateItem(idx, { location: opt.key })}
                                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                    active
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "border-border hover:bg-secondary"
                                  }`}
                                >
                                  {isAr ? opt.ar : opt.en}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {(it.selected_variant ||
                        (it.custom_field_values && it.custom_field_values.length > 0)) && (
                        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
                          <div className="font-medium text-sm">
                            {isAr ? "اختيارات العميل" : "Customer selections"}
                          </div>
                          {it.selected_variant && (
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {it.selected_variant.size && (
                                <span>
                                  <b>{isAr ? "المقاس" : "Size"}:</b> {it.selected_variant.size}
                                </span>
                              )}
                              {it.selected_variant.color && (
                                <span>
                                  <b>{isAr ? "اللون" : "Color"}:</b> {it.selected_variant.color}
                                </span>
                              )}
                              {it.selected_variant.fabric && (
                                <span>
                                  <b>{isAr ? "القماش" : "Fabric"}:</b> {it.selected_variant.fabric}
                                </span>
                              )}
                            </div>
                          )}
                          {it.custom_field_values && it.custom_field_values.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 pt-1">
                              {it.custom_field_values.map((cf, i) => (
                                <div key={i}>
                                  <b>
                                    {isAr
                                      ? cf.label_ar || cf.label_en || cf.key
                                      : cf.label_en || cf.label_ar || cf.key}
                                    :
                                  </b>{" "}
                                  {cf.value.startsWith("http") ? (
                                    <div className="inline-flex flex-col gap-1 mt-1">
                                      <a
                                        href={cf.value}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-primary hover:underline font-semibold inline-flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded"
                                      >
                                        📎 {isAr ? "تحميل/عرض الملف" : "View Uploaded File"}
                                      </a>
                                      {/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(cf.value) && (
                                        <img
                                          src={cf.value}
                                          alt=""
                                          className="mt-1 max-h-24 rounded border object-contain bg-background"
                                        />
                                      )}
                                    </div>
                                  ) : (
                                    cf.value
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div>
                        <Label className="text-xs">{t("orderDetail.customizations")}</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {(customQ.data ?? []).map((c: any) => {
                            const active = it.customizations.some((x) => x.name === c.name);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() =>
                                  toggleCustom(idx, {
                                    name: c.name,
                                    price_delta: Number(c.price_delta),
                                  })
                                }
                                className={`text-xs px-2 py-1 rounded-full border ${active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}
                              >
                                {c.name} +{formatMoney(c.price_delta, currency)}
                              </button>
                            );
                          })}
                          {(customQ.data ?? []).length === 0 && (
                            <span className="text-xs text-muted-foreground">
                              {t("orderDetail.addonsHint")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <span className="text-sm text-muted-foreground">
                          {t("orderDetail.lineTotal")}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-medium">
                            {formatMoney(it.line_total, currency)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setItems(items.filter((_, i) => i !== idx))}
                            aria-label={lang === "ar" ? "حذف بند الطلب" : "Remove order item"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <BarcodeScanner
                open={scannerOpen}
                onOpenChange={setScannerOpen}
                onDetected={handleScanned}
                cameraStreamPromise={cameraStreamPromise}
              />
            </Card>

            <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-5 sm:p-6 space-y-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div>
                    <Label>{t("orderDetail.orderDate")}</Label>
                    <Input
                      type="date"
                      value={order.order_date}
                      onChange={(e) => setOrder({ ...order, order_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{t("orderDetail.status")}</Label>
                    <Select
                      value={order.status}
                      onValueChange={(status) => {
                        const updatedFulfillment =
                          status === "completed"
                            ? "COMPLETED"
                            : status === "cancelled"
                              ? "CANCELLED"
                              : order.fulfillment_status;
                        setOrder({ ...order, status, fulfillment_status: updatedFulfillment });
                      }}
                    >
                      <SelectTrigger aria-label={lang === "ar" ? "حالة الطلب" : "Order status"}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">{t("status.draft")}</SelectItem>
                        <SelectItem value="confirmed">{t("status.confirmed")}</SelectItem>
                        <SelectItem value="completed">{t("status.completed")}</SelectItem>
                        <SelectItem value="cancelled">{t("status.cancelled")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-1">
                    <Label>{t("orderDetail.paymentMethod")}</Label>
                    <Select
                      value={order.payment_method ?? "none"}
                      onValueChange={(payment_method) =>
                        setOrder({
                          ...order,
                          payment_method: payment_method === "none" ? null : payment_method,
                        })
                      }
                    >
                      <SelectTrigger aria-label={lang === "ar" ? "طريقة الدفع" : "Payment method"}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("orderDetail.selectPayment")}</SelectItem>
                        <SelectItem value="cash">{t("payment.cash")}</SelectItem>
                        <SelectItem value="card">{t("payment.card")}</SelectItem>
                        <SelectItem value="bank_transfer">{t("payment.bank_transfer")}</SelectItem>
                        <SelectItem value="benefit">{t("payment.benefit")}</SelectItem>
                        <SelectItem value="apple_pay">{t("payment.apple_pay")}</SelectItem>
                        <SelectItem value="google_pay">{t("payment.google_pay")}</SelectItem>
                        <SelectItem value="cod">{t("payment.cod")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="lg:hidden">
                  <Label>{t("orderDetail.notes")}</Label>
                  <Textarea
                    value={order.notes ?? ""}
                    onChange={(e) => setOrder({ ...order, notes: e.target.value })}
                    rows={5}
                  />
                </div>
                <div className="space-y-3">
                  {order.payment_method === "benefit" && order.benefit_receipt_key && (
                    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <ImageIcon className="h-5 w-5" />
                          <span className="font-semibold">
                            {lang === "ar" ? "إيصال تحويل بنفت" : "Benefit transfer receipt"}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${order.payment_status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-200 text-amber-900"}`}
                        >
                          {order.payment_status === "paid"
                            ? lang === "ar"
                              ? "تم التحقق"
                              : "Verified"
                            : lang === "ar"
                              ? "بانتظار التحقق"
                              : "Pending verification"}
                        </span>
                      </div>
                      {receiptViewQ.isLoading ? (
                        <div className="flex h-52 items-center justify-center rounded-lg border bg-white">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : receiptViewQ.data?.url ? (
                        <a
                          href={receiptViewQ.data.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-lg border bg-white"
                        >
                          <img
                            src={receiptViewQ.data.url}
                            alt="Benefit payment receipt"
                            className="h-52 w-full object-contain"
                          />
                        </a>
                      ) : (
                        <div className="rounded-lg border bg-white p-5 text-center text-sm text-muted-foreground">
                          {order.benefit_receipt_deleted_at
                            ? lang === "ar"
                              ? "تم حذف صورة الإيصال حسب سياسة الاحتفاظ."
                              : "Receipt image removed under the retention policy."
                            : lang === "ar"
                              ? "تعذر تحميل صورة الإيصال الخاصة."
                              : "The private receipt could not be loaded."}
                        </div>
                      )}
                      {order.payment_status !== "paid" && (
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Button
                            type="button"
                            className="bg-emerald-700 text-white hover:bg-emerald-800"
                            onClick={approveBenefitPayment}
                            disabled={approvingBenefit || rejectingBenefit}
                          >
                            {approvingBenefit ? (
                              <Loader2 className="me-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="me-2 h-4 w-4" />
                            )}
                            {lang === "ar" ? "اعتماد الدفع" : "Approve Payment"}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => setRejectReasonOpen(true)}
                            disabled={approvingBenefit || rejectingBenefit}
                          >
                            {rejectingBenefit && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                            {lang === "ar" ? "رفض الإيصال" : "Reject Receipt"}
                          </Button>
                        </div>
                      )}
                      <Dialog
                        open={rejectReasonOpen}
                        onOpenChange={(open) => {
                          setRejectReasonOpen(open);
                          if (!open) setRejectReason("");
                        }}
                      >
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>
                              {lang === "ar" ? "رفض إيصال بنفت باي" : "Reject BenefitPay receipt"}
                            </DialogTitle>
                            <DialogDescription>
                              {lang === "ar"
                                ? "سيُرسل سبب الرفض للعميل، وستُحذف صورة الإيصال الخاصة فوراً."
                                : "The reason will be emailed to the customer and the private receipt image will be deleted immediately."}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-2">
                            <Label htmlFor="benefit-rejection-reason">
                              {lang === "ar" ? "سبب الرفض" : "Rejection reason"}
                            </Label>
                            <Textarea
                              id="benefit-rejection-reason"
                              value={rejectReason}
                              onChange={(event) => setRejectReason(event.target.value)}
                              maxLength={500}
                              dir={lang === "ar" ? "rtl" : "ltr"}
                              placeholder={
                                lang === "ar"
                                  ? "مثال: الإيصال غير واضح أو لا يطابق مبلغ الطلب"
                                  : "For example: receipt is unclear or does not match the order amount"
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              {rejectReason.trim().length}/500
                            </p>
                          </div>
                          <DialogFooter>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setRejectReasonOpen(false)}
                            >
                              {lang === "ar" ? "إلغاء" : "Cancel"}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              onClick={rejectBenefitPayment}
                              disabled={rejectingBenefit || rejectReason.trim().length < 3}
                            >
                              {rejectingBenefit && (
                                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                              )}
                              {lang === "ar"
                                ? "رفض الإيصال وإرسال السبب"
                                : "Reject and notify customer"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <Label>{lang === "ar" ? "تطبيق رمز خصم" : "Apply Promo Code"}</Label>
                    {appliedPromo ? (
                      <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                        <div className="flex min-w-0 items-center gap-2">
                          <Tag className="h-4 w-4 shrink-0" />
                          <span className="truncate font-mono font-semibold">
                            {appliedPromo.code}
                          </span>
                          <span className="text-xs">
                            − {formatMoney(appliedPromo.amount, currency)}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={removeAdminPromo}
                          disabled={isReadOnly}
                          aria-label={lang === "ar" ? "إزالة رمز الخصم" : "Remove promo code"}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          value={promoInput}
                          onChange={(event) => setPromoInput(event.target.value.toUpperCase())}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void applyAdminPromo();
                            }
                          }}
                          placeholder="EID20"
                          className="uppercase"
                          disabled={isReadOnly || checkingPromo}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={applyAdminPromo}
                          disabled={isReadOnly || checkingPromo}
                        >
                          {checkingPromo && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                          {lang === "ar" ? "تطبيق" : "Apply"}
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {lang === "ar"
                        ? "يتم التحقق من أهلية العميل والمنتجات والحد الأقصى تلقائياً."
                        : "Customer eligibility, sale exclusions, and discount caps are checked automatically."}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label>{t("orderDetail.discount")}</Label>
                        {!appliedPromo && !isReadOnly && (
                          <div className="flex items-center rounded-md border p-0.5 text-xs bg-muted/40">
                            <button
                              type="button"
                              className={cn(
                                "px-2 py-0.5 rounded font-semibold transition-colors",
                                discountMode === "fixed"
                                  ? "bg-background text-foreground shadow-xs"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                              onClick={() => setDiscountMode("fixed")}
                            >
                              {currency}
                            </button>
                            <button
                              type="button"
                              className={cn(
                                "px-2 py-0.5 rounded font-semibold transition-colors",
                                discountMode === "percent"
                                  ? "bg-background text-foreground shadow-xs"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                              onClick={() => {
                                setDiscountMode("percent");
                                if (totals.subtotal > 0 && order.discount > 0) {
                                  const pct = (order.discount / totals.subtotal) * 100;
                                  setDiscountPercentInput(pct.toFixed(1));
                                }
                              }}
                            >
                              %
                            </button>
                          </div>
                        )}
                      </div>
                      {discountMode === "percent" && !appliedPromo ? (
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            placeholder="10"
                            value={discountPercentInput}
                            disabled={isReadOnly}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDiscountPercentInput(val);
                              const pct = Number(val) || 0;
                              const calculated = Number(((totals.subtotal * pct) / 100).toFixed(3));
                              setOrder({ ...order, discount: calculated });
                            }}
                          />
                          <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-bold">
                            %
                          </span>
                        </div>
                      ) : (
                        <Input
                          type="number"
                          step="0.001"
                          value={order.discount}
                          disabled={isReadOnly || !!appliedPromo}
                          onChange={(e) => setOrder({ ...order, discount: Number(e.target.value) })}
                        />
                      )}
                      {appliedPromo && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {lang === "ar"
                            ? "تم تثبيت الخصم بواسطة رمز الخصم."
                            : "Locked to the validated promo amount."}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>{t("orderDetail.shipping")}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={order.shipping}
                        onChange={(e) => setOrder({ ...order, shipping: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label>{t("orderDetail.taxRate")}</Label>
                      {!isReadOnly && (
                        <Button
                          type="button"
                          variant={Number(order.tax_rate) === 0 ? "secondary" : "outline"}
                          size="sm"
                          className="h-6 px-2 text-[11px] font-semibold"
                          onClick={() => {
                            if (Number(order.tax_rate) > 0) {
                              setLastNonZeroTaxRate(Number(order.tax_rate));
                              setOrder({ ...order, tax_rate: 0 });
                            } else {
                              setOrder({ ...order, tax_rate: lastNonZeroTaxRate || 10 });
                            }
                          }}
                        >
                          {Number(order.tax_rate) === 0
                            ? lang === "ar"
                              ? "✓ معفي من الضريبة"
                              : "✓ Tax Exempt"
                            : lang === "ar"
                              ? "إعفاء ضريبي (0%)"
                              : "Set Tax Exempt (0%)"}
                        </Button>
                      )}
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      value={order.tax_rate}
                      onChange={(e) => setOrder({ ...order, tax_rate: Number(e.target.value) })}
                    />
                    {Number(order.tax_rate) === 0 && (
                      <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                        {lang === "ar"
                          ? "🛡️ الطلب معفي من قيمة الضريبة المضافة (0%)"
                          : "🛡️ Order is exempt from VAT (0%)"}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>{t("orderDetail.advancePaid")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={order.advance_paid ?? 0}
                      onChange={(e) => setOrder({ ...order, advance_paid: Number(e.target.value) })}
                    />
                  </div>
                  {/* 1. Payment Control Block */}
                  <div className="space-y-1.5 border-t border-border pt-4">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("orderDetail.paymentStatus")}
                    </Label>
                    <Select
                      value={order.payment_status ?? "unpaid"}
                      onValueChange={(v) => {
                        const updatedFulfillment =
                          v === "paid" &&
                          (!order.fulfillment_status ||
                            ["ON_HOLD", "on_hold", "unassigned"].includes(order.fulfillment_status))
                            ? "NEEDS_PACKING"
                            : order.fulfillment_status;
                        setOrder({
                          ...order,
                          payment_status: v,
                          fulfillment_status: updatedFulfillment,
                        });
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_BADGE_VALUES.map((v) => (
                          <SelectItem key={v} value={v}>
                            {t(`payStatus.${v}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {isUnpaid && !isCod && (
                      <Button
                        type="button"
                        size="sm"
                        className="mt-1 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-1.5 shadow-sm"
                        onClick={() => {
                          const updatedFulfillment =
                            !order.fulfillment_status ||
                            ["ON_HOLD", "on_hold", "unassigned"].includes(order.fulfillment_status)
                              ? "NEEDS_PACKING"
                              : order.fulfillment_status;
                          setOrder({
                            ...order,
                            payment_status: "paid",
                            fulfillment_status: updatedFulfillment,
                          });
                          toast.success(
                            lang === "ar"
                              ? "تم تسجيل الدفع بنجاح!"
                              : "Order payment marked as Paid!",
                          );
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {lang === "ar" ? "تسجيل كمدفوع" : "Mark as Paid"}
                      </Button>
                    )}
                  </div>

                  {/* 2. Fulfillment Control Block */}
                  <div className="space-y-2 border-t border-border pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {lang === "ar" ? "حالة التجهيز والشحن" : "Fulfillment Status"}
                      </Label>
                      {isPickup ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800">
                          🏪 {lang === "ar" ? "استلام" : "Pickup"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800">
                          🚚 {lang === "ar" ? "توصيل" : "Delivery"}
                        </span>
                      )}
                    </div>

                    <Select
                      value={order.fulfillment_status ?? "ON_HOLD"}
                      onValueChange={(v) => {
                        const blocksFulfillment = ["SHIPPED", "NEEDS_PACKING"].includes(v);
                        if (blocksFulfillment && isUnpaid && !isCod && !adminOverrideChecked) {
                          toast.error(
                            lang === "ar"
                              ? "خطأ: لا يمكن شحن أو تجهيز طلب غير مدفوع! يرجى تأكيد الدفع أو تفعيل خيار تجاوز التحقق."
                              : "Error: Cannot ship or pack an unpaid order! Please approve payment or toggle the admin override.",
                          );
                          return;
                        }
                        setOrder({ ...order, fulfillment_status: v });
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ON_HOLD">
                          {lang === "ar" ? "قيد الانتظار" : "On Hold"}
                        </SelectItem>
                        <SelectItem value="NEEDS_PACKING">
                          {lang === "ar" ? "بحاجة للتعبئة" : "Needs Packing"}
                        </SelectItem>
                        <SelectItem value="READY_FOR_PICKUP">
                          {lang === "ar" ? "جاهز للاستلام" : "Ready for Pickup"}
                        </SelectItem>
                        <SelectItem value="SHIPPED">
                          {lang === "ar" ? "تم الشحن" : "Shipped"}
                        </SelectItem>
                        <SelectItem value="COMPLETED">
                          {lang === "ar" ? "مكتمل" : "Completed"}
                        </SelectItem>
                        <SelectItem value="CANCELLED">
                          {lang === "ar" ? "ملغي" : "Cancelled"}
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {isUnpaid && !isCod && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="admin-override-checkbox"
                          checked={adminOverrideChecked}
                          onChange={(e) => setAdminOverrideChecked(e.target.checked)}
                          className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                        />
                        <label
                          htmlFor="admin-override-checkbox"
                          className="text-xs text-muted-foreground select-none cursor-pointer"
                        >
                          {lang === "ar"
                            ? "تجاوز التحقق من الدفع يدوياً"
                            : "Override unpaid payment check"}
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 border-t border-border pt-3 text-sm">
                    <Row
                      label={t("orderDetail.subtotal")}
                      value={formatMoney(totals.subtotal, currency)}
                    />
                    <Row
                      label={`${t("orderDetail.discount")}${order.promo_code ? ` (Promo: ${order.promo_code})` : ""}`}
                      value={`− ${formatMoney(totals.discount, currency)}`}
                    />
                    <Row
                      label={`${t("orderDetail.vat")} (${order.tax_rate}%)`}
                      value={formatMoney(totals.taxAmount, currency)}
                    />
                    <Row
                      label={t("orderDetail.shipping")}
                      value={formatMoney(totals.shipping, currency)}
                    />
                    <div className="flex justify-between items-center pt-2 border-t border-border">
                      <span className="font-display text-lg">{t("orderDetail.total")}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-display text-lg">
                          {formatMoney(totals.total, currency)}
                        </span>
                        <span
                          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${PAYMENT_BADGE_CLASSES[paymentBadge]}`}
                        >
                          {t(`payStatus.${paymentBadge}`)}
                        </span>
                      </div>
                    </div>
                    {totals.advancePaid > 0 && (
                      <>
                        <Row
                          label={t("orderDetail.advancePaid")}
                          value={`− ${formatMoney(totals.advancePaid, currency)}`}
                        />
                        <div className="flex justify-between pt-1 font-medium">
                          <span>{t("orderDetail.remaining")}</span>
                          <span>{formatMoney(totals.remaining, currency)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </fieldset>

      {/* Floating Sticky Save Bar - Only appears when form has unsaved changes */}
      {!isReadOnly && isDirty && (
        <div className="no-print fixed bottom-20 inset-x-3 z-50 mx-auto hidden max-w-lg items-center gap-3 rounded-2xl border border-amber-300/80 bg-amber-50/95 p-3.5 shadow-2xl backdrop-blur animate-in slide-in-from-bottom duration-200 dark:bg-amber-950/90 sm:bottom-6 sm:inset-x-auto sm:end-8 sm:flex">
          <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />
          <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex-1 min-w-0">
            {lang === "ar" ? "توجد تغييرات غير محفوظة على الطلب" : "Unsaved changes detected"}
          </span>
          <Button
            onClick={save}
            disabled={saving}
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md shrink-0 touch-manipulation min-h-[38px]"
          >
            {saving ? (
              <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="me-1.5 h-4 w-4" />
            )}
            {isCreationMode
              ? lang === "ar"
                ? "إنشاء وحفظ"
                : "Create & Save"
              : lang === "ar"
                ? "حفظ التغييرات"
                : "Save Changes"}
          </Button>
        </div>
      )}

      {/* Invoice Preview Section Anchor */}
      <div id="sec-invoice" className="scroll-mt-24">
        <div className="no-print mb-4 rounded-xl border bg-card">
          <button
            type="button"
            onClick={() => setInvoicePreviewOpen((open) => !open)}
            className="flex w-full items-center justify-between px-4 py-3 text-start font-medium hover:bg-muted/40"
            aria-expanded={invoicePreviewOpen}
          >
            <span>{lang === "ar" ? "معاينة الفاتورة" : "Preview Invoice"}</span>
            <span className="text-sm text-muted-foreground">{invoicePreviewOpen ? "−" : "+"}</span>
          </button>
        </div>
        <div className={invoicePreviewOpen ? "block" : "hidden print:block"}>
          {/* Printable invoice */}
          {(() => {
            const addrs = (addressesQ.data ?? []).filter(
              (a) => a.customer_id === order.customer_id,
            );
            const chosen =
              ((order as any).delivery_address_snapshot as SavedAddress | null) ??
              addrs.find((a) => a.id === order.shipping_address_id) ??
              addrs.find((a) => a.is_default) ??
              null;
            return (
              <InvoicePreview
                order={{
                  ...order,
                  subtotal: totals.subtotal,
                  tax_amount: totals.taxAmount,
                  total: totals.total,
                  advance_paid: totals.advancePaid,
                }}
                items={items}
                settings={settingsQ.data}
                shippingAddress={chosen}
                paymentBadge={paymentBadge}
              />
            );
          })()}
        </div>
      </div>

      {/* Activity Trail Section Anchor */}
      <div
        id="sec-activity"
        className="no-print mx-auto max-w-6xl scroll-mt-24 px-1 pb-4 sm:p-6 lg:p-8"
      >
        <details className="group overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-sm sm:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold marker:content-none">
            <span>{lang === "ar" ? "سجل النشاطات" : "Activity history"}</span>
            <span className="text-lg text-muted-foreground transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="border-t border-border/60 p-4">
            <ActivityLogList orderId={order.id} scope="order" brandId={brand.id} />
          </div>
        </details>
        <div className="hidden sm:block">
          <ActivityLogList orderId={order.id} scope="order" brandId={brand.id} />
        </div>
      </div>

      <Dialog open={mobileActionsOpen} onOpenChange={setMobileActionsOpen}>
        <DialogContent
          closeLabel={lang === "ar" ? "إغلاق" : "Close"}
          className="top-auto bottom-0 w-full max-w-none translate-y-0 rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-5 sm:hidden"
        >
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? "إجراءات الطلب" : "Order actions"}</DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "أدوات الفاتورة والمشاركة والطباعة"
                : "Invoice, sharing and printing tools"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            {order.public_invoice_token && (
              <Button
                variant="outline"
                className="min-h-12 justify-start rounded-xl"
                onClick={() => {
                  copyLink();
                  setMobileActionsOpen(false);
                }}
              >
                <LinkIcon className="me-2 h-4 w-4" />
                {t("orders.copyLink")}
              </Button>
            )}
            <Button
              variant="outline"
              className="min-h-12 justify-start rounded-xl"
              onClick={() => {
                printReceipt();
                setMobileActionsOpen(false);
              }}
            >
              <Receipt className="me-2 h-4 w-4" />
              {t("orders.printReceipt")}
            </Button>
            <Button
              variant="outline"
              className="min-h-12 justify-start rounded-xl"
              onClick={() => {
                setMobileActionsOpen(false);
                setInvoicePreviewOpen(true);
                window.setTimeout(() => scrollToSection("sec-invoice"), 100);
              }}
            >
              <Printer className="me-2 h-4 w-4" />
              {lang === "ar" ? "معاينة وتنزيل الفاتورة" : "Preview and download invoice"}
            </Button>
            <Button
              variant="outline"
              className="min-h-12 justify-start rounded-xl"
              onClick={() => {
                setMobileActionsOpen(false);
                window.setTimeout(() => scrollToSection("sec-activity"), 100);
              }}
            >
              <MoreHorizontal className="me-2 h-4 w-4" />
              {lang === "ar" ? "عرض سجل النشاطات" : "View activity history"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CourierWhatsAppModal
        isOpen={waModalOpen}
        onClose={() => setWaModalOpen(false)}
        order={orderQ.data || order}
        courier={
          (couriersQ.data ?? []).find((c: any) => c.id === order.assigned_to) ||
          (order.assigned_profile as any) ||
          null
        }
        brandSlug={slug}
        lang={lang}
        onNotified={() => orderQ.refetch()}
      />

      {/* Product Search & Autocomplete Modal */}
      <Dialog open={productSearchOpen} onOpenChange={setProductSearchOpen}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4 text-primary" />
              {lang === "ar" ? "البحث عن منتج أو SKU أو باركود" : "Search Product, SKU, or Barcode"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder={
                  lang === "ar"
                    ? "اكتب للبحث بالاسم، الرمز (SKU)، المقاس، أو الباركود..."
                    : "Type product title, SKU, size, or barcode..."
                }
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                className="ps-9 h-10 text-sm font-medium"
              />
              {productSearchQuery && (
                <button
                  type="button"
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  onClick={() => setProductSearchQuery("")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="max-h-[380px] overflow-y-auto space-y-2 pe-1">
              {filteredVariantsForSearch.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {lang === "ar"
                    ? `لم يتم العثور على منتجات تطابق "${productSearchQuery}"`
                    : `No products found matching "${productSearchQuery}"`}
                </div>
              ) : (
                filteredVariantsForSearch.map((v: any) => {
                  const p = (productsQ.data ?? []).find((x: any) => x.id === v.product_id);
                  const title = (p as any)?.name || "Product";
                  const sku = v.sku || (p as any)?.sku;
                  const mainStock = Number(v.stock_main ?? 0);
                  const incStock = Number(v.stock_incubator ?? 0);
                  const fallbackStock = Number(v.stock ?? v.quantity ?? (p as any)?.stock ?? 0);
                  const totalStock =
                    mainStock + incStock > 0 ? mainStock + incStock : fallbackStock;
                  const price = Number(
                    v.selling_price ??
                      v.price_override ??
                      v.price ??
                      (p as any)?.selling_price ??
                      (p as any)?.base_price ??
                      (p as any)?.price ??
                      0,
                  );
                  const getMediaUrl = (obj: any) => {
                    if (!obj) return null;
                    if (typeof obj.image_url === "string" && obj.image_url) return obj.image_url;
                    if (typeof obj.image === "string" && obj.image) return obj.image;
                    if (Array.isArray(obj.images) && obj.images[0]) return obj.images[0];
                    return null;
                  };
                  const img = getMediaUrl(v) || getMediaUrl(p);

                  return (
                    <div
                      key={v.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border/70 hover:border-primary/60 hover:bg-primary/5 cursor-pointer transition-all"
                      onClick={() => handleSelectVariantFromModal(v)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-11 w-11 rounded-lg border bg-muted/40 overflow-hidden shrink-0 flex items-center justify-center">
                          {img ? (
                            <img src={img} alt={title} className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-xs sm:text-sm text-foreground truncate">
                            {title}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                            {sku && (
                              <span className="font-mono bg-muted/80 px-1.5 py-0.5 rounded text-[10px]">
                                {sku}
                              </span>
                            )}
                            {(v.size || v.color) && (
                              <span>{[v.size, v.color].filter(Boolean).join(" / ")}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-end shrink-0">
                        <p className="font-bold text-sm text-foreground">
                          {formatMoney(price, currency)}
                        </p>
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded inline-block mt-0.5",
                            totalStock > 0
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
                          )}
                        >
                          {totalStock > 0
                            ? `${lang === "ar" ? "متوفر" : "In Stock"}: ${totalStock}`
                            : lang === "ar"
                              ? "نفذت الكمية"
                              : "Out of Stock"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Inline New Customer Dialog */}
      <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              {lang === "ar" ? "إضافة زبون جديد" : "Create New Customer"}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "أدخل بيانات الزبون وسيتم تعيينه مباشرة لهذا الطلب بدون فقدان التغييرات."
                : "Enter customer details. They will be assigned to this order draft immediately."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>{lang === "ar" ? "اسم الزبون *" : "Full Name *"}</Label>
              <Input
                placeholder={lang === "ar" ? "مثال: علي محمد" : "e.g. Ali Mohamed"}
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>{lang === "ar" ? "رقم الهاتف" : "Phone Number"}</Label>
                <Input
                  dir="ltr"
                  placeholder="33000000"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                />
              </div>
              <div>
                <Label>{lang === "ar" ? "البريد الإلكتروني" : "Email Address"}</Label>
                <Input
                  dir="ltr"
                  placeholder="ali@example.com"
                  value={newCustEmail}
                  onChange={(e) => setNewCustEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {lang === "ar" ? "عنوان التوصيل الافتراضي" : "Default Delivery Address"}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder={lang === "ar" ? "المنطقة (مثال: المنامة)" : "Region (e.g. Manama)"}
                  value={newCustRegion}
                  onChange={(e) => setNewCustRegion(e.target.value)}
                />
                <Input
                  placeholder={lang === "ar" ? "المجمع (مثال: 321)" : "Block (e.g. 321)"}
                  value={newCustBlock}
                  onChange={(e) => setNewCustBlock(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  placeholder={lang === "ar" ? "الطريق" : "Road"}
                  value={newCustRoad}
                  onChange={(e) => setNewCustRoad(e.target.value)}
                />
                <Input
                  placeholder={lang === "ar" ? "المنزل" : "House"}
                  value={newCustHouse}
                  onChange={(e) => setNewCustHouse(e.target.value)}
                />
                <Input
                  placeholder={lang === "ar" ? "الشقة" : "Flat"}
                  value={newCustFlat}
                  onChange={(e) => setNewCustFlat(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewCustomerOpen(false)}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

const INVOICE_LABELS = {
  en: {
    invoice: "INVOICE",
    invoiceNumber: "Invoice #",
    date: "Date",
    status: "Status",
    billTo: "Bill to",
    paymentMethod: "Payment method",
    vatLabel: "VAT",
    item: "Item",
    description: "Description",
    qty: "Qty",
    unit: "Unit Price",
    price: "Price",
    total: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    vat: "VAT",
    shipping: "Shipping",
    grandTotal: "Grand Total",
    notes: "Notes",
    warmRegards: "Warm regards",
    language: "Language",
    english: "English",
    arabic: "العربية",
  },
  ar: {
    invoice: "فاتورة",
    invoiceNumber: "رقم الفاتورة",
    date: "التاريخ",
    status: "الحالة",
    billTo: "فاتورة إلى",
    paymentMethod: "طريقة الدفع",
    vatLabel: "الرقم الضريبي",
    item: "الصنف",
    description: "الوصف",
    qty: "الكمية",
    unit: "سعر الوحدة",
    price: "السعر",
    total: "الإجمالي",
    subtotal: "المجموع الفرعي",
    discount: "الخصم",
    vat: "ضريبة القيمة المضافة",
    shipping: "الشحن",
    grandTotal: "الإجمالي الكلي",
    notes: "ملاحظات",
    warmRegards: "مع أطيب التحيات",
    language: "اللغة",
    english: "English",
    arabic: "العربية",
  },
} as const;
const BRAND: Record<"en" | "ar", string> = { en: "Boutq", ar: "بوتك" };
const LEGACY_BRAND_NAMES = new Set(["Abaya Atelier", "أباية أتيليه"]);
function brandFor(lang: "en" | "ar", stored?: string | null) {
  const s = (stored ?? "").trim();
  if (!s || LEGACY_BRAND_NAMES.has(s)) return BRAND[lang];
  return s;
}

const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  draft: { en: "Draft", ar: "مسودة" },
  confirmed: { en: "Confirmed", ar: "مؤكدة" },
  paid: { en: "Paid", ar: "مدفوعة" },
  pending: { en: "Pending", ar: "قيد الانتظار" },
  shipped: { en: "Shipped", ar: "تم الشحن" },
  completed: { en: "Completed", ar: "مكتملة" },
  cancelled: { en: "Cancelled", ar: "ملغاة" },
  refunded: { en: "Refunded", ar: "مستردة" },
};

const PAYMENT_LABELS: Record<string, { en: string; ar: string }> = {
  cash: { en: "Cash", ar: "نقدًا" },
  card: { en: "Card", ar: "بطاقة" },
  bank_transfer: { en: "Bank transfer", ar: "تحويل بنكي" },
  transfer: { en: "Bank transfer", ar: "تحويل بنكي" },
  benefit: { en: "Benefit", ar: "بنفت" },
  apple_pay: { en: "Apple Pay", ar: "أبل باي" },
  google_pay: { en: "Google Pay", ar: "جوجل باي" },
  cod: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
};

function tStatus(s: string | null | undefined, lang: "en" | "ar") {
  if (!s) return "";
  return STATUS_LABELS[s]?.[lang] ?? s;
}
function tPayment(s: string | null | undefined, lang: "en" | "ar") {
  if (!s) return "";
  return PAYMENT_LABELS[s]?.[lang] ?? s;
}

// Localize numerals (Arabic-Indic) inside a rendered money/number string
function toArabicDigits(str: string) {
  const map = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return str.replace(/[0-9]/g, (d) => map[+d]);
}

function InvoiceBranchName({
  brandId,
  branchId,
  isRTL,
}: {
  brandId: string;
  branchId: string;
  isRTL: boolean;
}) {
  const q = useQuery({
    queryKey: ["branch", brandId, branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches" as any)
        .select("name_ar, name_en, location_ar, location_en")
        .eq("id", branchId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!branchId,
  });
  const b = q.data;
  if (!b) return null;
  const name = isRTL ? b.name_ar || b.name_en : b.name_en || b.name_ar;
  const loc = isRTL ? b.location_ar || b.location_en : b.location_en || b.location_ar;
  return (
    <p className="text-sm" style={{ opacity: 0.85 }}>
      {name}
      {loc ? ` — ${loc}` : ""}
    </p>
  );
}

const InvoicePreview = lazy(() => import("@/components/orders/InvoicePreview"));
const SendInvoiceDialog = lazy(() => import("@/components/orders/SendInvoiceDialog"));

function ResendConfirmationEmailButton({
  order,
  lang,
  onDone,
}: {
  order: any;
  lang: "ar" | "en";
  onDone: () => void;
}) {
  const [sending, setSending] = useState(false);
  const status: string = order?.confirmation_email_status ?? "pending";
  const sentAt = order?.confirmation_email_sent_at as string | null | undefined;
  const err = order?.confirmation_email_error as string | null | undefined;

  const color =
    status === "sent"
      ? "text-green-600"
      : status === "failed"
        ? "text-destructive"
        : "text-muted-foreground";

  const label =
    lang === "ar"
      ? status === "sent"
        ? "إعادة إرسال البريد"
        : status === "failed"
          ? "إعادة المحاولة"
          : "إرسال بريد التأكيد"
      : status === "sent"
        ? "Resend confirmation email"
        : status === "failed"
          ? "Retry confirmation email"
          : "Send confirmation email";

  const title = err
    ? `${lang === "ar" ? "فشل: " : "Failed: "}${err}`
    : sentAt
      ? `${lang === "ar" ? "أُرسل: " : "Sent: "}${new Date(sentAt).toLocaleString()}`
      : undefined;

  const onClick = async () => {
    if (!order?.id) return;
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const { data, error } = await supabase.functions.invoke("send-order-email", {
        body: { order_id: order.id, lang, wait_for_delivery: true },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      toast.success(
        lang === "ar"
          ? "تم قبول بريد العميل للإرسال. راجع سجل المراسلات لمتابعة الحالة."
          : "Customer email accepted by the provider. Track it in Communications.",
      );
    } catch (e: any) {
      toast.error(e?.message ?? (lang === "ar" ? "فشل الإرسال" : "Failed to send"));
    } finally {
      setSending(false);
      onDone();
    }
  };

  return (
    <Button variant="outline" onClick={onClick} disabled={sending} title={title}>
      {sending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Mail className={`h-4 w-4 mr-2 ${color}`} />
      )}
      {label}
    </Button>
  );
}
