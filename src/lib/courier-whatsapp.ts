import { supabase } from "@/integrations/supabase/client";

export function normalizePhoneForWhatsApp(phoneStr: string | null | undefined): string {
  if (!phoneStr) return "";
  let clean = phoneStr.replace(/[^\d]/g, "");
  clean = clean.replace(/^0+/, "");
  if (clean.length === 8) return `973${clean}`;
  if (clean.length === 9 && clean.startsWith("5")) return `966${clean}`;
  return clean;
}

export function generateCourierWhatsAppUrl(input: {
  order: any;
  courierPhone: string;
  courierName: string;
  brandSlug: string;
  lang?: "ar" | "en";
}): string {
  const isAr = input.lang === "ar";
  const phone = normalizePhoneForWhatsApp(input.courierPhone);
  if (!phone) return "";

  const invNum = input.order.invoice_number || input.order.id?.slice(0, 8) || "N/A";
  const orderUrl = `https://boutq.store/admin/b/${input.brandSlug}/orders/${input.order.id}`;

  // Customer delivery address
  const cust = input.order.customers || input.order.customer || {};
  const customerName = input.order.customer_name_snapshot || cust.name;
  const customerPhone = input.order.customer_phone_snapshot || cust.phone;
  const addrParts = [
    cust.address_line,
    cust.area || cust.city,
    cust.block ? (isAr ? `مجمع ${cust.block}` : `Block ${cust.block}`) : null,
    cust.road ? (isAr ? `طريق ${cust.road}` : `Road ${cust.road}`) : null,
    cust.building ? (isAr ? `مبنى ${cust.building}` : `Bldg ${cust.building}`) : null,
  ].filter(Boolean);

  const addr =
    addrParts.length > 0
      ? addrParts.join("، ")
      : cust.address || (isAr ? "غير محدد" : "Not specified");

  // Item count
  const items = input.order.order_items || [];
  const itemCount =
    items.reduce((acc: number, it: any) => acc + (Number(it.quantity) || 1), 0) ||
    items.length ||
    1;

  // COD Amount due
  const total = Number(input.order.total || 0);
  const paid = Number(input.order.advance_paid || input.order.paid_amount || 0);
  const amountDue = Math.max(0, total - paid);
  const cur = input.order.currency || "BHD";

  let msg = "";
  if (isAr) {
    msg =
      `مرحباً ${input.courierName} 👋\n` +
      `تم إسناد طلب جديد لك:\n\n` +
      `📌 *رقم الطلب:* #${invNum}\n` +
      `👤 *العميل:* ${customerName || "عميل"}\n` +
      `📞 *هاتف العميل:* ${customerPhone || "غير محدد"}\n` +
      `📍 *العنوان:* ${addr}\n` +
      `📦 *عدد المنتجات:* ${itemCount} صنف\n` +
      `💰 *المبلغ المطلوب تحصيله:* ${amountDue > 0 ? `${amountDue.toFixed(3)} ${cur}` : "مدفوع بالكامل ✅"}\n\n` +
      `🔗 *رابط تفاصيل الطلب:*\n${orderUrl}`;
  } else {
    msg =
      `Hi ${input.courierName} 👋\n` +
      `A new order has been assigned to you:\n\n` +
      `📌 *Order #:* #${invNum}\n` +
      `👤 *Customer:* ${customerName || "Customer"}\n` +
      `📞 *Phone:* ${customerPhone || "N/A"}\n` +
      `📍 *Address:* ${addr}\n` +
      `📦 *Items Count:* ${itemCount}\n` +
      `💰 *Amount to Collect:* ${amountDue > 0 ? `${amountDue.toFixed(3)} ${cur}` : "Fully Paid ✅"}\n\n` +
      `🔗 *Order Details Link:*\n${orderUrl}`;
  }

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

export function formatNotifiedTimeAgo(
  notifiedAt: string | null | undefined,
  lang: "ar" | "en" = "ar",
): string | null {
  if (!notifiedAt) return null;
  const date = new Date(notifiedAt);
  if (isNaN(date.getTime())) return null;
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60));
  if (diffMinutes < 1) return lang === "ar" ? "الآن" : "Just now";
  if (diffMinutes < 60) return lang === "ar" ? `منذ ${diffMinutes} د` : `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return lang === "ar" ? `منذ ${diffHours} س` : `${diffHours}h ago`;
  return date.toLocaleDateString(lang === "ar" ? "ar-BH-u-nu-latn" : "en-US");
}

export async function recordCourierNotified(orderId: string): Promise<string> {
  const nowIso = new Date().toISOString();
  try {
    await supabase
      .from("orders")
      .update({ courier_notified_at: nowIso } as any)
      .eq("id", orderId);
  } catch (err) {
    console.warn("[recordCourierNotified error]", err);
  }
  return nowIso;
}
