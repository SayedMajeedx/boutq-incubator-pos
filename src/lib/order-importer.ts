import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const OrderImportSchema = z.object({
  brandId: z.string().uuid(),
  orders: z.array(
    z.object({
      orderNumber: z.string(),
      orderDate: z.string(),
      customerName: z.string().nullable(),
      customerPhone: z.string().nullable(),
      customerEmail: z.string().nullable(),
      totalPrice: z.number(),
      paymentStatus: z.string().default("paid"),
      source: z.string(), // "shopify" | "salla" | "zid" | "woocommerce"
      notes: z.string().nullable(),
      items: z.array(
        z.object({
          name: z.string(),
          quantity: z.number().default(1),
          price: z.number(),
        }),
      ),
    }),
  ),
});

// Helper to verify standard brand access or superadmin impersonation
async function verifyBrandAccess(brandId: string, context: any) {
  const userId = context.userId;
  if (!userId) {
    throw new Error("UNAUTHORIZED: Active user session could not be resolved.");
  }

  // 1. Check direct brand access (standard brand administrators)
  const { data: hasAccess, error: accessErr } = await context.supabase.rpc("can_access_brand", {
    _brand_id: brandId,
  });
  if (accessErr) {
    console.error("Supabase can_access_brand RPC failed:", accessErr);
  }

  if (hasAccess === true) {
    return true; // Direct access granted
  }

  // 2. Check for technical support impersonation token if standard access check fails
  try {
    const { readImpersonationCookie } = await import("@/lib/impersonation-cookies.server");
    const cookieToken = await readImpersonationCookie();
    if (cookieToken) {
      const tokenPayload = JSON.parse(Buffer.from(cookieToken, "base64").toString("utf-8"));
      if (tokenPayload && tokenPayload.targetTenantId === brandId) {
        // Confirm the operator is an authorized Superadmin (via RPC or hardcoded emails)
        const { data: isSuperAdmin } = await context.supabase.rpc("is_admin");
        const email = (context.claims?.email || "").toLowerCase();
        const isFixedSuperAdmin = email === "majeed@hotmail.it" || email === "majeed@hotmail.com";

        if (isSuperAdmin || isFixedSuperAdmin) {
          console.log(
            `[Impersonation Auth] Superadmin (${email}) authorized to perform order import on brand: ${brandId}`,
          );
          return true; // Impersonation access granted
        }
      }
    }
  } catch (err) {
    console.error("Failed to resolve impersonation cookie credentials:", err);
  }

  throw new Error(
    "FORBIDDEN: You do not have permission to import historical orders under this brand.",
  );
}

