import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const CreateInput = z.object({
  brandId: z.string().uuid(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});
const FinalizeInput = z.object({
  receiptId: z.string().uuid(),
  objectKey: z.string().min(30).max(500),
});
const OrderInput = z.object({ orderId: z.string().uuid() });
const RejectInput = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const createBenefitReceiptUpload = createServerFn({ method: "POST" })
  .validator((raw: unknown) => CreateInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await (supabaseAdmin.from("business_settings") as any)
      .select("brand_id, benefit_enabled, brands!inner(is_active)")
      .eq("brand_id", data.brandId)
      .eq("benefit_enabled", true)
      .eq("brands.is_active", true)
      .maybeSingle();
    if (!settings) throw new Error("BENEFIT_NOT_AVAILABLE");

    const { createPrivateUploadUrl } = await import("@/lib/private-r2.server");
    const receiptId = crypto.randomUUID();
    const objectKey = `brands/${data.brandId}/benefit-receipts/${receiptId}.${imageTypes[data.contentType]}`;
    const { error } = await (supabaseAdmin.from("pending_benefit_receipts") as any).insert({
      id: receiptId,
      brand_id: data.brandId,
      object_key: objectKey,
      public_url: null,
      content_type: data.contentType,
      file_size: data.size,
    });
    if (error) throw error;
    const uploadUrl = await createPrivateUploadUrl(objectKey, data.contentType);
    return { receiptId, objectKey, uploadUrl };
  });

export const finalizeBenefitReceiptUpload = createServerFn({ method: "POST" })
  .validator((raw: unknown) => FinalizeInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pending } = await (supabaseAdmin.from("pending_benefit_receipts") as any)
      .select("id, object_key, content_type, file_size, consumed_at, expires_at")
      .eq("id", data.receiptId)
      .eq("object_key", data.objectKey)
      .maybeSingle();
    if (!pending || pending.consumed_at || new Date(pending.expires_at).getTime() <= Date.now())
      throw new Error("RECEIPT_UPLOAD_EXPIRED");
    const { inspectPrivateObject, isPrivateReceiptKey } = await import("@/lib/private-r2.server");
    if (!isPrivateReceiptKey(data.objectKey)) throw new Error("RECEIPT_UPLOAD_INVALID");
    const head = await inspectPrivateObject(data.objectKey);
    if (
      !head.ContentLength ||
      head.ContentLength !== pending.file_size ||
      head.ContentType !== pending.content_type
    )
      throw new Error("RECEIPT_UPLOAD_INVALID");
    const { error } = await (supabaseAdmin.from("pending_benefit_receipts") as any)
      .update({ uploaded_at: new Date().toISOString() })
      .eq("id", data.receiptId)
      .is("consumed_at", null);
    if (error) throw error;
    return { receiptId: data.receiptId };
  });

export const getBenefitReceiptViewUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => OrderInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id, brand_id, payment_method, benefit_receipt_key, benefit_receipt_delete_after")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) throw new Error("RECEIPT_NOT_FOUND");

    const [{ data: canAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: order.brand_id }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!canAccess || !isAdmin) throw new Error("FORBIDDEN");
    if (order.payment_method !== "benefit" || !order.benefit_receipt_key) {
      throw new Error("RECEIPT_NOT_FOUND");
    }

    const { createPrivateViewUrl, deletePrivateObject, isPrivateReceiptKey } =
      await import("@/lib/private-r2.server");
    if (!isPrivateReceiptKey(order.benefit_receipt_key, order.brand_id)) {
      throw new Error("INVALID_RECEIPT_KEY");
    }

    if (
      order.benefit_receipt_delete_after &&
      new Date(order.benefit_receipt_delete_after).getTime() <= Date.now()
    ) {
      await deletePrivateObject(order.benefit_receipt_key);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin.from("orders") as any)
        .update({
          benefit_receipt_key: null,
          benefit_receipt_url: null,
          benefit_receipt_deleted_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("brand_id", order.brand_id);
      throw new Error("RECEIPT_RETENTION_EXPIRED");
    }

    return {
      url: await createPrivateViewUrl(order.benefit_receipt_key),
      expiresInSeconds: 300,
    };
  });

export const rejectBenefitReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => RejectInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "reject_benefit_payment" as never,
      { p_order_id: data.orderId, p_reason: data.reason } as never,
    );
    if (error) throw error;
    const objectKey = (result as { object_key?: string } | null)?.object_key;
    if (objectKey) {
      const { deletePrivateObject, isPrivateReceiptKey } = await import("@/lib/private-r2.server");
      if (!isPrivateReceiptKey(objectKey)) throw new Error("INVALID_RECEIPT_KEY");
      await deletePrivateObject(objectKey);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin.from("orders") as any)
        .update({
          benefit_receipt_key: null,
          benefit_receipt_url: null,
          benefit_receipt_deleted_at: new Date().toISOString(),
        })
        .eq("id", data.orderId);
    }
    return { rejected: true };
  });

export const deleteOrderWithPrivateReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => OrderInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id, brand_id, benefit_receipt_key")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) throw new Error("ORDER_NOT_FOUND");
    const [{ data: canAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: order.brand_id }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!canAccess || !isAdmin) throw new Error("FORBIDDEN");

    // Secure Impersonation Safeguard Block: restrict mutation
    const { enforceMutationSafeguard } = await import("@/lib/impersonation.server");
    await enforceMutationSafeguard(context.supabase, context.userId, order.brand_id);

    if (order.benefit_receipt_key) {
      const { deletePrivateObject, isPrivateReceiptKey } = await import("@/lib/private-r2.server");
      if (!isPrivateReceiptKey(order.benefit_receipt_key, order.brand_id)) {
        throw new Error("INVALID_RECEIPT_KEY");
      }
      await deletePrivateObject(order.benefit_receipt_key);
    }
    const { error: deleteError } = await context.supabase
      .from("orders")
      .delete()
      .eq("id", data.orderId)
      .eq("brand_id", order.brand_id);
    if (deleteError) throw deleteError;
    return { deleted: true };
  });

const BrandInput = z.object({ brandId: z.string().uuid() });

export const purgeBrandPrivateReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => BrandInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isSuperAdmin, error } = await context.supabase.rpc("is_super_admin");
    if (error || !isSuperAdmin) throw new Error("FORBIDDEN");
    const { purgePrivatePrefix } = await import("@/lib/private-r2.server");
    return {
      deleted: await purgePrivatePrefix(`brands/${data.brandId}/benefit-receipts/`),
    };
  });
