import { createServerFn } from "@tanstack/react-start";
import {
  requireSupabaseAuth,
  getEnvVariableAsync,
  getGeminiCredentials,
} from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  dataUrl: z.string().min(32).max(8_500_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  targetLang: z.enum(["ar", "en"]).default("ar"),
});

const GeminiReceipt = z.object({
  store_name: z.string(),
  date: z.string(),
  line_items: z.array(
    z.object({
      product_name: z.string(),
      quantity: z.number(),
      unit_price: z.number(),
    }),
  ),
  subtotal: z.number(),
  tax_amount: z.number(),
  grand_total: z.number(),
});

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    store_name: { type: "string", description: "Merchant or store name exactly as shown." },
    date: {
      type: "string",
      description: "Receipt date formatted as YYYY-MM-DD, or an empty string if unreadable.",
    },
    line_items: {
      type: "array",
      description: "Every readable purchased product or service line.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          product_name: { type: "string" },
          quantity: { type: "number", minimum: 0 },
          unit_price: { type: "number", minimum: 0 },
        },
        required: ["product_name", "quantity", "unit_price"],
      },
    },
    subtotal: { type: "number", minimum: 0 },
    tax_amount: { type: "number", minimum: 0 },
    grand_total: { type: "number", minimum: 0 },
  },
  required: ["store_name", "date", "line_items", "subtotal", "tax_amount", "grand_total"],
} as const;

const GEMINI_MODEL = "gemini-3.5-flash";

export type ScannedLineItem = {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type ScannedExpense = {
  store_name: string;
  category: string;
  supplier: string;
  description: string;
  expense_date: string;
  receipt_time: string;
  currency: string;
  subtotal: number;
  tax_amount: number;
  tax_rate: number;
  amount: number;
  items: ScannedLineItem[];
  notes: string;
};

function extractBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("INVALID_RECEIPT_DATA");
  const metadata = dataUrl.slice(0, comma);
  if (!/^data:image\/(jpeg|png|webp);base64$/i.test(metadata))
    throw new Error("INVALID_RECEIPT_TYPE");
  if (!metadata.includes(";base64")) throw new Error("INVALID_RECEIPT_DATA");
  const base64 = dataUrl.slice(comma + 1).replace(/\s/g, "");
  if (!base64) throw new Error("INVALID_RECEIPT_DATA");
  if (Math.floor(base64.length * 0.75) > 6_000_000) throw new Error("RECEIPT_TOO_LARGE");
  return base64;
}

export const scanReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }): Promise<ScannedExpense> => {
    const { data: allowed, error: quotaError } = await (context.supabase.rpc as any)(
      "consume_api_quota",
      {
        p_action: "receipt_scan",
        p_limit: 20,
        p_window_minutes: 60,
      },
    );
    if (quotaError || !allowed) throw new Error("RATE_LIMITED");

    const creds = await getGeminiCredentials(context.supabase, context.userId);
    const apiKey = creds.apiKey;
    const model = creds.model || GEMINI_MODEL;

    if (!apiKey)
      throw new Error(
        "Missing GEMINI_API_KEY. To fix this instantly, please go to Settings -> Integrations, add a new 'Gemini AI Translation' integration, and paste your Gemini API Key there!",
      );

    const outputLanguage = data.targetLang === "ar" ? "Arabic" : "English";
    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = [
      "You are a precise OCR engine for retail receipts and commercial invoices.",
      "Read both Arabic and English text, including mixed-language documents.",
      `Return product_name values in ${outputLanguage}, preserving brand names when translation would be misleading.`,
      "Extract only information visible in the supplied document; never invent products or monetary values.",
      "Use plain numeric values without currency symbols or thousands separators.",
      "If quantity is omitted for a visible line item, use 1.",
      "If the date is visible, normalize it to YYYY-MM-DD; otherwise return an empty string.",
      "Return one minified JSON object matching the supplied schema and nothing else.",
    ].join(" ");

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Perform OCR on this receipt or invoice and extract its structured purchase data.",
              },
              {
                inlineData: {
                  mimeType: data.mimeType,
                  data: extractBase64(data.dataUrl),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_JSON_SCHEMA,
        },
      }),
    });

    if (response.status === 429) throw new Error("RATE_LIMITED");
    if (response.status === 401 || response.status === 403) throw new Error("GEMINI_AUTH_FAILED");
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      let providerMessage = details;
      try {
        const providerError = JSON.parse(details) as {
          error?: { message?: string; status?: string };
        };
        providerMessage = providerError.error?.message || providerError.error?.status || details;
      } catch {
        /* keep the plain response body */
      }
      if (
        response.status === 404 ||
        /model.*(?:not found|no longer available)/i.test(providerMessage)
      ) {
        throw new Error("GEMINI_MODEL_UNAVAILABLE");
      }
      console.error(
        `[scanReceipt] Gemini API error ${response.status}: ${providerMessage.slice(0, 300)}`,
      );
      throw new Error("GEMINI_PROVIDER_ERROR");
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };
    const raw = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!raw) {
      const reason =
        payload.promptFeedback?.blockReason ||
        payload.candidates?.[0]?.finishReason ||
        "EMPTY_RESPONSE";
      throw new Error(`GEMINI_SCAN_FAILED: ${reason}`);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      throw new Error("GEMINI_INVALID_JSON");
    }
    const receipt = GeminiReceipt.parse(parsedJson);

    const items: ScannedLineItem[] = receipt.line_items
      .map((item) => {
        const quantity = Math.max(1, item.quantity || 1);
        const unitPrice = Math.max(0, item.unit_price);
        return {
          name: item.product_name.trim(),
          quantity,
          unit_price: unitPrice,
          line_total: quantity * unitPrice,
        };
      })
      .filter((item) => item.name.length > 0);

    const subtotal = Math.max(0, receipt.subtotal);
    const taxAmount = Math.max(0, receipt.tax_amount);
    const grandTotal = Math.max(0, receipt.grand_total);
    const taxRate = subtotal > 0 ? (taxAmount / subtotal) * 100 : 0;
    const storeName = receipt.store_name.trim();

    // Adapt Gemini's intentionally small schema to the existing expense editor.
    return {
      store_name: storeName,
      category: data.targetLang === "ar" ? "أخرى" : "Other",
      supplier: storeName,
      description: items.map((item) => item.name).join(", "),
      expense_date: /^\d{4}-\d{2}-\d{2}$/.test(receipt.date) ? receipt.date : today,
      receipt_time: "",
      currency: "BHD",
      subtotal,
      tax_amount: taxAmount,
      tax_rate: Number(taxRate.toFixed(2)),
      amount: grandTotal,
      items,
      notes: "",
    };
  });