export const importHistoricalOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => OrderImportSchema.parse(raw))
  .handler(async ({ data, context }) => {
    try {
      const userId = context.userId;
      if (!userId) throw new Error("UNAUTHORIZED: Session user not found");

      // Verify permission checks
      await verifyBrandAccess(data.brandId, context);

      let successCount = 0;
      const totalCount = data.orders.length;

      // 1. Get business settings for default currency
      const { data: bizSettings } = await context.supabase
        .from("business_settings")
        .select("currency, next_invoice_number")
        .eq("brand_id", data.brandId)
        .maybeSingle();

      const currency = bizSettings?.currency || "BHD";

      // 2. Fetch the max invoice number currently in database to calculate fallbacks
      const { data: maxOrderData } = await context.supabase
        .from("orders")
        .select("invoice_number")
        .eq("brand_id", data.brandId)
        .order("invoice_number", { ascending: false })
        .limit(1);

      let baseInvoiceNum = 10001;
      if (maxOrderData && maxOrderData.length > 0) {
        baseInvoiceNum = Math.max(baseInvoiceNum, maxOrderData[0].invoice_number + 1);
      } else if (bizSettings?.next_invoice_number) {
        baseInvoiceNum = Math.max(baseInvoiceNum, bizSettings.next_invoice_number);
      }

      // Cache phone to ID lookups to speed up processing
      const customerCache = new Map<string, string>(); // phone/email -> customerId

      for (const order of data.orders) {
        try {
          let customerId: string | null = null;
          const cacheKey = order.customerPhone || order.customerEmail || "";

          if (cacheKey && customerCache.has(cacheKey)) {
            customerId = customerCache.get(cacheKey)!;
          } else {
            // Look up existing customer profile
            let existingCust: any = null;

            if (order.customerPhone) {
              const { data: custByPhone } = await context.supabase
                .from("customers")
                .select("id")
                .eq("brand_id", data.brandId)
                .eq("phone", order.customerPhone)
                .maybeSingle();
              existingCust = custByPhone;
            }

            if (!existingCust && order.customerEmail) {
              const { data: custByEmail } = await context.supabase
                .from("customers")
                .select("id")
                .eq("brand_id", data.brandId)
                .eq("email", order.customerEmail)
                .maybeSingle();
              existingCust = custByEmail;
            }

            if (existingCust) {
              customerId = existingCust.id;
              if (cacheKey) customerCache.set(cacheKey, customerId!);
            } else {
              // Create a new customer profile under this brand_id
              const { data: newCust, error: createErr } = await context.supabase
                .from("customers")
                .insert({
                  user_id: userId,
                  brand_id: data.brandId,
                  name:
                    order.customerName ||
                    `Customer ${order.customerPhone || order.customerEmail || "Imported"}`,
                  phone: order.customerPhone,
                  email: order.customerEmail,
                  notes: `Migrated via ${order.source} historical orders.`,
                })
                .select("id")
                .single();

              if (createErr) {
                console.error(
                  "Failed to create profile during historical order migration:",
                  createErr,
                );
                // Fallback to standalone order without customer_id if required
              } else {
                customerId = newCust.id;
                if (cacheKey) customerCache.set(cacheKey, customerId);
              }
            }
          }

          // Parse order number into numeric invoice_number
          let invoiceNum = parseInt(order.orderNumber.replace(/[^\d]/g, ""), 10);
          if (isNaN(invoiceNum)) {
            invoiceNum = baseInvoiceNum++;
          }

          // Prevent invoice number duplication by verifying uniqueness under this brand
          const { data: dupeInvoice } = await context.supabase
            .from("orders")
            .select("id")
            .eq("brand_id", data.brandId)
            .eq("invoice_number", invoiceNum)
            .maybeSingle();

          if (dupeInvoice) {
            invoiceNum = baseInvoiceNum++;
          }

          // Format historical notes beautifully with source tagging
          const compositeNotes = `[Historical (${order.source})]${order.notes ? ` ${order.notes}` : ""}`;

          // Insert historical order record
          const { data: insertedOrder, error: orderErr } = await context.supabase
            .from("orders")
            .insert({
              user_id: userId,
              brand_id: data.brandId,
              invoice_number: invoiceNum,
              customer_id: customerId,
              order_date: order.orderDate,
              created_at: order.orderDate, // Align creation timestamp to order date
              status: "archived_historical",
              payment_status: "paid",
              payment_method: "imported_migration",
              channel: "historical_import",
              total: order.totalPrice,
              subtotal: order.totalPrice,
              tax_amount: 0,
              tax_rate: 0,
              shipping: 0,
              discount: 0,
              currency,
              notes: compositeNotes,
              confirmation_email_status: "skipped", // bypass/suppress communication triggers
            })
            .select("id")
            .single();

          if (orderErr) {
            console.error(`Failed to insert historical order #${order.orderNumber}:`, orderErr);
            continue;
          }

          // Insert historical order line items
          if (order.items && order.items.length > 0) {
            const itemInserts = order.items.map((item) => ({
              user_id: userId,
              brand_id: data.brandId,
              order_id: insertedOrder.id,
              description: item.name,
              quantity: item.quantity,
              unit_price: item.price,
              line_total: item.price * item.quantity,
            }));

            const { error: itemsErr } = await context.supabase
              .from("order_items")
              .insert(itemInserts);

            if (itemsErr) {
              console.error(`Failed to insert items for order #${order.orderNumber}:`, itemsErr);
            }
          }

          successCount++;
        } catch (err) {
          console.error(`Error processing historical order #${order.orderNumber}:`, err);
        }
      }

      return { successCount, totalCount };
    } catch (err: any) {
      console.error("[Order Import Pipeline Exception]:", err);
      throw new Error(err.message || "Historical order database migration pipeline failed");
    }
  });
