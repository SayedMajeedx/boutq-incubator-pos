import { createServerFn } from "@tanstack/react-start";
import {
  requireSupabaseAuth,
  getEnvVariableAsync,
  getEnvDiagnostics,
  getGeminiCredentials,
} from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  text: z.string().min(1).max(4000),
  from: z.enum(["ar", "en"]),
  to: z.enum(["ar", "en"]),
});

// Trigger build to reload environment variables on Cloudflare Pages
const MODEL = "gemini-3.1-flash-lite";

/**
 * One-shot premium merchant text translation and copywriting localization via Google Gemini.
 * Auth-gated so anonymous visitors can't burn translation quota.
 */
export const translateProductText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: quotaError } = await (context.supabase.rpc as any)(
      "consume_api_quota",
      {
        p_action: "translation",
        p_limit: 100,
        p_window_minutes: 60,
      },
    );
    if (quotaError || !allowed) throw new Error("RATE_LIMITED");
    if (data.from === data.to) return { text: data.text };

    const creds = await getGeminiCredentials(context.supabase, context.userId);
    const apiKey = creds.apiKey;
    const modelInput = creds.model || MODEL;

    if (!apiKey) {
      const diag = await getEnvDiagnostics();
      throw new Error(
        `Missing GEMINI_API_KEY. Trace: [${creds.diagnostics || "no-trace"}]. Available env keys: [${diag.keys.join(", ")}]. (Cloudflare: ${diag.hasCloudflare}, Node: ${diag.hasProcess})`,
      );
    }

    // Resolve model name elegantly and robustly
    let finalModel = modelInput.trim();

    // If they saved a full URL in the model/base_url field, extract the model identifier or use the URL
    if (finalModel.startsWith("http://") || finalModel.startsWith("https://")) {
      try {
        const urlObj = new URL(finalModel);
        // e.g. if URL is https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash
        const pathParts = urlObj.pathname.split("/");
        const modelsIndex = pathParts.indexOf("models");
        if (modelsIndex !== -1 && pathParts[modelsIndex + 1]) {
          finalModel = pathParts[modelsIndex + 1].split(":")[0]; // Extract gemini-1.5-flash
        } else {
          // Fallback if we can't parse it
          finalModel = MODEL;
        }
      } catch {
        finalModel = MODEL;
      }
    }

    // Strip any trailing colons, spaces, or query parameters
    finalModel = finalModel.replace(/:generateContent$/, "").trim();

    // If finalModel is still empty or doesn't look like a standard model name (e.g. it is a URL or empty), use fallback
    if (!finalModel || finalModel.includes("/") || finalModel.includes("http")) {
      finalModel = MODEL;
    }

    const prompt = [
      "You are a premium, luxury bilingual copywriter and translator specializing in high-end fashion, beauty, and retail boutique brands.",
      `Your task is to translate the following product text from ${data.from === "ar" ? "Arabic" : "English"} to ${data.to === "ar" ? "Arabic" : "English"}.`,
      "Guidelines:",
      "- Provide a beautifully localized, elegant, and natural translation that fits a premium luxury brand.",
      "- Avoid literal, mechanical, or robotic machine-translation phrasing.",
      "- Keep formatting, bullet points, line breaks, measurements (e.g. 50ml, cm, L), and brand names intact.",
      "- If translating to Arabic, use modern standard Arabic of high literary/retail quality suitable for boutique commerce (avoid casual slang, and avoid overly rigid Google-Translate-style literalisms).",
      "- Return ONLY the final translated text. Do not add any introduction, explanations, notes, quote marks, or extra comments.",
      "\nText to translate:",
      data.text,
    ].join("\n");

    let activeApiVersion = "v1beta";
    let response = await fetch(
      `https://generativelanguage.googleapis.com/${activeApiVersion}/models/${finalModel}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        }),
      },
    );

    // If v1beta returns 404, gracefully fall back to v1
    if (response.status === 404) {
      const fallbackApiVersion = "v1";
      const fallbackResponse = await fetch(
        `https://generativelanguage.googleapis.com/${fallbackApiVersion}/models/${finalModel}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
            },
          }),
        },
      );

      if (fallbackResponse.ok || fallbackResponse.status !== 404) {
        activeApiVersion = fallbackApiVersion;
        response = fallbackResponse;
      }
    }

    if (response.status === 429) throw new Error("RATE_LIMITED");
    if (response.status === 401 || response.status === 403) throw new Error("GEMINI_AUTH_FAILED");
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error(
        `[translateProductText] Gemini error ${response.status}: ${details.slice(0, 300)}`,
      );
      if (response.status === 404) {
        throw new Error(
          `GEMINI_MODEL_UNAVAILABLE (Tried model: "${finalModel}" on API: "${activeApiVersion}". Response: ${details.slice(0, 150)})`,
        );
      }
      throw new Error(
        `GEMINI_PROVIDER_ERROR (Status: ${response.status}. API: "${activeApiVersion}". Response: ${details.slice(0, 150)})`,
      );
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const out =
      payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() ?? "";
    if (!out) throw new Error("GEMINI_EMPTY_RESPONSE");

    return { text: out };
  });
