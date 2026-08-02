import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/payments/tap-redirect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const tapId = url.searchParams.get("tap_id");
        const orderId = url.searchParams.get("order_id");
        const brandId = url.searchParams.get("brand_id");

        if (!tapId || !orderId || !brandId) {
          return new Response("Missing tap_id, order_id, or brand_id parameters.", { status: 400 });
        }

        try {
          // Dynamically load supabaseAdmin
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Get brand slug
          const { data: brand, error: brandError } = await supabaseAdmin
            .from("brands")
            .select("slug")
            .eq("id", brandId)
            .maybeSingle();

          if (brandError || !brand) {
            throw new Error(`Brand not found: ${brandError?.message || ""}`);
          }

          const brandSlug = brand.slug;

          // 2. Fetch Tap credentials to verify the payment status
          const { data: credentialRows, error: credError } = await (supabaseAdmin.rpc as any)(
            "get_integration_credential_secret",
            { p_brand_id: brandId, p_provider: "tap" },
          );
          const credential = credentialRows?.[0];

          if (credError || !credential || !credential.api_key) {
            throw new Error("Tap Payments integration is not active or configured.");
          }

          // 3. Query Tap Charges API for the status
          const tapRes = await fetch(`https://api.tap.company/v2/charges/${tapId}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${credential.api_key}`,
              "Content-Type": "application/json",
            },
          });

          if (!tapRes.ok) {
            throw new Error(`Failed to fetch charge status from Tap: ${await tapRes.text()}`);
          }

          const chargeData = await tapRes.json<{ status?: string }>();
          const chargeStatus = chargeData.status?.toUpperCase();

          // 4. Handle success vs failure
          if (chargeStatus === "CAPTURED" || chargeStatus === "SUCCESS") {
            // Update order status to paid and confirmed
            const { error: updateError } = await supabaseAdmin
              .from("orders")
              .update({
                payment_status: "paid",
                status: "confirmed",
                payment_gateway_reference: tapId,
              } as any)
              .eq("id", orderId)
              .eq("brand_id", brandId);

            if (updateError) {
              console.error("[Tap Redirect Update Error]:", updateError);
            }

            // Redirect to thank-you page
            return new Response(null, {
              status: 302,
              headers: {
                Location: `/${brandSlug}/thank-you/${orderId}?payment=success`,
              },
            });
          } else {
            console.warn(`[Tap Payment Failed]: Order ${orderId}, Status: ${chargeStatus}`);

            // Clean up the failed/cancelled storefront order to prevent database clutter
            const { error: deleteError } = await supabaseAdmin
              .from("orders")
              .delete()
              .eq("id", orderId)
              .eq("brand_id", brandId);

            if (deleteError) {
              console.error(
                "[Tap Redirect Delete Error]: Failed to clean up failed order:",
                deleteError,
              );
            } else {
              console.log(`[Tap Redirect Cleanup]: Successfully deleted failed Order ${orderId}`);
            }

            // Redirect back to checkout with error parameter
            return new Response(null, {
              status: 302,
              headers: {
                Location: `/${brandSlug}/checkout?payment_error=failed&order_id=${orderId}`,
              },
            });
          }
        } catch (err: any) {
          console.error("[Tap Redirect Endpoint Crash]:", err);
          return new Response(`Payment Redirect Error: ${err.message}`, { status: 500 });
        }
      },
    },
  },
});
