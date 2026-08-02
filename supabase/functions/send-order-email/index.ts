// Send order confirmation email via Zoho SMTP.
// Optimized for Supabase Edge Runtime CPU limits:
//   - Fast auth check (webhook secret OR Supabase JWT)
//   - Order query joins only real order relationships; settings are fetched by brand_id
//   - SMTP work executed inside EdgeRuntime.waitUntil() so the HTTP response
//     returns immediately (202 Accepted) — the client no longer waits on the
//     ~1-3s Zoho SMTPS handshake, avoiding "CPU Time exceeded".

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = Array.from(
  new Set(
    [
      ...(Deno.env.get("ALLOWED_ORIGINS") ?? "").split(","),
      "https://boutq.store",
      "https://www.boutq.store",
    ]
      .map((origin) => origin.trim())
      .filter(Boolean),
  ),
);

function corsHeadersFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const isAllowed =
    allowedOrigins.includes(origin) ||
    origin.endsWith(".pages.dev") ||
    origin.endsWith(".workers.dev") ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("https://localhost:") ||
    origin === "null";

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0] || "*",
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-webhook-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

type NotificationEvent =
  | "order_placed"
  | "benefit_payment_approved"
  | "benefit_payment_rejected"
  | "order_cancelled"
  | "order_delivered";

const NOTIFICATION_RECIPIENT_EVENT_FIELD: Record<NotificationEvent, string> = {
  order_placed: "receive_order_placed",
  benefit_payment_approved: "receive_benefit_payment_approved",
  benefit_payment_rejected: "receive_benefit_payment_rejected",
  order_cancelled: "receive_order_cancelled",
  order_delivered: "receive_order_delivered",
};

type Body = {
  order_id?: string;
  outbox_id?: string;
  email_token?: string;
  lang?: "ar" | "en";
  event?: NotificationEvent;
  wait_for_delivery?: boolean;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("ORDER_EMAIL_WEBHOOK_SECRET") ?? "";

// deno-lint-ignore no-explicit-any
const admin: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function escapeHtml(s: unknown) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
};

function parseSmtpHost(value: string | null | undefined) {
  const raw = String(value ?? "")
    .trim()
    .replace(/^smtps?:\/\//i, "");
  const [host, port] = raw.split(":");
  return { host: host || "smtp.zoho.com", port: Number(port) || 465 };
}

function eventCopy(
  event: NotificationEvent,
  isAr: boolean,
  rejectionReason?: string | null,
  paymentMethod?: string | null,
) {
  if (event === "order_placed") {
    if (isAr) {
      return paymentMethod === "benefit"
        ? { title: "تم استلام طلبك", body: "تم استلام طلبك. إيصال بنفت باي قيد التحقق." }
        : {
            title: "تم استلام طلبك",
            body: "تم استلام طلبك بنجاح. سنرسل لك تحديثات الطلب عبر البريد الإلكتروني.",
          };
    }
    return paymentMethod === "benefit"
      ? {
          title: "We received your order",
          body: "We received your BenefitPay order. Your payment is pending validation.",
        }
      : {
          title: "We received your order",
          body: "We received your order. We will email you as it progresses.",
        };
  }
  if (isAr) {
    if (event === "benefit_payment_approved")
      return { title: "تم تأكيد دفعتك", body: "تمت مراجعة إيصال بنفت باي وتأكيد الدفع بنجاح." };
    if (event === "benefit_payment_rejected")
      return {
        title: "تعذر قبول دفعتك",
        body: `سبب الرفض: ${rejectionReason || "يرجى التواصل مع المتجر."}`,
      };
    if (event === "order_cancelled")
      return {
        title: "تم إلغاء طلبك",
        body: "تم إلغاء طلبك. يرجى التواصل مع المتجر إذا كان لديك أي استفسار.",
      };
    if (event === "order_delivered")
      return { title: "تم تسليم طلبك", body: "تم تسليم طلبك بنجاح. شكرًا لتسوقك معنا." };
    if (event === "order_placed")
      return { title: "تم استلام طلبك", body: "تم استلام طلبك. سيتم التحقق من الدفع قبل تأكيده." };
  }
  if (event === "benefit_payment_approved")
    return {
      title: "Your payment is confirmed",
      body: "Your BenefitPay receipt was reviewed and your payment has been approved.",
    };
  if (event === "benefit_payment_rejected")
    return {
      title: "Your payment needs attention",
      body: `Reason: ${rejectionReason || "Please contact the store."}`,
    };
  if (event === "order_cancelled")
    return {
      title: "Your order was cancelled",
      body: "Your order has been cancelled. Please contact the store if you need help.",
    };
  if (event === "order_delivered")
    return {
      title: "Your order was delivered",
      body: "Your order has been delivered. Thank you for shopping with us.",
    };
  return {
    title: "We received your order",
    body: "Your order was received. Payment will be confirmed after it is reviewed.",
  };
}

function adminEventCopy(
  event: NotificationEvent,
  rejectionReason?: string | null,
  paymentMethod?: string | null,
) {
  if (event === "order_placed") {
    return {
      title: "New Order Placed",
      body:
        paymentMethod === "benefit"
          ? "A new BenefitPay order has been placed and is waiting for payment validation."
          : "A new order has been placed on your store.",
    };
  }
  if (event === "benefit_payment_approved") {
    return {
      title: "BenefitPay Receipt Approved",
      body: "A BenefitPay receipt has been reviewed and approved.",
    };
  }
  if (event === "benefit_payment_rejected") {
    return {
      title: "BenefitPay Receipt Rejected",
      body: `A BenefitPay receipt has been rejected. Reason: ${rejectionReason || "Not specified"}`,
    };
  }
  if (event === "order_cancelled") {
    return {
      title: "Order Cancelled",
      body: "An order has been cancelled.",
    };
  }
  if (event === "order_delivered") {
    return {
      title: "Order Delivered",
      body: "An order has been marked as delivered.",
    };
  }
  return {
    title: "Order Updated",
    body: "An order has been updated.",
  };
}

function fmt(n: number, currency: string, isAr: boolean) {
  try {
    return new Intl.NumberFormat(isAr ? "ar-BH" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 3,
    }).format(Number(n || 0));
  } catch {
    return `${Number(n || 0).toFixed(3)} ${currency}`;
  }
}

