import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const CreateUploadInput = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const CreateRequestInput = z.object({
  fullName: z.string().min(2),
  contactNumber: z.string().min(6),
  email: z.string().email(),
  desiredSubdomain: z.string().min(2),
  requestType: z.enum(["trial", "paid"]),
  benefitReceiptUrl: z.string().optional(),
  businessType: z.string().optional(),
});

const AdminActionInput = z.object({
  requestId: z.string().uuid(),
  planType: z.enum(["lifetime", "trial"]).optional(),
});

const UpdatePriceInput = z.object({
  newPrice: z.string().min(2),
});

// Helper to assert superadmin authorization
async function requireSuperAdmin(context: any) {
  const { data: isSuperAdmin } = await context.supabase.rpc("is_admin");
  const email = (context.claims?.email || "").toLowerCase();
  const isFixedSuperAdmin = email === "majeed@hotmail.it" || email === "majeed@hotmail.com";

  if (!isSuperAdmin && !isFixedSuperAdmin) {
    throw new Error("UNAUTHORIZED_SUPER_ADMIN_ONLY");
  }
}

// 1. Get secure pre-signed upload URL for onboarding receipt screenshot explicitly bound to R2_PRIVATE_BUCKET scope
export const getOnboardingReceiptUploadUrl = createServerFn({ method: "POST" })
  .validator((raw: unknown) => CreateUploadInput.parse(raw))
  .handler(async ({ data, context }) => {
    let env: any = null;
    try {
      const { getEvent } = await import(/* @vite-ignore */ "vinxi/http");
      const event = getEvent();
      env =
        event?.context?.cloudflare?.env ||
        event?.context?.env ||
        event?.context?.cloudflare ||
        (event?.context as any)?.cloudflare?.env;
    } catch {}

    if (!env) {
      try {
        const g = globalThis as any;
        env = g["__CLOUDFLARE_ENV__"] || g["__env__"] || g["process"]?.["env"] || process.env;
      } catch {}
    }

    const privateBucket = env?.R2_PRIVATE_BUCKET || env?.R2_PRIVATE_BUCKET_NAME;
    if (!privateBucket) {
      console.warn(
        "R2_PRIVATE_BUCKET environment variable is missing in current execution context.",
      );
    }

    const { createPrivateUploadUrl } = await import("@/lib/private-r2.server");
    const registrationId = crypto.randomUUID();
    const objectKey = `onboarding/receipts/${registrationId}.${imageTypes[data.contentType]}`;

    const uploadUrl = await createPrivateUploadUrl(objectKey, data.contentType);
    return { objectKey, uploadUrl };
  });

// 2. Save onboarding payload safely to Supabase database status queue 'tenant_requests' as 'pending'
export const createTenantRequest = createServerFn({ method: "POST" })
  .validator((raw: unknown) => CreateRequestInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tenant_requests").insert({
      full_name: data.fullName,
      email: data.email,
      contact_number: data.contactNumber,
      desired_subdomain: data.desiredSubdomain,
      request_type: data.requestType,
      status: "pending",
      benefit_receipt_url: data.benefitReceiptUrl || null,
      payment_verified: false,
      business_type: data.businessType || null,
    });

    if (error) {
      console.error("Supabase tenant request insert failure:", error);
      throw new Error(`Failed to record tenant request: ${error.message}`);
    }

    return { success: true };
  });

// 3. Dynamic pricing retrieval server function (reading from system_settings)
export const getOnboardingPrice = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("base_price_bhd, discount_price_bhd")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    try {
      const { data: rpcVal } = await supabaseAdmin.rpc("get_onboarding_active_price");
      if (rpcVal) return rpcVal;
    } catch {}
    return "55 BHD";
  }

  const active = data.discount_price_bhd !== null ? data.discount_price_bhd : data.base_price_bhd;
  return `${active} BHD`;
});

// 4. Update onboarding registration price in system_settings (Superadmin only)
export const updateRegistrationPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => UpdatePriceInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const parsedVal = parseFloat(data.newPrice.replace(/[^0-9.]/g, "")) || 55.0;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("system_settings").upsert(
      {
        id: 1,
        base_price_bhd: parsedVal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) throw error;
    return { success: true, updatedPrice: data.newPrice };
  });

// 4.1. Get full platform settings (Public)
export const getPlatformSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("Failed to query platform system_settings:", error);
    return null;
  }
  return data;
});

