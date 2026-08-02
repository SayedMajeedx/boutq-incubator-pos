import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Check,
  MessageCircle,
  Search,
  Megaphone,
  Save,
  Trash2,
  Plus,
  Play,
  Pause,
  Square,
  ExternalLink,
  ShieldCheck,
  Download,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import { buildCustomerCrmStats, type CustomerMetricOrder } from "@/lib/commerce-metrics";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/campaigns")({
  validateSearch: (search: Record<string, unknown>) => ({
    segment: (typeof search.segment === "string" ? search.segment : "All") as
      "All" | "VIP" | "Churn Risk" | "New Buyer",
  }),
  component: CampaignsPage,
});

type Customer = { id: string; name: string; phone: string | null };
type Template = { id: string; name: string; body: string };
type BulkStatus = "queued" | "sending" | "sent" | "skipped";

function isMobileBrowser() {
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
}

const CHANNEL = "whatsapp";
const DEFAULT_EN =
  "Hi {{customer_name}}, this is {{business_name}}. We have exciting news for you!";
const DEFAULT_AR = "مرحبًا {{customer_name}}، معكم {{business_name}}. لدينا عرض مميز لك!";

function CampaignsPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;

  const { segment } = Route.useSearch();
  const [selectedSegment, setSelectedSegment] = useState<
    "All" | "VIP" | "Churn Risk" | "New Buyer"
  >(segment || "All");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);

  useEffect(() => {
    if (segment) {
      setSelectedSegment(segment);
    }
  }, [segment]);

  const [message, setMessage] = useState(isAr ? DEFAULT_AR : DEFAULT_EN);
  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveMode, setSaveMode] = useState<"new" | "update">("new");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Bulk campaign states
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"guided" | "auto">("guided");
  const [bulkActive, setBulkActive] = useState(false);
  const [bulkIndex, setBulkIndex] = useState(0);
  const [bulkDelay, setBulkDelay] = useState(2500); // milliseconds
  const [bulkQueue, setBulkQueue] = useState<Customer[]>([]);
  const [bulkSent, setBulkSent] = useState<Record<string, BulkStatus>>({});
  const bulkWindowRef = useRef<Window | null>(null);

  const templatesQ = useQuery({
    queryKey: ["campaign-templates", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("id, name, body")
        .eq("brand_id", brandId)
        .eq("channel", CHANNEL)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const customersQ = useQuery({
    queryKey: ["campaigns-customers", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("brand_id", brandId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });

  const ordersQ = useQuery({
    queryKey: ["campaigns-customer-orders", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_id, total, created_at, status, payment_status, fulfillment_status")
        .eq("brand_id", brandId);
      if (error) throw error;
      return data as Array<CustomerMetricOrder & { id: string }>;
    },
  });

  const customerCrmStats = useMemo(() => buildCustomerCrmStats(ordersQ.data ?? []), [ordersQ.data]);

  const businessQ = useQuery({
    queryKey: ["campaigns-business", brandId],
    queryFn: async () => {
      const { data } = await supabase
        .from("business_settings")
        .select("business_name")
        .eq("brand_id", brandId)
        .maybeSingle();
      return data?.business_name ?? "";
    },
  });
  const businessName = businessQ.data ?? "";

  const onSelectTemplate = (id: string) => {
    setSelectedId(id);
    const tpl = (templatesQ.data ?? []).find((t) => t.id === id);
    if (tpl) setMessage(tpl.body);
  };

  const openSave = (mode: "new" | "update") => {
    const current = (templatesQ.data ?? []).find((t) => t.id === selectedId);
    if (mode === "update" && !current) {
      toast.error(isAr ? "اختر قالبًا لتحديثه" : "Select a template to update");
      return;
    }
    setSaveMode(mode);
    setSaveName(mode === "update" && current ? current.name : "");
    setSaveOpen(true);
  };

  const saveTemplate = async () => {
    const name = saveName.trim();
    if (!name) return toast.error(isAr ? "أدخل اسم القالب" : "Enter a template name");
    if (!message.trim()) return toast.error(isAr ? "الرسالة فارغة" : "Message is empty");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (saveMode === "update" && selectedId) {
      const { error } = await supabase
        .from("message_templates")
        .update({ name, body: message })
        .eq("id", selectedId);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase
        .from("message_templates")
        .insert({ name, body: message, channel: CHANNEL, user_id: user.id } as any)
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      if (data) setSelectedId(data.id);
    }
    toast.success(isAr ? "تم الحفظ" : "Saved");
    setSaveOpen(false);
    qc.invalidateQueries({ queryKey: ["campaign-templates"] });
  };

  const deleteTemplate = async () => {
    if (!selectedId) return;
    const tpl = (templatesQ.data ?? []).find((t) => t.id === selectedId);
    if (!tpl) return;
    if (!confirm(isAr ? `حذف قالب "${tpl.name}"؟` : `Delete template "${tpl.name}"?`)) return;
    const { error } = await supabase.from("message_templates").delete().eq("id", selectedId);
    if (error) return toast.error(error.message);
    toast.success(isAr ? "تم الحفظ" : "Deleted");
    setSelectedId("");
    qc.invalidateQueries({ queryKey: ["campaign-templates"] });
  };

  const insertPlaceholder = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      setMessage((m) => m + token);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + token + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const filtered = useMemo(() => {
    const list = customersQ.data ?? [];
    const q = search.trim().toLowerCase();

    const segmentFiltered = list.filter((c) => {
      if (selectedSegment === "All") return true;
      const stats = customerCrmStats.get(c.id);
      const badge = stats?.badge || "Regular";
      return badge === selectedSegment;
    });

    if (!q) return segmentFiltered;
    return segmentFiltered.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [customersQ.data, search, selectedSegment, customerCrmStats]);

  // Pre-populate checkboxes on segment/filter change
  useEffect(() => {
    const validIds = filtered.filter((c) => c.phone && c.phone.trim()).map((c) => c.id);
    setSelectedCustomerIds(validIds);
  }, [filtered]);

  const toggleSelectAll = () => {
    const validFiltered = filtered.filter((c) => c.phone && c.phone.trim());
    const allSelected = validFiltered.every((c) => selectedCustomerIds.includes(c.id));
    if (allSelected) {
      setSelectedCustomerIds((prev) =>
        prev.filter((id) => !validFiltered.some((c) => c.id === id)),
      );
    } else {
      setSelectedCustomerIds((prev) => {
        const next = [...prev];
        validFiltered.forEach((c) => {
          if (!next.includes(c.id)) next.push(c.id);
        });
        return next;
      });
    }
  };

  const toggleSelectCustomer = (id: string) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const buildMessage = useCallback(
    (customerName: string) =>
      message
        .replace(/\{\{customer_name\}\}/g, customerName || "")
        .replace(/\{\{business_name\}\}/g, businessName || ""),
    [businessName, message],
  );

  const buildWhatsAppUrl = useCallback(
    (customer: Customer) => {
      const phone = customer.phone?.replace(/[^\d]/g, "") || "";
      if (!phone) return null;
      return `https://wa.me/${phone}?text=${encodeURIComponent(buildMessage(customer.name))}`;
    },
    [buildMessage],
  );

  const send = (c: Customer) => {
    if (!c.phone || !c.phone.trim()) {
      toast.error(isAr ? "لا يوجد رقم هاتف" : "No phone number on file");
      return;
    }
    const phone = c.phone.replace(/[^\d]/g, "");
    if (!phone) {
      toast.error(isAr ? "رقم الهاتف غير صالح" : "Invalid phone number");
      return;
    }
    // Encode string payloads explicitly with encodeURIComponent for robust formatting
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildMessage(c.name))}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSent((s) => ({ ...s, [c.id]: true }));
  };

  // Launch bulk campaign wizard modal pre-population
  const launchBulkCampaign = () => {
    const list = filtered.filter(
      (c) => selectedCustomerIds.includes(c.id) && c.phone && c.phone.trim(),
    );
    if (list.length === 0) {
      toast.error(
        isAr
          ? "لا يوجد عملاء محددون لديهم أرقام هواتف"
          : "No selected customers with phone numbers",
      );
      return;
    }
    setBulkQueue(list);
    const initialSent: Record<string, BulkStatus> = {};
    list.forEach((c) => {
      initialSent[c.id] = "queued";
    });
    setBulkSent(initialSent);
    setBulkIndex(0);
    setBulkActive(false);
    setBulkOpen(true);
  };

  const markBulkRecipientOpened = (customer: Customer, index: number) => {
    setBulkSent((prev) => ({ ...prev, [customer.id]: "sent" }));
    setSent((prev) => ({ ...prev, [customer.id]: true }));
    setBulkIndex(index + 1);
  };

  // The first WhatsApp URL must be opened synchronously from the user's tap.
  // Opening about:blank first leaves mobile browsers hidden before the delayed
  // redirect runs, which prevents the WhatsApp app handoff.
  const handleStartAutomated = () => {
    const idx = bulkIndex;
    const customer = bulkQueue[idx];
    if (!customer) return;

    const url = buildWhatsAppUrl(customer);
    if (!url) {
      setBulkSent((prev) => ({ ...prev, [customer.id]: "skipped" }));
      setBulkIndex(idx + 1);
      setBulkActive(true);
      return;
    }

    setBulkSent((prev) => ({ ...prev, [customer.id]: "sending" }));

    if (isMobileBrowser()) {
      // A direct URL from the tap (rather than a delayed about:blank redirect)
      // allows iOS and Android to hand off to the native WhatsApp app.
      markBulkRecipientOpened(customer, idx);
      setBulkActive(true);
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    const win = window.open(url, "whatsapp_campaign_window");
    if (!win) {
      setBulkSent((prev) => ({ ...prev, [customer.id]: "queued" }));
      toast.error(
        isAr
          ? "Ø§Ø³Ù…Ø­ Ø¨Ø§Ù„Ù†ÙˆØ§ÙØ° Ø§Ù„Ù…Ù†Ø¨Ø«Ù‚Ø© Ù„Ø¨Ø¯Ø¡ Ø§Ù„Ø­Ù…Ù„Ø©"
          : "Allow popups to start the campaign",
      );
      return;
    }

    bulkWindowRef.current = win;
    markBulkRecipientOpened(customer, idx);
    setBulkActive(true);
  };

  // Export selected segments to a CSV format compatible with free Chrome/browser bulk-sender extensions
  const exportBulkCampaignCsv = () => {
    const list = filtered.filter(
      (c) => selectedCustomerIds.includes(c.id) && c.phone && c.phone.trim(),
    );
    if (list.length === 0) {
      toast.error(
        isAr
          ? "لا يوجد عملاء محددون لديهم أرقام هواتف"
          : "No selected customers with phone numbers",
      );
      return;
    }

    const headers = ["Phone", "Name", "Message"];
    const rows = list.map((c) => {
      const phone = c.phone?.replace(/[^\d]/g, "") || "";
      const name = c.name || "";
      const msg = buildMessage(name).replace(/"/g, '""');
      return `"${phone}","${name}","${msg}"`;
    });

    // Unicode BOM prefix (\uFEFF) to natively preserve Arabic / RTL characters in Microsoft Excel
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `whatsapp_campaign_${brandId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(isAr ? "تم تصدير ملف CSV بنجاح!" : "Campaign CSV exported successfully!");
  };

  // Keep references updated for the asynchronous recursion timers
  const activeRef = useRef(bulkActive);
  const indexRef = useRef(bulkIndex);
  const queueRef = useRef(bulkQueue);
  const modeRef = useRef(bulkMode);
  const delayRef = useRef(bulkDelay);

  useEffect(() => {
    activeRef.current = bulkActive;
  }, [bulkActive]);
  useEffect(() => {
    indexRef.current = bulkIndex;
  }, [bulkIndex]);
  useEffect(() => {
    queueRef.current = bulkQueue;
  }, [bulkQueue]);
  useEffect(() => {
    modeRef.current = bulkMode;
  }, [bulkMode]);
  useEffect(() => {
    delayRef.current = bulkDelay;
  }, [bulkDelay]);

  // Throttling-resistant recursive campaign queue handler
  useEffect(() => {
    if (!bulkActive || bulkMode !== "auto") return;

    let timeoutId: any = null;

    const runNext = () => {
      if (!activeRef.current) return;

      // Browser background sleep resistance: delay if tab is hidden
      if (document.visibilityState === "hidden") {
        timeoutId = setTimeout(runNext, 1000);
        return;
      }

      const idx = indexRef.current;
      const q = queueRef.current;

      if (idx >= q.length) {
        setBulkActive(false);
        toast.success(
          isAr ? "تم إكمال الحملة التلقائية بنجاح!" : "Automated campaign completed successfully!",
        );
        return;
      }

      const customer = q[idx];
      setBulkSent((prev) => ({ ...prev, [customer.id]: "sending" }));

      const url = buildWhatsAppUrl(customer);
      if (url) {
        try {
          // Re-use dedicated workspace tab to bypass standard browser popup blocker policies
          if (bulkWindowRef.current && !bulkWindowRef.current.closed) {
            bulkWindowRef.current.location.href = url;
          } else if (!isMobileBrowser()) {
            bulkWindowRef.current = window.open(url, "whatsapp_campaign_window");
          } else {
            setBulkActive(false);
            setBulkSent((prev) => ({ ...prev, [customer.id]: "queued" }));
            toast.info(
              isAr
                ? "Ø§Ø¶ØºØ· Ø§Ø³ØªØ¦Ù†Ø§Ù Ù„ÙØªØ­ Ø§Ù„Ù…Ø­Ø§Ø¯Ø«Ø© Ø§Ù„ØªØ§Ù„ÙŠØ©"
                : "Tap Resume to open the next chat",
            );
            return;
          }
        } catch (err) {
          setBulkActive(false);
          setBulkSent((prev) => ({ ...prev, [customer.id]: "queued" }));
          toast.error(isAr ? "ØªØ¹Ø°Ø± ÙØªØ­ ÙˆØ§ØªØ³Ø§Ø¨" : "Could not open WhatsApp");
          return;
        }

        setBulkSent((prev) => ({ ...prev, [customer.id]: "sent" }));
        setSent((prev) => ({ ...prev, [customer.id]: true }));
      } else {
        setBulkSent((prev) => ({ ...prev, [customer.id]: "skipped" }));
      }

      const nextIdx = idx + 1;
      setBulkIndex(nextIdx);

      if (nextIdx < q.length) {
        timeoutId = setTimeout(runNext, delayRef.current);
      } else {
        setBulkActive(false);
        toast.success(
          isAr ? "تم إكمال الحملة التلقائية بنجاح!" : "Automated campaign completed successfully!",
        );
      }
    };

    timeoutId = setTimeout(runNext, delayRef.current);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [bulkActive, bulkMode, buildWhatsAppUrl, isAr]);

  // Handle visibility change tab resumes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && bulkActive && bulkMode === "auto") {
        // Queue loop self-corrects and continues running instantly
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [bulkActive, bulkMode]);

  // Send next customer in step-by-step guided mode
  const sendGuidedNext = () => {
    const idx = bulkIndex;
    const q = bulkQueue;
    if (idx >= q.length) {
      toast.success(isAr ? "تم إرسال كافة الرسائل!" : "All messages processed!");
      return;
    }
    const customer = q[idx];
    setBulkSent((prev) => ({ ...prev, [customer.id]: "sending" }));

    const url = buildWhatsAppUrl(customer);
    if (url) {
      if (isMobileBrowser()) {
        markBulkRecipientOpened(customer, idx);
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      try {
        if (bulkWindowRef.current && !bulkWindowRef.current.closed) {
          bulkWindowRef.current.location.href = url;
          try {
            bulkWindowRef.current.focus();
          } catch {}
        } else {
          const win = window.open(url, "whatsapp_campaign_window");
          if (!win) {
            setBulkSent((prev) => ({ ...prev, [customer.id]: "queued" }));
            toast.error(
              isAr
                ? "Ø§Ø³Ù…Ø­ Ø¨Ø§Ù„Ù†ÙˆØ§ÙØ° Ø§Ù„Ù…Ù†Ø¨Ø«Ù‚Ø© Ø£Ùˆ Ø­Ø§ÙˆÙ„ Ù…Ø¬Ø¯Ø¯Ù‹Ø§"
                : "Allow popups or try again",
            );
            return;
          }
          bulkWindowRef.current = win;
        }
      } catch (err) {
        setBulkSent((prev) => ({ ...prev, [customer.id]: "queued" }));
        toast.error(isAr ? "ØªØ¹Ø°Ø± ÙØªØ­ ÙˆØ§ØªØ³Ø§Ø¨" : "Could not open WhatsApp");
        return;
      }

      setBulkSent((prev) => ({ ...prev, [customer.id]: "sent" }));
      setSent((prev) => ({ ...prev, [customer.id]: true }));
    } else {
      setBulkSent((prev) => ({ ...prev, [customer.id]: "skipped" }));
    }

    setBulkIndex((prev) => prev + 1);
  };

  const templates = templatesQ.data ?? [];
  const placeholders: { label: string; token: string }[] = [
    { label: isAr ? "اسم العميل" : "Customer name", token: "{{customer_name}}" },
    { label: isAr ? "اسم النشاط" : "Business name", token: "{{business_name}}" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 dark:from-slate-50 dark:to-slate-300">
            {isAr ? "حملات الواتساب" : "WhatsApp Campaigns"}
          </h1>
          <p className="mt-1.5 text-muted-foreground text-sm max-w-md">
            {isAr
              ? "أرسل رسائل تسويقية مخصصة إلى عملائك عبر الواتساب."
              : "Broadcast personalized marketing messages to your customers via WhatsApp."}
          </p>
        </div>
      </div>

      {/* Target Audience Segment Filter Toolbar */}
      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-4 sm:p-5 mb-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {isAr ? "🎯 الفئة المستهدفة للحملة" : "🎯 Target Campaign Audience"}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "قم بتصفية مستقبلي البث باستخدام تصنيفات CRM الذكية"
                : "Filter broadcast recipients using smart CRM categories"}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="w-full sm:w-56 shrink-0">
              <Select value={selectedSegment} onValueChange={(val: any) => setSelectedSegment(val)}>
                <SelectTrigger className="w-full bg-background border-input text-sm">
                  <SelectValue placeholder={isAr ? "اختر شريحة..." : "Select segment..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{isAr ? "كل العملاء (All)" : "All Customers"}</SelectItem>
                  <SelectItem value="VIP">{isAr ? "كبار العملاء (VIP)" : "VIP"}</SelectItem>
                  <SelectItem value="Churn Risk">
                    {isAr ? "معرض للمغادرة (Churn Risk)" : "Churn Risk"}
                  </SelectItem>
                  <SelectItem value="New Buyer">
                    {isAr ? "مشتري جديد (New Buyer)" : "New Buyer"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Quick horizontal filter pill shortcuts */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <span className="text-xs text-muted-foreground">
            {isAr ? "فئات سريعة:" : "Quick filters:"}
          </span>
          {(["All", "VIP", "Churn Risk", "New Buyer"] as const).map((seg) => {
            const isActive = selectedSegment === seg;
            let count = 0;
            if (seg === "All") {
              count = customersQ.data?.length ?? 0;
            } else {
              count = (customersQ.data ?? []).filter(
                (c) => customerCrmStats.get(c.id)?.badge === seg,
              ).length;
            }
            return (
              <button
                key={seg}
                type="button"
                onClick={() => setSelectedSegment(seg)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md scale-102"
                    : "bg-background border border-input text-muted-foreground hover:bg-secondary/40 hover:scale-[1.02]"
                }`}
              >
                {seg === "All" && (isAr ? "الكل" : "All")}
                {seg === "VIP" && (isAr ? "كبار العملاء" : "VIP")}
                {seg === "Churn Risk" && (isAr ? "معرض للمغادرة" : "Churn Risk")}
                {seg === "New Buyer" && (isAr ? "مشترون جدد" : "New Buyer")}
                <span
                  className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-4 sm:p-6 mb-6 space-y-4">
        {/* Template picker + actions */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 min-w-0">
            <Label className="text-sm font-medium">
              {isAr ? "اختر قالب الرسالة" : "Select Template"}
            </Label>
            <Select value={selectedId || undefined} onValueChange={onSelectTemplate}>
              <SelectTrigger className="mt-1 text-start">
                <SelectValue
                  placeholder={
                    templates.length === 0
                      ? isAr
                        ? "لا توجد قوالب محفوظة بعد"
                        : "No saved templates yet"
                      : isAr
                        ? "اختر قالبًا..."
                        : "Choose a template..."
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => openSave("new")}
              className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
            >
              <Plus className="h-4 w-4 me-2" />
              {isAr ? "قالب جديد" : "New"}
            </Button>
            <Button
              variant="outline"
              onClick={() => openSave("update")}
              disabled={!selectedId}
              className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
            >
              <Save className="h-4 w-4 me-2" />
              {isAr ? "حفظ القالب" : "Save Template"}
            </Button>
            <Button
              variant="ghost"
              onClick={deleteTemplate}
              disabled={!selectedId}
              className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
            >
              <Trash2 className="h-4 w-4 me-2 text-destructive" />
              {isAr ? "حذف" : "Delete"}
            </Button>
          </div>
        </div>

        {/* Message body */}
        <div>
          <Label className="text-sm font-medium">{isAr ? "نص الرسالة" : "Broadcast message"}</Label>
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="text-start mt-1 bg-background/50 focus:bg-background transition-all duration-200"
            dir={isAr ? "rtl" : "ltr"}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {isAr ? "أدرج متغير:" : "Insert placeholder:"}
            </span>
            {placeholders.map((p) => (
              <button
                key={p.token}
                type="button"
                onClick={() => insertPlaceholder(p.token)}
                className="text-xs px-2.5 py-1 rounded-full bg-secondary/80 text-foreground hover:bg-primary hover:text-primary-foreground hover:scale-105 active:scale-95 transition-all duration-200"
              >
                {p.label} <code className="opacity-70 font-mono text-[10px]">{p.token}</code>
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-muted-foreground border-t border-border/50 pt-3">
          <span className="font-medium">{isAr ? "معاينة:" : "Preview:"}</span>{" "}
          <span className="text-foreground italic bg-secondary/20 px-2 py-1 rounded">
            {buildMessage(filtered[0]?.name ?? (isAr ? "العميل" : "Customer"))}
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
        <div className="p-4 border-b border-border/50 bg-primary/5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "ابحث عن عميل..." : "Search customer..."}
              className="ps-9 text-start bg-background/50 focus:bg-background transition-colors duration-200"
            />
          </div>
          <div className="flex items-center gap-4 flex-wrap justify-between sm:justify-end">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                {Object.values(sent).filter(Boolean).length}/{filtered.length}{" "}
                {isAr ? "مرسلة" : "sent"}
              </span>
              {Object.keys(sent).length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSent({})}
                  className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                >
                  {isAr ? "إعادة تعيين" : "Reset"}
                </Button>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-dashed hover:bg-secondary font-medium shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
              onClick={exportBulkCampaignCsv}
              disabled={selectedCustomerIds.length === 0}
            >
              <Download className="h-4 w-4 me-1.5" />
              {isAr ? "تصدير ملف CSV للواتساب" : "Export Campaign CSV"}
            </Button>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
              onClick={launchBulkCampaign}
              disabled={selectedCustomerIds.length === 0}
            >
              <Megaphone className="h-4 w-4 me-1.5" />
              {isAr
                ? `إطلاق حملة جماعية (المستهدفة: ${selectedCustomerIds.length})`
                : `Launch Bulk Campaign (Targeting: ${selectedCustomerIds.length})`}
            </Button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            {isAr ? "لا يوجد عملاء." : "No customers found."}
          </div>
        ) : (
          <>
            {/* Mobile checklist view */}
            <div className="space-y-3 p-3 sm:hidden">
              <div className="flex items-center justify-between border-b pb-2 px-1 text-xs text-muted-foreground">
                <span className="font-semibold">{isAr ? "تحديد الكل" : "Select All"}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
                  checked={
                    filtered.length > 0 &&
                    filtered
                      .filter((c) => c.phone && c.phone.trim())
                      .every((c) => selectedCustomerIds.includes(c.id))
                  }
                  onChange={toggleSelectAll}
                />
              </div>
              {filtered.map((c) => {
                const isSent = !!sent[c.id];
                const stats = customerCrmStats.get(c.id);
                const orderCount = stats?.totalOrders ?? 0;
                const isChecked = selectedCustomerIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-3 transition-colors ${isChecked ? "border-primary/40 bg-primary/5" : "bg-background"} ${isSent ? "opacity-75" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
                          checked={isChecked}
                          onChange={() => toggleSelectCustomer(c.id)}
                          disabled={!c.phone}
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                            {c.phone || "—"}
                          </div>
                        </div>
                      </div>
                      {stats?.badge && (
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            stats.badge === "VIP"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                              : stats.badge === "Churn Risk"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400"
                                : stats.badge === "New Buyer"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                  : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                          }`}
                        >
                          {stats.badge}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground border-t border-border/40 pt-2">
                      <span>
                        {isAr ? "إجمالي الطلبات" : "Total orders"}: {orderCount}
                      </span>
                      <div>
                        {isSent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                            <Check className="h-3 w-3" />
                            {isAr ? "تم الإرسال" : "Sent"}
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 text-[11px]"
                            variant="outline"
                            onClick={() => send(c)}
                            disabled={!c.phone}
                          >
                            <MessageCircle className="me-1 h-3 w-3" />
                            {isAr ? "إرسال" : "Send"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table view */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                  <tr>
                    <th className="p-4 w-12 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
                        checked={
                          filtered.length > 0 &&
                          filtered
                            .filter((c) => c.phone && c.phone.trim())
                            .every((c) => selectedCustomerIds.includes(c.id))
                        }
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="p-4 font-semibold text-xs uppercase tracking-wider text-start">
                      {isAr ? "الاسم" : "Name"}
                    </th>
                    <th className="p-4 font-semibold text-xs uppercase tracking-wider text-start">
                      {isAr ? "الهاتف" : "Phone"}
                    </th>
                    <th className="p-4 font-semibold text-xs uppercase tracking-wider text-start">
                      {isAr ? "الشريحة (RFM)" : "CRM Segment"}
                    </th>
                    <th className="p-4 font-semibold text-xs uppercase tracking-wider text-start">
                      {isAr ? "إجمالي الطلبات" : "Total Orders"}
                    </th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const isSent = !!sent[c.id];
                    const stats = customerCrmStats.get(c.id);
                    const orderCount = stats?.totalOrders ?? 0;
                    const isChecked = selectedCustomerIds.includes(c.id);
                    return (
                      <tr
                        key={c.id}
                        className={`border-t border-border transition-colors hover:bg-secondary/20 ${
                          isChecked ? "bg-primary/5 hover:bg-primary/10" : ""
                        } ${isSent ? "opacity-75" : ""}`}
                      >
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
                            checked={isChecked}
                            onChange={() => toggleSelectCustomer(c.id)}
                            disabled={!c.phone}
                          />
                        </td>
                        <td className="p-4 font-medium">{c.name}</td>
                        <td className="p-4 text-muted-foreground font-mono" dir="ltr">
                          {c.phone || "—"}
                        </td>
                        <td className="p-4">
                          {stats?.badge ? (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                                stats.badge === "VIP"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                  : stats.badge === "Churn Risk"
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400"
                                    : stats.badge === "New Buyer"
                                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                      : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                              }`}
                            >
                              {stats.badge}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-4 text-muted-foreground font-mono">{orderCount}</td>
                        <td className="p-4 text-end">
                          {isSent ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium">
                              <Check className="h-3 w-3" /> {isAr ? "تم الإرسال" : "Sent"}
                            </span>
                          ) : (
                            <Button size="sm" onClick={() => send(c)} disabled={!c.phone}>
                              <MessageCircle className="h-4 w-4 me-2" />
                              {isAr ? "إرسال عبر الواتساب" : "Send via WhatsApp"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Save Template Modal */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {saveMode === "update"
                ? isAr
                  ? "تحديث القالب"
                  : "Update template"
                : isAr
                  ? "حفظ قالب جديد"
                  : "Save new template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{isAr ? "اسم القالب" : "Template name"}</Label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={isAr ? "مثال: عرض العيد" : "e.g. Eid promo"}
                className="text-start"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {isAr ? "المحتوى:" : "Body:"}
              <div className="mt-1 p-2 rounded bg-secondary text-foreground max-h-32 overflow-auto whitespace-pre-wrap">
                {message || "—"}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={saveTemplate}>{isAr ? "حفظ" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* IMMERSIVE BULK CAMPAIGN SENDER MODAL */}
      <Dialog
        open={bulkOpen}
        onOpenChange={(v) => {
          if (!bulkActive) setBulkOpen(v);
        }}
      >
        <DialogContent
          className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden"
          dir={isAr ? "rtl" : "ltr"}
        >
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded bg-emerald-500/10 text-emerald-600 flex items-center justify-center animate-bounce">
                <Megaphone className="h-4.5 w-4.5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-display">
                  {isAr ? "مساعد الإرسال الجماعي" : "Bulk Campaign Wizard"}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? `إرسال إلى ${bulkQueue.length} عميل محدد.`
                    : `Targeting ${bulkQueue.length} segments.`}
                </p>
              </div>
            </div>
            {bulkActive && (
              <span className="flex items-center gap-1.5 text-xs bg-amber-500/15 text-amber-700 px-2 py-1 rounded-full font-medium animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {isAr ? "جارٍ البث..." : "Broadcasting..."}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Mode selection tabs */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isAr ? "طريقة التشغيل" : "Sender Mode"}
              </Label>
              <div className="grid grid-cols-2 gap-2 mt-2 p-1 bg-secondary rounded-lg">
                <button
                  onClick={() => {
                    if (!bulkActive) setBulkMode("guided");
                  }}
                  disabled={bulkActive}
                  className={`py-2 px-3 text-sm rounded-md font-medium transition-all ${bulkMode === "guided" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {isAr ? "توجيه خطوة بخطوة" : "Guided Step-by-Step"}
                </button>
                <button
                  onClick={() => {
                    if (!bulkActive) setBulkMode("auto");
                  }}
                  disabled={bulkActive}
                  className={`py-2 px-3 text-sm rounded-md font-medium transition-all ${bulkMode === "auto" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {isAr ? "إرسال تلقائي متسلسل" : "Automated Queue Loop"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {bulkMode === "guided"
                  ? isAr
                    ? "💡 ينصح به لتخطي حواجب منبثقات المتصفح بالكامل. اضغط لفتح المحادثة التالية فوراً."
                    : "💡 Recommended mode. 100% bypasses popup-blockers and lets you review before sending."
                  : isAr
                    ? "⚡ يقوم النظام بفتح المحادثات تلو الأخرى تلقائياً. تأكد من تفعيل المنبثقات في المتصفح."
                    : "⚡ Sequentially opens WhatsApp Web tabs automatically. Please enable popups in your browser address bar."}
              </p>
            </div>

            {/* Config & Notices for Auto Mode */}
            {bulkMode === "auto" && (
              <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      {isAr ? "تأخير الفتح التلقائي (بالثانية)" : "Queue Delay (Seconds)"}
                    </Label>
                    <div className="text-xs text-muted-foreground">
                      {isAr
                        ? "المهلة الفاصلة بين فتح كل علامة تبويب."
                        : "Time elapsed between each browser window trigger."}
                    </div>
                  </div>
                  <Select
                    value={String(bulkDelay)}
                    onValueChange={(v) => setBulkDelay(Number(v))}
                    disabled={bulkActive}
                  >
                    <SelectTrigger className="w-28 text-center font-mono font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1500">1.5s</SelectItem>
                      <SelectItem value="2500">2.5s</SelectItem>
                      <SelectItem value="4000">4.0s</SelectItem>
                      <SelectItem value="6000">6.0s</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-start gap-2 text-xs border border-amber-200/50 bg-amber-50/50 p-2.5 rounded text-amber-800 dark:border-amber-900/20 dark:bg-amber-950/10 dark:text-amber-300">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {isAr
                      ? "يرجى البقاء في هذه الصفحة وتفعيل خيار 'سماح بالنوافذ المنبثقة' من شريط العنوان لتتمكن الحملة من إتمام الإرسال تلقائياً دون تجميد."
                      : "Keep this tab visible and verify you've granted Popups Permission in your browser search/address bar for a smooth flow."}
                  </span>
                </div>
              </div>
            )}

            {/* Progress Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-muted-foreground">
                  {isAr ? "مستوى تقدم البث:" : "Campaign Progress:"}
                </span>
                <span className="font-mono font-bold text-primary">
                  {bulkIndex} / {bulkQueue.length}
                </span>
              </div>
              <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                  style={{ width: `${(bulkIndex / bulkQueue.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Recipient Queue Grid */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isAr ? "قائمة المستلمين وقنواتهم" : "Recipient List Queue"}
              </Label>
              <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto divide-y">
                {bulkQueue.map((c, idx) => {
                  const status = bulkSent[c.id] || "queued";
                  return (
                    <div
                      key={c.id}
                      className={`p-2.5 flex items-center justify-between text-xs transition-colors ${idx === bulkIndex ? "bg-primary/5 font-semibold" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono w-5">#{idx + 1}</span>
                        <div>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-muted-foreground text-[10px] font-mono" dir="ltr">
                            {c.phone}
                          </div>
                        </div>
                      </div>
                      <div>
                        {status === "queued" && (
                          <span className="text-muted-foreground bg-muted/60 px-2 py-0.5 rounded text-[10px] font-medium">
                            {isAr ? "في الانتظار" : "Queued"}
                          </span>
                        )}
                        {status === "sending" && (
                          <span className="text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded text-[10px] font-medium animate-pulse">
                            {isAr ? "جاري الإرسال" : "Sending..."}
                          </span>
                        )}
                        {status === "sent" && (
                          <span className="text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
                            <Check className="h-2.5 w-2.5" />
                            {isAr ? "تم فتح الشات" : "Opened"}
                          </span>
                        )}
                        {status === "skipped" && (
                          <span className="text-destructive bg-destructive/10 px-2 py-0.5 rounded text-[10px] font-medium">
                            {isAr ? "تخطي" : "Skipped"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setBulkActive(false);
                setBulkOpen(false);
              }}
              disabled={bulkActive}
            >
              {isAr ? "إغلاق النافذة" : "Cancel Wizard"}
            </Button>

            <div className="flex items-center gap-2">
              {bulkMode === "guided" ? (
                <Button
                  onClick={sendGuidedNext}
                  disabled={bulkIndex >= bulkQueue.length}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                >
                  <ExternalLink className="h-4 w-4 me-1.5" />
                  {bulkIndex === 0
                    ? isAr
                      ? "بدء الإرسال (التالي)"
                      : "Start Send Next"
                    : isAr
                      ? "فتح الشات التالي"
                      : "Open Next Chat"}
                </Button>
              ) : (
                <>
                  {bulkActive ? (
                    <Button
                      onClick={() => setBulkActive(false)}
                      variant="outline"
                      className="border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100 flex items-center gap-1.5 font-medium"
                    >
                      <Pause className="h-4 w-4" />
                      {isAr ? "إيقاف مؤقت" : "Pause Queue"}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleStartAutomated}
                      disabled={bulkIndex >= bulkQueue.length}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5"
                    >
                      <Play className="h-4 w-4" />
                      {bulkIndex === 0
                        ? isAr
                          ? "بدء الإرسال التلقائي"
                          : "Start Automated Send"
                        : isAr
                          ? "استئناف"
                          : "Resume Queue"}
                    </Button>
                  )}
                  {bulkIndex > 0 && (
                    <Button
                      onClick={() => {
                        setBulkActive(false);
                        setBulkIndex(0);
                        const initialSent: Record<string, BulkStatus> = {};
                        bulkQueue.forEach((c) => {
                          initialSent[c.id] = "queued";
                        });
                        setBulkSent(initialSent);
                      }}
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Square className="h-4 w-4 text-destructive me-1.5" />
                      {isAr ? "إعادة تعيين" : "Reset"}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