function paymentStatusLabel(
  status: string | null | undefined,
  isAr: boolean,
  paymentMethod?: string | null,
  orderStatus?: string | null,
) {
  const normalized = String(status ?? "")
    .toLowerCase()
    .replace(/[_-]/g, " ");
  const normalizedOrder = String(orderStatus ?? "")
    .toLowerCase()
    .replace(/[_-]/g, " ");
  // Benefit receipts are not unpaid while waiting for an administrator to
  // validate them. Once approved, payment_status becomes paid and the normal
  // paid label below is used by every subsequent email/resend.
  if (
    paymentMethod === "benefit" &&
    normalizedOrder === "pending verification" &&
    normalized !== "paid"
  ) {
    return isAr ? "بانتظار التحقق من الدفع" : "Pending payment validation";
  }
  if (isAr) {
    if (normalized.includes("partial")) return "مدفوع جزئياً";
    if (normalized.includes("unpaid") || normalized.includes("pending")) return "غير مدفوع";
    if (normalized.includes("paid")) return "مدفوع";
    return status || "غير محدد";
  }
  if (normalized.includes("partial")) return "Partially paid";
  if (normalized.includes("unpaid") || normalized.includes("pending")) return "Unpaid";
  if (normalized.includes("paid")) return "Paid";
  return status || "Not specified";
}

