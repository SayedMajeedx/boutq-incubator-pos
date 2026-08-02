import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useT, useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneInput } from "@/components/phone-input";
import { toast } from "sonner";
import { Send, Plus, Trash2 } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";
import {
  getOrderCustomerName,
  getOrderCustomerPhone,
  getOrderCustomerEmail,
} from "@/lib/order-customer-snapshot";

type Tpl = {
  id: string;
  name: string;
  channel: "email" | "whatsapp" | "both";
  subject: string | null;
  body: string;
  is_default: boolean;
};

const BRAND: Record<"en" | "ar", string> = { en: "Boutq", ar: "بوتك" };
const LEGACY_BRAND_NAMES = new Set(["Abaya Atelier", "أباية أتيليه"]);
function brandFor(lang: "en" | "ar", stored?: string | null) {
  const s = (stored ?? "").trim();
  if (!s || LEGACY_BRAND_NAMES.has(s)) return BRAND[lang];
  return s;
}

function renderTemplate(str: string, vars: Record<string, string>) {
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

function defaultBody() {
  return `Hi {{customer_name}},

Thank you for your order with {{business_name}}. Please find your invoice details below:

Invoice #: {{invoice_number}}
Date: {{date}}
Total: {{total}}

Please let us know if you have any questions.

Warm regards,
{{business_name}}`;
}

export function ManageTemplatesDialog({
  open,
  onOpenChange,
  templates,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templates: Tpl[];
  onChanged: () => void;
}) {
  const { lang } = useI18n();
  const [editing, setEditing] = useState<Partial<Tpl> | null>(null);

  const startNew = () =>
    setEditing({ name: "", channel: "both", subject: "", body: defaultBody(), is_default: false });

  const save = async () => {
    if (!editing?.name || !editing?.body)
      return toast.error(lang === "ar" ? "الاسم والمحتوى مطلوبان" : "Name and body are required");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      user_id: user.id,
      name: editing.name!,
      channel: editing.channel ?? "both",
      subject: editing.subject ?? null,
      body: editing.body!,
      is_default: !!editing.is_default,
    };
    if (payload.is_default) {
      await supabase.from("message_templates").update({ is_default: false }).eq("user_id", user.id);
    }
    let error;
    if (editing.id) {
      ({ error } = await supabase.from("message_templates").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await (supabase.from("message_templates") as any).insert(payload));
    }
    if (error) return toast.error(error.message);
    toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
    setEditing(null);
    onChanged();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("message_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(lang === "ar" ? "تم الحذف" : "Deleted");
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Message templates</DialogTitle>
          <DialogDescription>
            Use placeholders like <code>{"{{customer_name}}"}</code>,{" "}
            <code>{"{{business_name}}"}</code>, <code>{"{{invoice_number}}"}</code>,{" "}
            <code>{"{{date}}"}</code>, <code>{"{{total}}"}</code>, <code>{"{{notes}}"}</code>.
          </DialogDescription>
        </DialogHeader>

        {!editing && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button size="sm" onClick={startNew}>
                <Plus className="h-3 w-3 mr-1" /> New template
              </Button>
            </div>
            {templates.length === 0 && (
              <p className="text-sm text-muted-foreground">No templates yet.</p>
            )}
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between border border-border rounded-md p-3"
              >
                <div>
                  <p className="font-medium text-sm">
                    {t.name}{" "}
                    {t.is_default && <span className="text-xs text-primary">★ default</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.channel}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Channel</Label>
                <Select
                  value={editing.channel ?? "both"}
                  onValueChange={(v) => setEditing({ ...editing, channel: v as Tpl["channel"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both</SelectItem>
                    <SelectItem value="email">Email only</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Email subject (optional)</Label>
              <Input
                value={editing.subject ?? ""}
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
              />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea
                rows={12}
                value={editing.body ?? ""}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!editing.is_default}
                onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })}
              />
              Use as default template
            </label>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={save}>Save template</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function SendInvoiceDialog({
  order,
  totals,
  settings,
  currency,
}: {
  order: any;
  totals: any;
  settings: any;
  currency: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const qc = useQueryClient();

  const vars = useMemo(
    () => ({
      customer_name: getOrderCustomerName(order) || "there",
      customer_email: getOrderCustomerEmail(order),
      customer_phone: getOrderCustomerPhone(order),
      business_name: brandFor("en", settings?.business_name),
      invoice_number: String(order?.invoice_number ?? ""),
      date: formatDate(order?.created_at ?? order?.order_date, "en-BH"),
      total: formatMoney(totals.total, currency),
      notes: order?.notes ?? "",
    }),
    [order, totals, settings, currency],
  );

  const brand = useBrand();
  const brandId = brand.id;
  const templatesQ = useQuery({
    queryKey: ["message-templates", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Tpl[];
    },
  });

  const [selectedId, setSelectedId] = useState<string>("__default");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setPhone(getOrderCustomerPhone(order));
    const tpl = templatesQ.data?.find((t) => t.id === selectedId);
    const rawBody = tpl?.body ?? defaultBody();
    setMessage(renderTemplate(rawBody, vars));
  }, [open, selectedId, templatesQ.data, vars, order]);

  useEffect(() => {
    if (selectedId !== "__default") return;
    const def = templatesQ.data?.find((t) => t.is_default);
    if (def) setSelectedId(def.id);
  }, [templatesQ.data, selectedId]);

  const openWhatsApp = () => {
    const digits = (phone || "").replace(/[^\d]/g, "");
    if (!digits)
      return toast.error(
        "This customer has no phone on file — add it in Customers or type one here (with country code)",
      );
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const invoiceLink = `${origin}/invoice/${order.public_invoice_token}`;
    const finalMessage = message.replace(/\{\{\s*Dynamic Invoice Link\s*\}\}/g, invoiceLink);
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(finalMessage)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Send className="h-4 w-4 mr-2" /> {t("orderDetail.sendInvoiceWa")}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("orderDetail.sendInvoiceWa")}</DialogTitle>
            <DialogDescription>
              Pick a template, tweak the message, then open WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label>Template</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default">— Built-in default —</SelectItem>
                  {(templatesQ.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.is_default ? " ★" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
              Manage
            </Button>
          </div>

          <div className="space-y-3 mt-4">
            <div>
              <Label>Phone (country code + number)</Label>
              <PhoneInput value={phone} onChange={setPhone} />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea rows={10} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Opens WhatsApp Web or the WhatsApp app with the message pre-filled — you send it
              manually. Attach the printed PDF there if needed.
            </p>
            <DialogFooter>
              <Button onClick={openWhatsApp}>
                <Send className="h-4 w-4 mr-2" /> Open WhatsApp
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ManageTemplatesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        templates={templatesQ.data ?? []}
        onChanged={() => qc.invalidateQueries({ queryKey: ["message-templates"] })}
      />
    </>
  );
}
