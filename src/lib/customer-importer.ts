import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CustomerImportSchema = z.object({
  brandId: z.string().uuid(),
  customers: z.array(
    z.object({
      name: z.string(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      notes: z.string().nullable(),
      totalOrders: z.number().default(0),
      totalSpend: z.number().default(0),
      tags: z.array(z.string()).default([]),
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
            `[Impersonation Auth] Superadmin (${email}) authorized to perform customer import on brand: ${brandId}`,
          );
          return true; // Impersonation access granted
        }
      }
    }
  } catch (err) {
    console.error("Failed to resolve impersonation cookie credentials:", err);
  }

  throw new Error("FORBIDDEN: You do not have permission to import customers under this brand.");
}

export const importCustomerDatabase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => CustomerImportSchema.parse(raw))
  .handler(async ({ data, context }) => {
    try {
      const userId = context.userId;
      if (!userId) throw new Error("UNAUTHORIZED: Session user not found");

      // Verify permission checks
      await verifyBrandAccess(data.brandId, context);

      let successCount = 0;
      const totalCount = data.customers.length;

      // Fetch existing phone numbers to prevent duplicates
      const { data: existingCustomers, error: fetchErr } = await context.supabase
        .from("customers")
        .select("phone")
        .eq("brand_id", data.brandId);

      if (fetchErr) {
        console.error("Failed to query existing customer contacts:", fetchErr);
        throw new Error(`Database error while querying existing customers: ${fetchErr.message}`);
      }

      const existingPhones = new Set(
        (existingCustomers ?? []).map((c: any) => c.phone).filter(Boolean),
      );
      const processedPhones = new Set<string>();

      for (const cust of data.customers) {
        try {
          if (cust.phone) {
            if (existingPhones.has(cust.phone) || processedPhones.has(cust.phone)) {
              continue; // Deduplicate contacts by phone number
            }
            processedPhones.add(cust.phone);
          }

          // Apply automatic source and VIP tagging
          const compositeTags = [...cust.tags];
          if (cust.totalSpend >= 100) {
            compositeTags.push("VIP Customer");
          }

          const compositeNotes = [
            compositeTags.length > 0 ? `Tags: ${compositeTags.join(", ")}` : null,
            cust.totalSpend > 0 ? `Spend: ${cust.totalSpend} BHD` : null,
            cust.totalOrders > 0 ? `Orders: ${cust.totalOrders}` : null,
            cust.notes ? `Notes: ${cust.notes}` : null,
          ]
            .filter(Boolean)
            .join(" | ");

          const { error: insertErr } = await context.supabase.from("customers").insert({
            user_id: userId,
            brand_id: data.brandId,
            name: cust.name,
            phone: cust.phone,
            email: cust.email,
            notes: compositeNotes || null,
          });

          if (insertErr) {
            console.error("Failed to insert customer contact:", cust.name, insertErr);
            continue;
          }

          successCount++;
        } catch (err) {
          console.error("Customer import row level exception:", cust.name, err);
        }
      }

      return { successCount, totalCount };
    } catch (err: any) {
      console.error("[Customer Import Pipeline Exception]:", err);
      throw new Error(err.message || "Customer database migration pipeline failed");
    }
  });