// 4.2. Update platform settings (Superadmin only)
const UpdatePlatformSettingsInput = z.object({
  basePriceBhd: z.number(),
  discountPriceBhd: z.number().nullable(),
  platformIconUrl: z.string().nullable(),
  benefitPayQrUrl: z.string().nullable(),
  merchantAccountName: z.string().min(1),
  whatsappSupportNumber: z.string().min(5),
  superadminImpersonationMutationAllowed: z.boolean(),
});

export const updatePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => UpdatePlatformSettingsInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("system_settings").upsert(
      {
        id: 1,
        base_price_bhd: data.basePriceBhd,
        discount_price_bhd: data.discountPriceBhd,
        platform_icon_url: data.platformIconUrl,
        benefit_pay_qr_url: data.benefitPayQrUrl,
        merchant_account_name: data.merchantAccountName,
        whatsapp_support_number: data.whatsappSupportNumber,
        superadmin_impersonation_mutation_allowed: data.superadminImpersonationMutationAllowed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) {
      console.error("Failed to update platform settings:", error);
      throw error;
    }
    return { success: true };
  });

// 4.3. Get platform logo upload pre-signed URL (Superadmin only)
export const getPlatformLogoUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ contentType: z.string() }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { createR2PresignedPutUrl, mimeToExtension } = await import("@/lib/r2-upload.functions");

    const extension = mimeToExtension[data.contentType.toLowerCase()] || "png";
    const key = `platform/logo-${crypto.randomUUID()}.${extension}`;

    const { uploadUrl } = await createR2PresignedPutUrl(key, data.contentType, 3600);
    return { uploadUrl, publicUrl: `/${key}`, key };
  });

// 4.4. Get platform QR upload pre-signed URL (Superadmin only)
export const getPlatformQrUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ contentType: z.string() }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { createR2PresignedPutUrl, mimeToExtension } = await import("@/lib/r2-upload.functions");

    const extension = mimeToExtension[data.contentType.toLowerCase()] || "png";
    const key = `platform/qr-${crypto.randomUUID()}.${extension}`;

    const { uploadUrl } = await createR2PresignedPutUrl(key, data.contentType, 3600);
    return { uploadUrl, publicUrl: `/${key}`, key };
  });

// 5. Approve Tenant Request & Mark Deployed (Superadmin only)
export const approveTenantRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => AdminActionInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    // Get current record first
    const { data: request, error: fetchError } = await context.supabase
      .from("tenant_requests")
      .select("*")
      .eq("id", data.requestId)
      .single();

    if (fetchError || !request) throw new Error("REQUEST_NOT_FOUND");

    // Update status to 'approved' and payment_verified to true
    const { error } = await context.supabase
      .from("tenant_requests")
      .update({
        status: "approved",
        payment_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);

    if (error) throw error;

    // Fetch the created brand by slug to set its plan details
    const brandSlug = request.desired_subdomain.toLowerCase().trim();
    const approvedPlanType =
      data.planType || (request.request_type === "trial" ? "trial" : "lifetime");
    const trialEndsAt =
      approvedPlanType === "trial"
        ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
        : null;

    // Since database triggers create the brand row, let's query it and update it
    const { data: brandRow } = await context.supabase
      .from("brands")
      .select("id")
      .eq("slug", brandSlug)
      .maybeSingle();

    if (brandRow) {
      const { error: brandUpdateErr } = await context.supabase
        .from("brands")
        .update({
          plan_type: approvedPlanType,
          trial_ends_at: trialEndsAt,
          business_type: (request as any).business_type || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", brandRow.id);

      if (brandUpdateErr) {
        console.error("Failed to update brand plan details upon request approval:", brandUpdateErr);
      }
    }

    return { success: true };
  });

// 6. Reject/Dismiss Tenant Request (Superadmin only)
export const rejectTenantRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => AdminActionInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { error } = await context.supabase
      .from("tenant_requests")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);

    if (error) throw error;
    return { success: true };
  });

const LogImpersonationInput = z.object({
  targetTenantId: z.string().uuid(),
  reason: z.string().optional(),
});

// 7. Log Impersonation Start (Superadmin only)
export const logImpersonationStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => LogImpersonationInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { error } = await context.supabase.from("system_audit_logs").insert({
      operator_id: context.userId,
      target_tenant_id: data.targetTenantId,
      action_type: "impersonation_start",
      reason: data.reason || "Superadmin troubleshooting session initialized.",
    });

    if (error) {
      console.error("Audit logging failed:", error);
      throw error;
    }
    return { success: true };
  });
