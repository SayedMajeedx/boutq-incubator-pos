import { createServerFn } from "@tanstack/react-start";
import {
  requireSupabaseAuth,
  getEnvVariableAsync,
  getGeminiCredentials,
} from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  prompt: z.string().trim().min(3).max(2000),
  language: z.enum(["ar", "en"]),
});

const ParsedVariantPlan = z.object({
  base_sku: z.string().max(60).default(""),
  sizes: z.array(z.string().max(50)).max(30).default([]),
  colors: z.array(z.string().max(80)).max(30).default([]),
  fabric: z.string().max(100).default(""),
  size_unit: z.enum(["", "cm", "mm", "m", "inch", "ft", "kg", "g", "ml", "l"]).default(""),
  cost_price: z.number().min(0).max(1_000_000).default(0),
  selling_price: z.number().min(0).max(1_000_000).default(0),
  stock_main: z.number().int().min(0).max(1_000_000).default(0),
  stock_incubator: z.number().int().min(0).max(1_000_000).default(0),
});

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    base_sku: { type: "string" },
    sizes: { type: "array", items: { type: "string" }, maxItems: 30 },
    colors: { type: "array", items: { type: "string" }, maxItems: 30 },
    fabric: { type: "string" },
    size_unit: { type: "string", enum: ["", "cm", "mm", "m", "inch", "ft", "kg", "g", "ml", "l"] },
    cost_price: { type: "number", minimum: 0 },
    selling_price: { type: "number", minimum: 0 },
    stock_main: { type: "integer", minimum: 0 },
    stock_incubator: { type: "integer", minimum: 0 },
  },
  required: [
    "base_sku",
    "sizes",
    "colors",
    "fabric",
    "size_unit",
    "cost_price",
    "selling_price",
    "stock_main",
    "stock_incubator",
  ],
} as const;

const MODEL = "gemini-3.5-flash";

export type VariantGenerationPlan = z.infer<typeof ParsedVariantPlan>;

export const parseVariantPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }): Promise<VariantGenerationPlan> => {
    const { data: allowed, error: quotaError } = await (context.supabase.rpc as any)(
      "consume_api_quota",
      {
        p_action: "variant_generation",
        p_limit: 30,
        p_window_minutes: 60,
      },
    );
    if (quotaError) {
      console.error(`[parseVariantPrompt] quota configuration error: ${quotaError.message}`);
      throw new Error("QUOTA_CONFIGURATION_ERROR");
    }
    if (!allowed) throw new Error("RATE_LIMITED");

    const creds = await getGeminiCredentials(context.supabase, context.userId);
    const apiKey = creds.apiKey;
    const model = creds.model || MODEL;

    if (!apiKey)
      throw new Error(
        "Missing GEMINI_API_KEY. To fix this instantly, please go to Settings -> Integrations, add a new 'Gemini AI Translation' integration, and paste your Gemini API Key there!",
      );

    const instruction = [
      "You parse a merchant's English or Arabic request for product variants.",
      "Extract only explicitly stated values. Never invent sizes, colors, prices, stock, fabric, or codes.",
      "Ranges such as sizes 1 to 5 must be expanded inclusively.",
      "Keep Arabic values in Arabic and English values in English.",
      "base_sku is the product code or SKU prefix, not the product name.",
      "Use zero and empty arrays/strings for omitted optional values.",
      "Do not generate combinations, SKUs, or barcodes. Return only the structured plan.",
    ].join(" ");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instruction }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: `Interface language: ${data.language}. Merchant request:\n${data.prompt}` },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseJsonSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );

    if (response.status === 429) throw new Error("RATE_LIMITED");
    if (response.status === 401 || response.status === 403) throw new Error("GEMINI_AUTH_FAILED");
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error(
        `[parseVariantPrompt] Gemini error ${response.status}: ${details.slice(0, 300)}`,
      );
      if (response.status === 404) throw new Error("GEMINI_MODEL_UNAVAILABLE");
      throw new Error("GEMINI_PROVIDER_ERROR");
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!raw) throw new Error("GEMINI_EMPTY_RESPONSE");
    try {
      const plan = ParsedVariantPlan.parse(JSON.parse(raw));
      return {
        ...plan,
        base_sku: plan.base_sku.trim(),
        sizes: [...new Set(plan.sizes.map((value) => value.trim()).filter(Boolean))],
        colors: [...new Set(plan.colors.map((value) => value.trim()).filter(Boolean))],
        fabric: plan.fabric.trim(),
      };
    } catch {
      throw new Error("GEMINI_INVALID_JSON");
    }
  });
