import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/tap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json<{
            id?: string;
            status?: string;
            metadata?: { order_id?: string; brand_id?: string };
          }>();
          const { id: chargeId, status, metadata } = payload;

          if (!chargeId || !status || !metadata) {
            return new Response("Malformed webhook body.", { status: 400 });
          }

          const orderId = metadata.order_id;
          const brandId = metadata.brand_id;

          if (!orderId || !brandId) {
            return new Response("Missing order_id or brand_id in charge metadata.", {
              status: 400,
            });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Fetch Tap credentials for this brand to make authorized calls
          const { data: credentialRows, error: credError } = await (supabaseAdmin.rpc as any)(
            "get_integration_credential_secret",
            { p_brand_id: brandId, p_provider: "tap" },
          );
          const credential = credentialRows?.[0];

          if (credError || !credential || !credential.api_key) {
            console.error(
              "[Tap Webhook Auth Error]: Missing/inactive credential for brand",
              brandId,
              credError,
            );
            return new Response(
              "Tap Payments integration is not active or configured for this brand.",
              { status: 400 },
            );
          }

          // 2. BACK-CHANNEL SECURE CHECK: Query Tap Charges API directly to authorize and verify payload
          const tapRes = await fetch(`https://api.tap.company/v2/charges/${chargeId}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${credential.api_key}`,
              "Content-Type": "application/json",
            },
          });

          if (!tapRes.ok) {
            const errText = await tapRes.text();
            console.error("[Tap Webhook Verification Fail]: Status:", tapRes.status, errText);
            return new Response("Failed to authenticate charge reference with gateway API.", {
              status: 400,
            });
          }

          const tapCharge = await tapRes.json<{
            status?: string;
            metadata?: { order_id?: string; brand_id?: string };
          }>();
          const verifiedStatus = tapCharge.status?.toUpperCase();
          const verifiedOrderId = tapCharge.metadata?.order_id;
          const verifiedBrandId = tapCharge.metadata?.brand_id;

          if (verifiedOrderId !== orderId || verifiedBrandId !== brandId) {
            console.error(
              "[Tap Webhook Tampering Blocked]: Metadata mismatch. Payload:",
              { orderId, brandId },
              "Tap:",
              { verifiedOrderId, verifiedBrandId },
            );
            return new Response("Metadata verification failure.", { status: 400 });
          }

          // 3. REPLAY ATTACK & IDEMPOTENCY CHECK
          const { data: existingOrder, error: replayError } = await supabaseAdmin
            .from("orders")
            .select("id, payment_status")
            .eq("payment_gateway_reference" as any, chargeId)
            .maybeSingle();

          if (replayError) {
            console.error("[Tap Webhook Replay Check Error]:", replayError);
          }

          if (existingOrder) {
            if (existingOrder.id !== orderId) {
              console.error(
                "[Tap Webhook Replay Attack Blocked]: Charge reference",
                chargeId,
                "was already used for order",
                existingOrder.id,
              );
              return new Response("Duplicate payment reference.", { status: 400 });
            }
            if (existingOrder.payment_status === "paid") {
              console.log(
                "[Tap Webhook Idempotency]: Order",
                orderId,
                "already paid. Skipping duplicate update.",
              );
              return new Response("OK", { status: 200 });
            }
          }

          // 4. Update order status once authoritatively verified by Tap and passed replay checks
          if (verifiedStatus === "CAPTURED" || verifiedStatus === "SUCCESS") {
            const { error: updateError } = await supabaseAdmin
              .from("orders")
              .update({
                payment_status: "paid",
                status: "confirmed",
                payment_gateway_reference: chargeId,
              } as any)
              .eq("id", orderId)
              .eq("brand_id", brandId);

            if (updateError) {
              console.error("[Tap Webhook Update Error]:", updateError);
              return new Response(`Database update error: ${updateError.message}`, { status: 500 });
            }

            console.log(
              `[Tap Webhook Success]: Securely verified and confirmed payment for Order ${orderId}`,
            );
          } else {
            console.warn(
              `[Tap Webhook Non-success Status]: Charge status ${verifiedStatus} for Order ${orderId}`,
            );
          }

          return new Response("OK", { status: 200 });
        } catch (err: any) {
          console.error("[Tap Webhook Crash]:", err);
          return new Response(`Webhook Error: ${err.message}`, { status: 500 });
        }
      },
    },
  },
});