function renderHtml(
  o: any,
  items: any[],
  brandName: string,
  primary: string,
  isAr: boolean,
  event: NotificationEvent,
) {
  const dir = isAr ? "rtl" : "ltr";
  const L = isAr
    ? {
        greet: "شكراً لطلبك",
        intro: "تم استلام طلبك بنجاح. تفاصيله أدناه:",
        inv: "رقم الفاتورة",
        date: "التاريخ",
        item: "الصنف",
        qty: "الكمية",
        price: "السعر",
        total: "الإجمالي",
        subtotal: "المجموع الفرعي",
        discount: "الخصم",
        vat: "ضريبة القيمة المضافة",
        shipping: "الشحن",
        grand: "الإجمالي النهائي",
        paymentStatus: "حالة الدفع",
        advance: "الدفعة المقدمة",
        remaining: "المبلغ المتبقي",
        regards: "مع أطيب التحيات",
        footer: "هذه رسالة تلقائية، الرجاء عدم الرد.",
      }
    : {
        greet: "Thanks for your order",
        intro: "We received your order. Details below:",
        inv: "Invoice #",
        date: "Date",
        item: "Item",
        qty: "Qty",
        price: "Price",
        total: "Total",
        subtotal: "Subtotal",
        discount: "Discount",
        vat: "VAT",
        shipping: "Shipping",
        grand: "Grand total",
        paymentStatus: "Payment status",
        advance: "Advance payment",
        remaining: "Remaining balance",
        regards: "Warm regards",
        footer: "This is an automated message, please do not reply.",
      };
  const cur = o.currency ?? "BHD";
  const align = isAr ? "left" : "right";
  const discount = Number(o.discount || 0);
  const shipping = Number(o.shipping || 0);
  const taxAmount = Number(o.tax_amount || 0);
  const taxRate = Number(o.tax_rate || 0);
  const advancePaid = Number(o.advance_paid || 0);
  const total = Number(o.total || 0);
  const remaining = Math.max(total - advancePaid, 0);
  const paymentStatus = paymentStatusLabel(o.payment_status, isAr, o.payment_method, o.status);
  const eventMessage = eventCopy(event, isAr, o.benefit_receipt_rejection_reason, o.payment_method);
  const promoCode = String(o.promo_code ?? "").trim();
  const paymentMethodLabel = isAr ? "طريقة الدفع" : "Payment method";
  const fulfillmentLabel = isAr ? "طريقة الاستلام" : "Fulfillment";
  const promoLabel = isAr ? "رمز الخصم" : "Promo code";
  const paymentMethod =
    o.payment_method === "benefit"
      ? isAr
        ? "بنفت باي"
        : "Benefit Pay"
      : o.payment_method === "cod"
        ? isAr
          ? "الدفع عند الاستلام"
          : "Cash on delivery"
        : o.payment_method === "card"
          ? isAr
            ? "بطاقة"
            : "Card"
          : o.payment_method || (isAr ? "غير محدد" : "Not specified");
  const fulfillment =
    o.fulfillment_method === "delivery"
      ? isAr
        ? "توصيل"
        : "Home delivery"
      : o.fulfillment_method === "pickup"
        ? isAr
          ? "استلام من الفرع"
          : "Pickup from branch"
        : o.fulfillment_method === "digital"
          ? isAr
            ? "توصيل رقمي"
            : "Digital delivery"
          : o.fulfillment_method || (isAr ? "غير محدد" : "Not specified");
  const showVat = (o.tax_rate !== null && o.tax_rate !== undefined) || taxAmount > 0;
  const showPaymentSummary = !!o.payment_status || advancePaid > 0 || !!o.payment_method;
  const rows = items
    .map(
      (i: any) =>
        `<tr><td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:${isAr ? "right" : "left"};unicode-bidi:plaintext">${escapeHtml(i.description)}</td>` +
        `<td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>` +
        `<td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:${align}">${fmt(Number(i.unit_price), cur, isAr)}</td>` +
        `<td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:${align}">${fmt(Number(i.line_total), cur, isAr)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="${isAr ? "ar" : "en"}" dir="${dir}"><head><meta charset="utf-8"><title>${escapeHtml(brandName)} — ${L.inv} ${escapeHtml(o.invoice_number)}</title></head>
<body dir="${dir}" style="margin:0;background:#f7f7f8;font-family:Arial,'Segoe UI',Tahoma,sans-serif;color:#111;direction:${dir};text-align:${isAr ? "right" : "left"}">
<div dir="${dir}" style="max-width:640px;margin:0 auto;background:#fff;direction:${dir};text-align:${isAr ? "right" : "left"}">
<div style="padding:24px 28px;background:${primary};color:#fff"><h1 style="margin:0;font-size:22px">${escapeHtml(brandName)}</h1><p style="margin:6px 0 0;opacity:.9">${L.greet}</p></div>
<div style="padding:24px 28px">
<div style="margin:0 0 18px;padding:14px 16px;border-radius:10px;background:#f7f5f4;border:1px solid #eee;direction:${dir};text-align:${isAr ? "right" : "left"}"><strong>${escapeHtml(eventMessage.title)}</strong><div style="margin-top:5px;color:#444;line-height:1.55">${escapeHtml(eventMessage.body)}</div></div>
<p style="margin:0 0 16px">${L.intro}</p>
<p style="margin:0 0 4px"><strong>${L.inv}:</strong> ${escapeHtml(o.invoice_number)}</p>
<p style="margin:0 0 16px"><strong>${L.date}:</strong> ${new Date(o.order_date).toLocaleDateString(isAr ? "ar-BH" : "en-US")}</p>
<table dir="${dir}" style="width:100%;border-collapse:collapse;margin-top:8px;font-size:14px;direction:${dir};text-align:${isAr ? "right" : "left"}"><thead><tr>
<th style="padding:10px 8px;border-bottom:2px solid #111;text-align:${isAr ? "right" : "left"}">${L.item}</th>
<th style="padding:10px 8px;border-bottom:2px solid #111;text-align:center">${L.qty}</th>
<th style="padding:10px 8px;border-bottom:2px solid #111;text-align:${align}">${L.price}</th>
<th style="padding:10px 8px;border-bottom:2px solid #111;text-align:${align}">${L.total}</th>
</tr></thead><tbody>${rows}</tbody></table>
<table dir="${dir}" style="width:100%;margin-top:16px;font-size:14px;direction:${dir}">
<tr><td style="padding:4px 8px">${L.subtotal}</td><td style="padding:4px 8px;text-align:${align}">${fmt(Number(o.subtotal), cur, isAr)}</td></tr>
<tr><td style="padding:4px 8px">${L.discount}${promoCode ? ` <span style="color:#666">(${promoLabel}: ${escapeHtml(promoCode)})</span>` : ""}</td><td style="padding:4px 8px;text-align:${align}">- ${fmt(discount, cur, isAr)}</td></tr>
${showVat ? `<tr><td style="padding:4px 8px">${L.vat}${Number.isFinite(taxRate) ? ` (${taxRate}%)` : ""}</td><td style="padding:4px 8px;text-align:${align}">${fmt(taxAmount, cur, isAr)}</td></tr>` : ""}
<tr><td style="padding:4px 8px">${L.shipping}</td><td style="padding:4px 8px;text-align:${align}">${fmt(shipping, cur, isAr)}</td></tr>
<tr><td style="padding:8px;font-weight:700;border-top:1px solid #ddd">${L.grand}</td><td style="padding:8px;font-weight:700;text-align:${align};border-top:1px solid #ddd">${fmt(total, cur, isAr)}</td></tr>
<tr><td style="padding:8px 8px 4px">${paymentMethodLabel}</td><td style="padding:8px 8px 4px;text-align:${align}">${escapeHtml(paymentMethod)}</td></tr>
<tr><td style="padding:4px 8px">${fulfillmentLabel}</td><td style="padding:4px 8px;text-align:${align}">${escapeHtml(fulfillment)}</td></tr>
${showPaymentSummary ? `<tr><td style="padding:8px 8px 4px">${L.paymentStatus}</td><td style="padding:8px 8px 4px;text-align:${align}"><span style="display:inline-block;padding:3px 8px;border-radius:999px;background:#eaf2ff;color:#1558d6;border:1px solid #b8d2ff;font-size:12px">${escapeHtml(paymentStatus)}</span></td></tr>` : ""}
${advancePaid > 0 ? `<tr><td style="padding:4px 8px">${L.advance}</td><td style="padding:4px 8px;text-align:${align}">- ${fmt(advancePaid, cur, isAr)}</td></tr>` : ""}
${advancePaid > 0 ? `<tr><td style="padding:8px;font-weight:700">${L.remaining}</td><td style="padding:8px;font-weight:700;text-align:${align}">${fmt(remaining, cur, isAr)}</td></tr>` : ""}
</table>
${
  o.public_invoice_token || o.id
    ? `
<div style="margin:24px 0 16px;text-align:center;">
  <a href="https://boutq.store/invoice/${escapeHtml(o.public_invoice_token || o.id)}" style="display:inline-block;padding:12px 28px;background:${primary};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
    ${isAr ? "عرض وتنزيل الفاتورة الإلكترونية" : "View & Download Invoice"}
  </a>
</div>`
    : ""
}
<p style="margin:24px 0 0">${L.regards},<br/><strong>${escapeHtml(brandName)}</strong></p>
</div>
<div style="padding:14px 28px;background:#fafafa;color:#888;font-size:12px;text-align:center">${L.footer}</div>
</div></body></html>`;
}

async function auditNotification(input: {
  brandId: string;
  orderId: string;
  event: NotificationEvent;
  channel: "customer" | "admin";
  recipient?: string | null;
  provider?: string | null;
  status: "sent" | "failed" | "skipped";
  error?: string | null;
}) {
  try {
    await admin.from("brand_email_notifications").insert({
      brand_id: input.brandId,
      order_id: input.orderId,
      event_type: input.event,
      channel: input.channel,
      recipient: input.recipient ?? null,
      provider: input.provider ?? null,
      status: input.status,
      error_message: input.error?.slice(0, 500) ?? null,
    });
  } catch (error) {
    // The email itself must not fail because the audit migration was not yet applied.
    console.warn("[send-order-email] audit unavailable", String(error));
  }
}

async function getIntegration(brandId: string, provider: string) {
  const { data, error } = await admin.rpc("get_integration_credential_secret", {
    p_brand_id: brandId,
    p_provider: provider,
  });
  if (error) console.warn(`[send-order-email] ${provider} lookup failed`, error.message);
  const integration = data?.[0];
  return integration?.is_active ? integration : null;
}

async function customerEmailConfigurationError(brandId: string) {
  const integration = await getIntegration(brandId, "resend_customer_email");
  if (!integration) return "Customer email is not configured for this brand";
  if (!integration.base_url?.trim() || !integration.api_key?.trim()) {
    return "Customer email configuration is incomplete for this brand";
  }
  return null;
}

// Keep all subjects ASCII-only. This avoids malformed MIME subjects in mailbox
// clients that do not decode Arabic encoded-word headers reliably.
function subjectForEvent(event: NotificationEvent, invoiceNumber: unknown, brandName: string) {
  const label: Record<NotificationEvent, string> = {
    order_placed: "Order Confirmation",
    benefit_payment_approved: "Payment Confirmed",
    benefit_payment_rejected: "Payment Requires Attention",
    order_cancelled: "Order Cancelled",
    order_delivered: "Order Delivered",
  };
  return `${label[event]} #${invoiceNumber} - ${brandName}`;
}

function adminSubjectForEvent(event: NotificationEvent, invoiceNumber: unknown, brandName: string) {
  const label: Record<NotificationEvent, string> = {
    order_placed: "New Order",
    benefit_payment_approved: "Payment Approved",
    benefit_payment_rejected: "Payment Rejected",
    order_cancelled: "Order Cancelled",
    order_delivered: "Order Delivered",
  };
  return `[${label[event]}] #${invoiceNumber} - ${brandName}`;
}

async function sendCustomerEmail(input: {
  order: any;
  settings: any;
  to: string;
  lang: "ar" | "en";
  event: NotificationEvent;
}) {
  const integration = await getIntegration(input.order.brand_id, "resend_customer_email");
  const configurationError = await customerEmailConfigurationError(input.order.brand_id);
  if (!integration || configurationError)
    throw new Error(configurationError ?? "Customer email is not configured for this brand");
  const fromAddress = integration.base_url?.trim();
  const apiKey = integration.api_key?.trim();
  if (!fromAddress || !apiKey) {
    throw new Error("Customer email configuration is incomplete for this brand");
  }

  const brandName = input.settings?.business_name ?? "Boutq";
  const senderName = input.settings?.email_sender_name?.trim() || brandName;
  const primary = input.settings?.primary_color ?? "#111827";
  const subject = subjectForEvent(input.event, input.order.invoice_number, brandName);
  const html = renderHtml(
    input.order,
    input.order.order_items ?? [],
    brandName,
    primary,
    input.lang === "ar",
    input.event,
  );

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${senderName} <${fromAddress}>`,
      to: [input.to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`Resend delivery failed (${response.status})${details ? `: ${details}` : ""}`);
  }
}

async function sendAdminNotification(input: {
  order: any;
  settings: any;
  event: NotificationEvent;
  lang: "ar" | "en";
}): Promise<AdminEmailDeliveryResult> {
  const integration = await getIntegration(input.order.brand_id, "sendpulse_admin");
  if (!integration) {
    const error = "SendPulse admin notifications are not configured for this brand";
    await auditNotification({
      brandId: input.order.brand_id,
      orderId: input.order.id,
      event: input.event,
      channel: "admin",
      status: "skipped",
      provider: "sendpulse",
      error,
    });
    return { status: "skipped", error };
  }
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("email, name")
    .eq("brand_id", input.order.brand_id)
    .eq("status", "active")
    .in("role", ["admin", "brand_admin"]);

  if (profilesError)
    throw new Error(`Could not load brand administrators: ${profilesError.message}`);

  // Custom recipients are additive and event-specific. The migration may not
  // have been applied on an older project yet, so retain the secure brand-admin
  // default rather than failing all internal email during that short period.
  const eventField = NOTIFICATION_RECIPIENT_EVENT_FIELD[input.event];
  const { data: configuredRecipients, error: configuredRecipientsError } = await admin
    .from("brand_notification_recipients")
    .select("email, name")
    .eq("brand_id", input.order.brand_id)
    .eq("active", true)
    .eq(eventField, true);

  const recipientTableUnavailable =
    configuredRecipientsError?.code === "42P01" || configuredRecipientsError?.code === "PGRST205";
  if (configuredRecipientsError && !recipientTableUnavailable) {
    throw new Error(`Could not load notification recipients: ${configuredRecipientsError.message}`);
  }

  const recipientMap = new Map<string, { email: string; name?: string }>();
  for (const recipient of [...(profiles ?? []), ...(configuredRecipients ?? [])] as any[]) {
    const email = String(recipient.email ?? "")
      .trim()
      .toLowerCase();
    if (!email || recipientMap.has(email)) continue;
    const name = String(recipient.name ?? "").trim();
    recipientMap.set(email, { email, ...(name ? { name } : {}) });
  }
  const recipients = [...recipientMap.values()];
  if (!recipients.length) {
    const error = "No active brand administrator or notification recipient is configured";
    await auditNotification({
      brandId: input.order.brand_id,
      orderId: input.order.id,
      event: input.event,
      channel: "admin",
      status: "skipped",
      provider: "sendpulse",
      error,
    });
    return { status: "skipped", error };
  }
  const clientId = integration.api_key?.trim();
  const clientSecret = integration.webhook_secret?.trim();
  const fromAddress = integration.base_url?.trim();
  if (!clientId || !clientSecret || !fromAddress)
    throw new Error("SendPulse credentials are incomplete");
  const tokenResponse = await fetch("https://api.sendpulse.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!tokenResponse.ok) {
    const details = (await tokenResponse.text()).slice(0, 300);
    throw new Error(
      `SendPulse authorization failed (${tokenResponse.status})${details ? `: ${details}` : ""}`,
    );
  }
  const accessToken = (await tokenResponse.json()).access_token;
  const eventMessage = adminEventCopy(
    input.event,
    input.order.benefit_receipt_rejection_reason,
    input.order.payment_method,
  );
  const brandName = input.settings?.business_name ?? "Boutq";
  const brandSlug = String(input.order.brand?.slug ?? "").trim();
  const orderUrl = brandSlug
    ? `https://boutq.store/admin/b/${encodeURIComponent(brandSlug)}/orders/${input.order.id}`
    : "https://boutq.store/admin";
  const payload = {
    email: {
      html: `<h2>${escapeHtml(eventMessage.title)}</h2><p>${escapeHtml(eventMessage.body)}</p><p><strong>Order #${escapeHtml(input.order.invoice_number)}</strong></p><p><a href="${orderUrl}">Open order in Boutq</a></p>`,
      text: `${eventMessage.title}\n${eventMessage.body}\nOrder #${input.order.invoice_number}\n${orderUrl}`,
      subject: adminSubjectForEvent(input.event, input.order.invoice_number, brandName),
      from: { name: brandName, email: fromAddress },
      to: recipients.map((recipient) => ({
        email: recipient.email,
        ...(recipient.name ? { name: recipient.name } : {}),
      })),
    },
  };
  const sendResponse = await fetch("https://api.sendpulse.com/smtp/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!sendResponse.ok) {
    const details = (await sendResponse.text()).slice(0, 300);
    throw new Error(
      `SendPulse delivery failed (${sendResponse.status})${details ? `: ${details}` : ""}`,
    );
  }
  await Promise.all(
    recipients.map((recipient) =>
      auditNotification({
        brandId: input.order.brand_id,
        orderId: input.order.id,
        event: input.event,
        channel: "admin",
        recipient: recipient.email,
        provider: "sendpulse",
        status: "sent",
      }),
    ),
  );
  return { status: "sent" };
}

type CustomerEmailDeliveryResult = {
  status: "sent" | "failed" | "skipped";
  error?: string;
};

type AdminEmailDeliveryResult = CustomerEmailDeliveryResult;

type NotificationDeliveryResult = {
  customer: CustomerEmailDeliveryResult;
  admin: AdminEmailDeliveryResult;
};

async function sendAndLog(
  orderId: string,
  lang: "ar" | "en",
  event: NotificationEvent,
): Promise<NotificationDeliveryResult> {
  try {
    // Query the order and its direct relationships only. business_settings is
    // linked to brands, not orders, so fetch it separately by order.brand_id.
    const { data: order, error: oe } = await admin
      .from("orders")
      .select(
        `
        id, brand_id, invoice_number, order_date, status, subtotal, discount, promo_code, tax_amount, tax_rate,
        shipping, total, currency, customer_id, advance_paid, payment_status, payment_method, fulfillment_method,
        benefit_receipt_rejection_reason, public_invoice_token,
        customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot,
        brand:brands ( slug ),
        order_items ( description, quantity, unit_price, line_total ),
        customer:customers ( email, name )
      `,
      )
      .eq("id", orderId)
      .maybeSingle();

    if (oe || !order) throw new Error(oe?.message ?? "Order not found");

    const { data: settings, error: se } = await admin
      .from("business_settings")
      .select("business_name, primary_color, email_sender_name")
      .eq("brand_id", order.brand_id)
      .maybeSingle();

    if (se) console.warn("[send-order-email] settings lookup failed", se.message);

    order.customer = {
      ...(order.customer ?? {}),
      name: order.customer_name_snapshot || order.customer?.name || "",
      email: order.customer_email_snapshot || order.customer?.email || "",
    };
    const to = (order.customer?.email ?? "").trim();
    let customerResult: CustomerEmailDeliveryResult;
    let adminResult: AdminEmailDeliveryResult;

    // Define customer delivery routine
    const customerPromise = (async (): Promise<CustomerEmailDeliveryResult> => {
      if (!to) {
        const error = "No customer email on file";
        try {
          await admin
            .from("orders")
            .update({
              confirmation_email_status: "failed",
              confirmation_email_error: error,
            })
            .eq("id", orderId);
        } catch (ue) {
          console.warn("[send-order-email] failed to update order status", ue);
        }
        await auditNotification({
          brandId: order.brand_id,
          orderId,
          event,
          channel: "customer",
          status: "skipped",
          provider: "resend_customer_email",
          error,
        });
        return { status: "skipped", error };
      } else {
        try {
          await sendCustomerEmail({ order, settings, to, lang, event });
          await auditNotification({
            brandId: order.brand_id,
            orderId,
            event,
            channel: "customer",
            recipient: to,
            provider: "resend_customer_email",
            status: "sent",
          });
          try {
            await admin
              .from("orders")
              .update({
                confirmation_email_status: "sent",
                confirmation_email_sent_at: new Date().toISOString(),
                confirmation_email_error: null,
              })
              .eq("id", orderId);
          } catch (ue) {
            console.warn("[send-order-email] failed to update order status", ue);
          }
          return { status: "sent" };
        } catch (error: any) {
          const message = String(error?.message ?? error ?? "Customer email failed").slice(0, 500);
          await auditNotification({
            brandId: order.brand_id,
            orderId,
            event,
            channel: "customer",
            recipient: to,
            provider: "resend_customer_email",
            status: "failed",
            error: message,
          });
          try {
            await admin
              .from("orders")
              .update({ confirmation_email_status: "failed", confirmation_email_error: message })
              .eq("id", orderId);
          } catch (ue) {
            console.warn("[send-order-email] failed to update order status", ue);
          }
          return { status: "failed", error: message };
        }
      }
    })();

    // Define admin delivery routine
    const adminPromise = (async (): Promise<AdminEmailDeliveryResult> => {
      // Admins only receive 'order_placed' (new order) and 'order_delivered' (order delivered)
      if (!["order_placed", "order_delivered"].includes(event)) {
        return { status: "skipped" };
      }
      try {
        return await sendAdminNotification({ order, settings, event, lang });
      } catch (error: any) {
        const message = String(error?.message ?? error ?? "Admin notification failed").slice(
          0,
          500,
        );
        await auditNotification({
          brandId: order.brand_id,
          orderId,
          event,
          channel: "admin",
          provider: "sendpulse",
          status: "failed",
          error: message,
        });
        return { status: "failed", error: message };
      }
    })();

    // Run both concurrently in parallel
    const [cRes, aRes] = await Promise.all([customerPromise, adminPromise]);
    customerResult = cRes;
    adminResult = aRes;

    return { customer: customerResult, admin: adminResult };
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "Unknown error").slice(0, 500);
    console.error("[send-order-email] failed", msg);
    try {
      await admin
        .from("orders")
        .update({
          confirmation_email_status: "failed",
          confirmation_email_error: msg,
        })
        .eq("id", orderId);
    } catch {
      /* noop */
    }
    return {
      customer: { status: "failed", error: msg },
      admin: { status: "skipped", error: "Order email processing did not complete" },
    };
  }
}

