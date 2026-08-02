import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageSquare, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  generateCourierWhatsAppUrl,
  recordCourierNotified,
  formatNotifiedTimeAgo,
} from "@/lib/courier-whatsapp";

interface CourierWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  courier: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  brandSlug: string;
  lang?: "ar" | "en";
  onNotified?: () => void;
}

export function CourierWhatsAppModal({
  isOpen,
  onClose,
  order,
  courier,
  brandSlug,
  lang = "ar",
  onNotified,
}: CourierWhatsAppModalProps) {
  const isAr = lang === "ar";
  const [phone, setPhone] = useState(courier?.phone || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setPhone(courier?.phone || "");
  }, [courier?.phone, isOpen]);

  if (!order || !courier) return null;

  const courierName = courier.name || courier.email || (isAr ? "المندوب" : "Courier");
  const invNum = order.invoice_number || order.id?.slice(0, 8) || "N/A";
  const notifiedAgo = formatNotifiedTimeAgo((order as any).courier_notified_at, lang);

  const previewUrl = generateCourierWhatsAppUrl({
    order,
    courierPhone: phone || "97300000000",
    courierName,
    brandSlug,
    lang,
  });

  // Extract raw text from URL for preview box
  let previewText = "";
  try {
    const urlObj = new URL(previewUrl);
    previewText = urlObj.searchParams.get("text") || "";
  } catch {
    previewText = "";
  }

  const handleSend = async () => {
    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      toast.error(
        isAr
          ? "يرجى إدخال رقم هاتف المندوب قبل إرسال الإشعار"
          : "Please enter the courier's phone number before sending",
      );
      return;
    }

    setIsSaving(true);
    try {
      // 1. If phone was added/updated, update the courier's profile
      if (cleanPhone !== (courier.phone || "").trim()) {
        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ phone: cleanPhone } as any)
          .eq("id", courier.id);

        if (profileErr) {
          console.warn("[CourierWhatsAppModal] Failed to update courier phone:", profileErr);
        } else {
          courier.phone = cleanPhone;
        }
      }

      // 2. Generate final wa.me URL
      const finalUrl = generateCourierWhatsAppUrl({
        order,
        courierPhone: cleanPhone,
        courierName,
        brandSlug,
        lang,
      });

      // 3. Record notification timestamp in database
      await recordCourierNotified(order.id);

      // 4. Open WhatsApp in a new tab
      window.open(finalUrl, "_blank", "noopener,noreferrer");

      toast.success(
        isAr
          ? `تم فتح واتساب لإرسال بيانات الطلب #${invNum}`
          : `WhatsApp opened for order #${invNum}`,
      );

      onNotified?.();
      onClose();
    } catch (err: any) {
      toast.error(
        err.message || (isAr ? "حدث خطأ أثناء معالجة الطلب" : "Error processing request"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-6 sm:p-7 gap-5" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
            <div className="p-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-foreground">
                {isAr ? "إشعار المندوب عبر الواتساب" : "Notify Courier via WhatsApp"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isAr
                  ? `إرسال التفاصيل إلى ${courierName} للطلب #${invNum}`
                  : `Send details to ${courierName} for Order #${invNum}`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Notification status badge if already notified */}
          {notifiedAgo && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                {isAr
                  ? `تم إشعار المندوب سابقاً (${notifiedAgo})`
                  : `Courier notified previously (${notifiedAgo})`}
              </span>
            </div>
          )}

          {/* Courier Phone Input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {isAr ? "رقم واتساب المندوب:" : "Courier WhatsApp Phone Number:"}
            </Label>
            <div className="relative">
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +973 33000000"
                dir="ltr"
                className={`font-mono text-sm ${
                  !phone.trim() ? "border-amber-500/60 focus-visible:ring-amber-500" : ""
                }`}
              />
            </div>
            {!phone.trim() && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                {isAr
                  ? "رقم المندوب غير مسجل! أدخل الرقم هنا ليتم حفظه وإرسال التفاصيل له فوراً."
                  : "No phone saved for courier. Enter it here to save & notify."}
              </p>
            )}
          </div>

          {/* Message Preview */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              {isAr ? "معاينة الرسالة القادمة:" : "Pre-filled Message Preview:"}
            </Label>
            <div
              className="p-3.5 rounded-xl border border-border bg-muted/40 text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto"
              dir={isAr ? "rtl" : "ltr"}
            >
              {previewText || (isAr ? "جاري تجهيز النص..." : "Generating message...")}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            {isAr ? "تخطي الآن" : "Skip for now"}
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={isSaving}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            <span>{isAr ? "إرسال عبر الواتساب الآن" : "Send WhatsApp Message Now"}</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-80" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
