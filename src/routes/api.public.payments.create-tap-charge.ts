import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/payments/create-tap-charge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json<{
            orderId?: string;
            brandId?: string;
            redirectUrl?: string;
          }>();
          const { orderId, brandId, redirectUrl } = body;

          if (!orderId || !brandId) {
            return new Response(JSON.stringify({ error: "Missing orderId or brandId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Dynamically load supabaseAdmin server-only module
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Fetch Tap credentials
          const { data: credentialRows, error: credError } = await (supabaseAdmin.rpc as any)(
            "get_integration_credential_secret",
            { p_brand_id: brandId, p_provider: "tap" },
          );
          const credential = credentialRows?.[0];

          if (credError || !credential || !credential.api_key) {
            return new Response(
              JSON.stringify({
                error: "Tap Payments integration is not configured or active for this brand.",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // 2. Fetch Order and customer details
          const { data: orderResult, error: orderError } = await supabaseAdmin
            .from("orders")
            .select(
              `
              id,
              total,
              subtotal,
              shipping,
              discount,
              customer_id,
              customers (
                name,
                phone,
                email
              )
            ` as any,
            )
            .eq("id", orderId)
            .eq("brand_id", brandId)
            .maybeSingle();

          const order = orderResult as any;
          if (orderError || !order) {
            console.error("[Tap Charge order fetch error]:", orderError);
            return new Response(JSON.stringify({ error: "Order not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const customerDetails = order.customers || {};
          const fullName = customerDetails.name || "Customer";
          const nameParts = fullName.trim().split(/\s+/);
          const firstName = nameParts[0] || "Customer";
          const lastName = nameParts.slice(1).join(" ") || "Customer";

          const rawPhone = customerDetails.phone || "";
          const cleanPhone = rawPhone.replace(/\D/g, "");
          let countryCode = "973";
          let number = cleanPhone;

          if (cleanPhone.startsWith("973")) {
            number = cleanPhone.slice(3);
          } else if (cleanPhone.startsWith("00973")) {
            number = cleanPhone.slice(5);
          } else if (cleanPhone.startsWith("+973")) {
            number = cleanPhone.slice(4);
          } else if (cleanPhone.length > 8 && cleanPhone.startsWith("966")) {
            countryCode = "966";
            number = cleanPhone.slice(3);
          } else if (cleanPhone.length > 8 && cleanPhone.startsWith("965")) {
            countryCode = "965";
            number = cleanPhone.slice(3);
          } else if (cleanPhone.length > 8 && cleanPhone.startsWith("971")) {
            countryCode = "971";
            number = cleanPhone.slice(3);
          }

          const requestUrl = new URL(request.url);
          const finalRedirectUrl =
            redirectUrl ||
            `${requestUrl.origin}/api/public/payments/tap-redirect?order_id=${orderId}&brand_id=${brandId}`;

          const tapPayload = {
            amount: Number(order.total),
            currency: "BHD",
            threeDSecure: true,
            save_card: false,
            description: `Order #${orderId.slice(0, 8)} Payment`,
            statement_descriptor: "BOUTQ",
            metadata: {
              order_id: orderId,
              brand_id: brandId,
            },
            customer: {
              first_name: firstName,
              last_name: lastName,
              email: customerDetails.email || `${orderId.slice(0, 8)}@customer.boutq.com`,
              phone: {
                country_code: countryCode,
                number: number || "33333333",
              },
            },
            source: {
              id: "src_all",
            },
            redirect: {
              url: finalRedirectUrl,
            },
          };

          const tapRes = await fetch("https://api.tap.company/v2/charges", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${credential.api_key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(tapPayload),
          });

          if (!tapRes.ok) {
            const errText = await tapRes.text();
            console.error("[Tap Charge Error Payload]:", errText);
            return new Response(
              JSON.stringify({
                error: `Tap API error: ${errText}`,
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const chargeData = await tapRes.json<{
            id?: string;
            transaction?: { url?: string };
          }>();
          const checkoutUrl = chargeData.transaction?.url;
          const chargeId = chargeData.id;

          if (!checkoutUrl) {
            return new Response(JSON.stringify({ error: "No checkout URL returned from Tap." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Update order with payment gateway reference
          await supabaseAdmin
            .from("orders")
            .update({
              payment_gateway_reference: chargeId,
            } as any)
            .eq("id", orderId);

          return new Response(JSON.stringify({ redirectUrl: checkoutUrl }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          console.error("[create-tap-charge crash]:", err);
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
