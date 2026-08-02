import { supabase } from "@/integrations/supabase/client";
import type { CheckoutPayload, CheckoutResult } from "@/types/incubator-pos";

export async function processPosCheckout(payload: CheckoutPayload): Promise<CheckoutResult> {
  const { data, error } = await supabase.rpc("process_pos_checkout", {
    p_brand_id: payload.brand_id,
    p_shift_id: payload.shift_id,
    p_items: payload.items,
    p_payments: payload.payments,
    p_customer_id: payload.customer_id || null,
    p_notes: payload.notes || null,
  });

  if (error) {
    console.error("[POS Checkout Error]:", error);
    throw new Error(`POS Checkout failed: ${error.message}`);
  }

  return data as CheckoutResult;
}
