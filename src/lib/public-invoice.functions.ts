import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({ id: z.string().uuid() });

export const getPublicInvoice = createServerFn({ method: "GET" })
  .validator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await (supabaseAdmin.from("orders") as any)
      .select(
        `
        id, invoice_number, order_date, created_at, status, payment_method, payment_status,
        currency, notes, fulfillment_method, subtotal, discount, promo_code, tax_amount,
        tax_rate, shipping, total, advance_paid, shipping_address_id, delivery_address_snapshot, user_id, brand_id,
        customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot,
        branch_id, digital_delivery_channel, digital_delivery_contact,
        customers(name, phone, email, region),
        order_items(description, quantity, unit_price, original_price, line_total, customization_total,
          customizations, custom_field_values, products(name), product_variants(size, color, fabric))
      `,
      )
      .eq("public_invoice_token", data.id)
      .maybeSingle();
    if (error) {
      console.error("[getPublicInvoice] order query failed", error);
      throw new Error("Unable to load invoice");
    }
    if (!order) return null;

    const { data: settings } = await supabaseAdmin
      .from("business_settings")
      .select(
        "business_name, logo_url, address, phone, email, vat_number, currency, footer_note, primary_color, background_color, text_color, font_family, font_url, invoice_template, invoice_secondary_color, invoice_show_business_details, invoice_show_customer_contact, invoice_show_fulfillment, invoice_show_notes, invoice_title_en, invoice_title_ar",
      )
      .eq("brand_id", order.brand_id)
      .maybeSingle();

    let shippingAddress: any = order.delivery_address_snapshot ?? null;
    if (!shippingAddress && order.shipping_address_id) {
      const { data: addr } = await supabaseAdmin
        .from("customer_addresses")
        .select(
          "label, region, block, road, house, flat, floor, landmark, formatted_address, latitude, longitude, place_id, delivery_notes, is_default",
        )
        .eq("id", order.shipping_address_id)
        .maybeSingle();
      shippingAddress = addr ?? null;
    }

    let branch: any = null;
    if (order.branch_id) {
      const { data: selectedBranch } = await supabaseAdmin
        .from("branches")
        .select("name_ar, name_en, location_ar, location_en")
        .eq("id", order.branch_id)
        .eq("brand_id", order.brand_id)
        .maybeSingle();
      branch = selectedBranch ?? null;
    }

    // The query above is intentionally allowlisted. Never replace it with `*`:
    // new internal order fields must not become public automatically.
    return { order, settings, shippingAddress, branch };
  });