function json(data: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function secretsEqual(left: string, right: string): Promise<boolean> {
  if (!left || !right) return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index] ^ rightBytes[index];
  }
  return mismatch === 0;
}

Deno.serve(async (req, info) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  // Auth is verified below. Merely looking like a Bearer token is not proof of
  // authentication (the public anon key is also normally sent as Bearer).
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";
  const authz = req.headers.get("authorization") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
  const [isServiceRole, hasWebhookSecret] = await Promise.all([
    secretsEqual(token, serviceRoleKey),
    secretsEqual(providedSecret, WEBHOOK_SECRET),
  ]);
  const secretOk = hasWebhookSecret || isServiceRole;

  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    /* noop */
  }
  let orderId = body.order_id;
  let outboxId: string | undefined;
  let outboxClaimed = false;
  let lang: "ar" | "en" = body.lang === "ar" ? "ar" : "en";
  const waitForDelivery = body.wait_for_delivery === true;
  let event: NotificationEvent = [
    "order_placed",
    "benefit_payment_approved",
    "benefit_payment_rejected",
    "order_cancelled",
    "order_delivered",
  ].includes(body.event ?? "")
    ? (body.event as NotificationEvent)
    : "order_placed";

  let authorized = secretOk;
  let privileged = secretOk;
  if (body.outbox_id) {
    if (!secretOk) return json({ error: "Forbidden" }, 403, corsHeaders);
    outboxId = body.outbox_id;
    const { data: claimedEvents, error: claimError } = await admin.rpc("claim_order_email_event", {
      p_event_id: outboxId,
    });
    const claimedEvent = claimedEvents?.[0] ?? null;

    if (claimError) return json({ error: "Could not claim email event" }, 500, corsHeaders);
    if (!claimedEvent) return json({ ok: true, duplicate: true }, 200, corsHeaders);
    orderId = claimedEvent.order_id;
    event = claimedEvent.event_type as NotificationEvent;
    lang = claimedEvent.language === "ar" ? "ar" : "en";
    authorized = true;
    privileged = true;
    outboxClaimed = true;
  }

  if (!orderId) return json({ error: "order_id required" }, 400, corsHeaders);
  if (!authorized && token) {
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (user) {
      const { data: order } = await admin
        .from("orders")
        .select("brand_id, customer:customers(auth_user_id)")
        .eq("id", orderId)
        .maybeSingle();
      const customerOwnsOrder = order?.customer?.auth_user_id === user.id;
      const { data: profile } = await admin
        .from("profiles")
        .select("role, status, brand_id")
        .eq("id", user.id)
        .maybeSingle();
      const isActiveAdmin =
        profile?.status === "active" &&
        ["admin", "brand_admin", "super_admin"].includes(profile.role) &&
        (profile.role === "super_admin" || profile.brand_id === order?.brand_id);
      authorized = customerOwnsOrder || isActiveAdmin;
      privileged = isActiveAdmin;
    }
  }

  // Guest checkout gets a random, order-scoped capability from the checkout
  // RPC. It authorizes sending only this order's confirmation email.
  if (!authorized && body.email_token) {
    // Consume the guest capability atomically so a copied token cannot be
    // replayed to send repeated messages.
    const { data: tokenMatch } = await admin
      .from("orders")
      .update({ confirmation_email_token: crypto.randomUUID() })
      .eq("id", orderId)
      .eq("confirmation_email_token", body.email_token)
      .select("id")
      .maybeSingle();
    authorized = !!tokenMatch;
  }
  if (!authorized) return json({ error: "Forbidden" }, 403, corsHeaders);
  if (event !== "order_placed" && !privileged)
    return json({ error: "Forbidden" }, 403, corsHeaders);

  // An explicit dashboard Send/Resend action must fail fast when the brand
  // has not configured its customer mailbox. Storefront checkout, including
  // guest checkout, must still continue into sendAndLog so each independent
  // channel is attempted and audited: a missing Zoho configuration must not
  // suppress a configured SendPulse admin alert.
  const { data: emailOrder, error: emailOrderError } = await admin
    .from("orders")
    .select("brand_id")
    .eq("id", orderId)
    .maybeSingle();
  if (emailOrderError || !emailOrder) return json({ error: "Order not found" }, 404, corsHeaders);
  const configurationError = await customerEmailConfigurationError(emailOrder.brand_id);
  if (waitForDelivery && configurationError)
    return json({ error: configurationError }, 422, corsHeaders);

  // Execute synchronously to ensure Zoho SMTP timeouts (optimized to 1.5s)
  // are caught, completed, and logged successfully in the database, without
  // ever having the serverless worker container suspend/terminate our process.
  const result = await sendAndLog(orderId, lang, event);

  if (outboxClaimed && outboxId) {
    const failedChannels = [result.customer, result.admin]
      .filter((channel) => channel.status === "failed")
      .map((channel) => channel.error)
      .filter(Boolean);
    await admin
      .from("order_email_events")
      .update({
        status: failedChannels.length > 0 ? "failed" : "processed",
        processed_at: new Date().toISOString(),
        last_error: failedChannels.length > 0 ? failedChannels.join("; ").slice(0, 1000) : null,
      })
      .eq("id", outboxId);
  }

  // If the dashboard explicitly requested wait_for_delivery (Send/Resend) and it failed,
  // report a 422 error on the admin panel.
  if (waitForDelivery && result.customer.status !== "sent") {
    return json(
      {
        error: result.customer.error ?? "Customer email could not be sent",
        customer: result.customer,
        admin: result.admin,
      },
      422,
      corsHeaders,
    );
  }

  // For storefront checkout, we always return a 200 OK so checkout is never blocked
  // even if customer-side Zoho SMTP failed/timed out.
  return json(
    {
      ok: true,
      customer: result.customer,
      admin: result.admin,
    },
    200,
    corsHeaders,
  );
});
