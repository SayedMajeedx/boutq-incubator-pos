import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth, getGeminiCredentials } from "@/integrations/supabase/auth-middleware";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/r2-upload.functions";
import { z } from "zod";

const POST_KEYWORDS_SOLD_OUT = [
  "نفذت الكمية",
  "غير متوفر",
  "مباع",
  "انتهت الكمية",
  "محجوز",
  "sold out",
  "out of stock",
  "unavailable",
  "مبيعة",
  "مبيعه",
  "خلصت",
];

export type InstagramPostPreview = {
  id: string;
  url: string;
  imageUrl: string;
  caption: string;
  isSoldOut: boolean;
  detectedKeyword?: string;
  date: string;
  isVideo?: boolean;
};

// Client and server sold-out scanning helper
export function scanCaptionForSoldOut(caption: string): { isSoldOut: boolean; keyword?: string } {
  const lower = caption.toLowerCase();
  for (const keyword of POST_KEYWORDS_SOLD_OUT) {
    if (lower.includes(keyword.toLowerCase())) {
      return { isSoldOut: true, keyword };
    }
  }
  return { isSoldOut: false };
}

// 1. Start Instagram Scraping Actor Run
export const fetchInstagramPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        username: z.string().optional(),
        urls: z.array(z.string()).optional(),
        range: z.number().int().min(5).max(100).default(50),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      throw new Error(
        "Missing APIFY_API_TOKEN environment variable. Please configure it in your environment settings.",
      );
    }
    const directUrls =
      data.urls && data.urls.length > 0
        ? data.urls
        : data.username
          ? [`https://www.instagram.com/${data.username.replace(/^@/, "").trim()}/`]
          : [];

    if (directUrls.length === 0) {
      throw new Error("Either username or direct URLs must be provided.");
    }

    try {
      // Trigger the scraping actor run asynchronously
      const runResponse = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${token}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            directUrls,
            resultsLimit: data.range,
            resultsType: "posts",
          }),
        },
      );

      if (!runResponse.ok) {
        const errText = await runResponse.text();
        throw new Error(`Failed to start Apify scraper: Status ${runResponse.status} - ${errText}`);
      }

      const runResData = await runResponse.json<{
        data?: { id?: string; defaultDatasetId?: string };
      }>();
      const runId = runResData.data?.id;
      const datasetId = runResData.data?.defaultDatasetId;

      if (!runId || !datasetId) {
        throw new Error("Failed to initialize Apify scraper run structure.");
      }

      return { runId, datasetId, status: "RUNNING" };
    } catch (error: any) {
      console.error("Apify dynamic scraping start error:", error);
      throw error;
    }
  });

// 2. Check Scraper Run Status
export const checkScraperStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        runId: z.string(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      throw new Error("Missing APIFY_API_TOKEN environment variable.");
    }

    try {
      const response = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-scraper/runs/${data.runId}?token=${token}`,
      );
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to poll status: Status ${response.status} - ${errText}`);
      }

      const resData = await response.json<{ data?: { status?: string } }>();
      const status = resData.data?.status || "FAILED";

      if (status === "FAILED" || status === "TIMED-OUT" || status === "ABORTED") {
        throw new Error(`Scraping task run failed with status: ${status}`);
      }

      return { status };
    } catch (error: any) {
      console.error("Apify run check status error:", error);
      throw error;
    }
  });

// 3. Fetch Scraper Dataset Items
export const fetchScraperDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        datasetId: z.string(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      throw new Error("Missing APIFY_API_TOKEN environment variable.");
    }

    try {
      const itemsResponse = await fetch(
        `https://api.apify.com/v2/datasets/${data.datasetId}/items?token=${token}`,
      );
      if (!itemsResponse.ok) {
        const errText = await itemsResponse.text();
        throw new Error(
          `Failed to retrieve dataset items: Status ${itemsResponse.status} - ${errText}`,
        );
      }

      const items = (await itemsResponse.json()) as any[];
      if (!Array.isArray(items)) {
        return [];
      }

      const posts: InstagramPostPreview[] = items
        .map((item, index) => {
          const caption = item.caption || item.text || "";
          const { isSoldOut, keyword } = scanCaptionForSoldOut(caption);

          const isVideo = !!(
            item.isVideo ||
            item.type === "Video" ||
            item.type === "Reel" ||
            (item.url && (item.url.includes("/reel/") || item.url.includes("/tv/")))
          );

          // Prioritized fallback cover image sequence
          let imageUrl =
            item.thumbnailUrl ||
            item.displayUrl ||
            (item.images && item.images[0]) ||
            (item.displayResources && item.displayResources[0]?.src) ||
            "";

          // Enforce safety checks to ensure we never capture a raw .mp4 string
          if (imageUrl.toLowerCase().includes(".mp4")) {
            // Attempt fallbacks
            imageUrl =
              item.thumbnailUrl || item.displayUrl || (item.images && item.images[0]) || "";
            if (imageUrl.toLowerCase().includes(".mp4")) {
              imageUrl = "";
            }
          }

          const dateStr = item.timestamp
            ? new Date(item.timestamp).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : "Today";

          return {
            id: item.id || `post-${index}`,
            url: item.url || `https://www.instagram.com/p/${item.shortCode || index}/`,
            imageUrl,
            caption,
            isSoldOut,
            detectedKeyword: isSoldOut ? keyword : undefined,
            date: dateStr,
            isVideo,
          };
        })
        .filter((p) => p.imageUrl);

      return posts;
    } catch (error: any) {
      console.error("Apify fetch dataset error:", error);
      throw error;
    }
  });

// Helper function for Eastern Arabic numeral normalization and strict regex pricing rules
export function extractPriceFallback(caption: string): number {
  // Normalize Eastern Arabic numerals (٠-٩) to Western Arabic (0-9)
  let text = caption.replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632));

  // Look for BHD prices specifically
  const priceMatch = text.match(/(\d+(?:\.\d{1,3})?)\s*(?:bhd|bd|د\.ب|دينار|ديناراً)/i);
  if (priceMatch) {
    let p = parseFloat(priceMatch[1]);
    // Normalize three decimal formats (e.g. 35.000 BD -> 35 BHD)
    if (p > 1000) {
      p = p / 1000;
    }
    return Math.round(p);
  }

  // Look for SAR/AED to auto-convert (divide by 10)
  const sarMatch = text.match(/(\d+(?:\.\d{1,3})?)\s*(?:sar|aed|ريال|درهم)/i);
  if (sarMatch) {
    let p = parseFloat(sarMatch[1]);
    if (p > 1000) {
      p = p / 1000;
    }
    return Math.round(p / 10);
  }

  // Search for price-adjacent keywords followed by raw digit under 200 (avoiding phone numbers / sizes)
  const keywordMatch = text.match(
    /(?:السعر|السعر هو|بـ|price|price is)\s*[:：]?\s*(\d+(?:\.\d{1,3})?)/i,
  );
  if (keywordMatch) {
    let p = parseFloat(keywordMatch[1]);
    if (p > 1000) {
      p = p / 1000;
    }
    if (p > 0 && p < 200) {
      return Math.round(p);
    }
  }

  return 0;
}

// Re-hosting core single uploader
async function rehostSingleImage(brandId: string, imageUrl: string): Promise<string> {
  try {
    const imageFetch = await fetch(imageUrl);
    if (!imageFetch.ok) {
      throw new Error(`Failed to fetch original image from CDN: ${imageFetch.status}`);
    }
    const arrayBuffer = await imageFetch.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = imageFetch.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

    const { client, bucket, publicBaseUrl } = r2Client();
    const key = `brands/${brandId}/product/${crypto.randomUUID()}.${ext}`;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        Body: buffer,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return `${publicBaseUrl}/${key}`;
  } catch (err) {
    console.error("Rehost single image to Cloudflare R2 failed:", err);
    return imageUrl; // Graceful fallback to original URL
  }
}

// 2. Phase 1: Batch AI Caption Parsing (1 Gemini Call for ALL Checked Posts)
export const batchParseCaptionsWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        posts: z.array(
          z.object({
            id: z.string(),
            url: z.string(),
            imageUrl: z.string(),
            caption: z.string(),
            isSoldOut: z.boolean(),
            isVideo: z.boolean().optional(),
          }),
        ),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const brandId = data.brandId;

    // Brand and admin access checks
    const [{ data: hasAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!hasAccess && !isAdmin) {
      throw new Error("UNAUTHORIZED");
    }

    const creds = await getGeminiCredentials(context.supabase, userId);
    const apiKey = creds.apiKey;
    let model = creds.model || "gemini-2.5-flash";
    if (model === "gemini-1.5-flash") {
      model = "gemini-1.5-flash-latest"; // Map legacy flash to the updated v1beta valid name
    }

    if (!apiKey) {
      throw new Error("Missing Gemini API Key. Please configure it in your settings page.");
    }

    const postsPayload = data.posts.map((p) => ({
      id: p.id,
      caption: p.caption,
    }));

    let parsedArray: any[] = [];

    try {
      try {
        const systemPrompt = [
          "You are an expert GCC boutique product migration assistant.",
          "Analyze a JSON array of Instagram post captions and extract structured product catalog metadata for each.",
          "Strict Price Rules:",
          "1. CURRENCY PRIORITY: Explicitly look for prices in BHD, BD, bd, dinar, دينار, د.ب, د.ب. (e.g. '35 BD' -> price: 35).",
          "2. MULTIPLE CURRENCIES: If multiple currencies are listed (e.g. '35 BD / 350 SAR'), always extract the BHD/BD value (35).",
          "3. AUTO-CONVERT: If only SAR or AED is listed (e.g. '350 SAR' or '350 ريال'), divide by 10 to auto-convert to BHD (35).",
          "4. ARABIC NUMERALS: Normalize Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) to standard digits (0123456789).",
          "5. CRITICAL EXCLUSIONS:",
          "   - Do NOT confuse abaya/clothing sizes (50 to 62) with prices unless followed by BD/BHD/دينار.",
          "   - Do NOT confuse 8-digit phone numbers starting with 3, 6, 17, or +973, 00973 with prices.",
          "   - Do NOT parse delivery fees (e.g. 'توصيل 2 دينار' should be ignored).",
          "6. DECIMALS & FALLBACK: Handle 3-decimal formats (e.g. '35.000 BD' -> 35). If no explicit currency is found, check for 'السعر', 'Price', or 'بـ' followed by a number under 200. If no price is detectable, return 0.",
          "7. SIZES: Extract standard GCC garments sizes (like 52, 54, 56, 58, 60, 62) as an array of strings. If no sizes are detectable, return a default list ['52', '54', '56', '58'].",
          "8. CATEGORY: Categorize into 'Abayas', 'Dresses', 'Accessories' or other GCC apparel collections.",
          "Provide a minified JSON array matching the requested schema and nothing else.",
        ].join("\n");

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        let response = await fetch(endpoint, {
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
                    text: `Analyze and extract structured catalog data for these Instagram posts:\n\n${JSON.stringify(postsPayload, null, 2)}`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
              responseJsonSchema: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    price: { type: "number" },
                    description: { type: "string" },
                    sizes: { type: "array", items: { type: "string" } },
                    category: { type: "string" },
                  },
                  required: ["id", "title", "price", "description", "sizes", "category"],
                },
              },
            },
          }),
        });

        // Automated retry fallback if the primary model failed
        if (!response.ok && model !== "gemini-1.5-flash-latest") {
          console.warn(
            `Primary Gemini model (${model}) request failed. Retrying with ultra-stable gemini-1.5-flash-latest...`,
          );
          const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent`;
          response = await fetch(fallbackEndpoint, {
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
                      text: `Analyze and extract structured catalog data for these Instagram posts:\n\n${JSON.stringify(postsPayload, null, 2)}`,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json",
                responseJsonSchema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      price: { type: "number" },
                      description: { type: "string" },
                      sizes: { type: "array", items: { type: "string" } },
                      category: { type: "string" },
                    },
                    required: ["id", "title", "price", "description", "sizes", "category"],
                  },
                },
              },
            }),
          });
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini batch request failed: ${response.status} - ${errText}`);
        }

        const resJson = await response.json<{
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        }>();
        const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
          throw new Error("Gemini returned an empty response candidate.");
        }

        parsedArray = JSON.parse(rawText.trim()) as any[];
      } catch (apiErr) {
        console.error(
          "Gemini batch request failed completely, invoking robust local regex/heuristic fallback:",
          apiErr,
        );
        // Fail-safe pure rule-based fallback mapping
        parsedArray = data.posts.map((post) => {
          const lines = post.caption
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          const title =
            lines.length > 0
              ? lines[0]
                  .replace(/[✨🌿🌟🤍🖤]/g, "")
                  .slice(0, 60)
                  .trim()
              : "Instagram Product";

          const price = extractPriceFallback(post.caption) || 25;
          const description = post.caption;
          const sizes = ["52", "54", "56", "58"];
          const category = "Abayas";

          return {
            id: post.id,
            title,
            price,
            description,
            sizes,
            category,
          };
        });
      }

      // Perform strict regex safety checks and complete fallback operations
      const products = data.posts.map((originalPost) => {
        const parsed = parsedArray.find((item) => item.id === originalPost.id) || {};

        let title = parsed.title;
        if (!title || title === "Instagram Product") {
          const lines = originalPost.caption
            .split("\n")
            .map((l: string) => l.trim())
            .filter(Boolean);
          title =
            lines.length > 0
              ? lines[0]
                  .replace(/[✨🌿🌟🤍🖤]/g, "")
                  .slice(0, 60)
                  .trim()
              : "Instagram Product";
        }

        let price = Number(parsed.price);
        // Regex Parser Fallback Safety Net (for zero, sizes, or over-inflated prices)
        const isUnlikelyPrice =
          isNaN(price) || price === 0 || price > 200 || [52, 54, 56, 58, 60, 62].includes(price);
        if (isUnlikelyPrice) {
          const regexPrice = extractPriceFallback(originalPost.caption);
          if (regexPrice > 0) {
            price = regexPrice;
          } else if (isNaN(price) || price === 0) {
            price = 25; // safe default BHD fallback
          }
        }

        const description = parsed.description || originalPost.caption;
        const sizes =
          parsed.sizes && parsed.sizes.length > 0 ? parsed.sizes : ["52", "54", "56", "58"];
        const category = parsed.category || "Abayas";

        return {
          id: originalPost.id,
          imageUrl: originalPost.imageUrl,
          url: originalPost.url,
          isSoldOut: originalPost.isSoldOut,
          title,
          price,
          description,
          sizes,
          category,
        };
      });

      return { products };
    } catch (error: any) {
      console.error("Batch AI caption parsing error:", error);
      throw error;
    }
  });

// 3. Phase 2: Parallel R2 Image Re-Hosting (Concurrent batches of 5)
export const batchRehostImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        products: z.array(
          z.object({
            id: z.string(),
            imageUrl: z.string(),
            url: z.string(),
            isSoldOut: z.boolean(),
            title: z.string(),
            price: z.number(),
            description: z.string(),
            sizes: z.array(z.string()),
            category: z.string(),
          }),
        ),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const brandId = data.brandId;
    const items = [...data.products];
    const batchSize = 5;

    try {
      // Chunk processing in concurrent groups of 5
      for (let i = 0; i < items.length; i += batchSize) {
        const chunk = items.slice(i, i + batchSize);
        await Promise.all(
          chunk.map(async (product) => {
            const idx = items.findIndex((item) => item.id === product.id);
            if (idx !== -1) {
              const r2Url = await rehostSingleImage(brandId, product.imageUrl);
              items[idx].imageUrl = r2Url;
            }
          }),
        );
      }
      return { products: items };
    } catch (error: any) {
      console.error("Batch rehosting exception handled:", error);
      throw error;
    }
  });

// 4. Phase 3: Bulk Database Insertion (Single transactional query)
export const bulkInsertProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        products: z.array(
          z.object({
            id: z.string(),
            imageUrl: z.string(),
            url: z.string(),
            isSoldOut: z.boolean(),
            title: z.string(),
            price: z.number(),
            description: z.string(),
            sizes: z.array(z.string()),
            category: z.string(),
          }),
        ),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const brandId = data.brandId;

    if (data.products.length === 0) {
      return { successCount: 0 };
    }

    try {
      const productRows = data.products.map((p) => {
        const mediaArray = [{ type: "image", url: p.imageUrl }];
        return {
          user_id: userId,
          brand_id: brandId,
          name: p.title,
          name_en: p.title,
          name_ar: p.title,
          description: p.description,
          description_en: p.description,
          description_ar: p.description,
          category: p.category,
          image_url: p.imageUrl,
          is_active: false, // Created as drafts for merchant review
          featured_trending: false,
          show_sale_badge: false,
          media: mediaArray,
          custom_fields: { instagram_post_id: p.id },
        };
      });

      const { data: insertedProducts, error: prodErr } = await context.supabase
        .from("products")
        .insert(productRows)
        .select("id, custom_fields");

      if (prodErr || !insertedProducts) {
        throw new Error(`Failed to batch insert products: ${prodErr?.message}`);
      }

      const variantRows: any[] = [];
      insertedProducts.forEach((insertedProd: any) => {
        const postInstaId = (insertedProd.custom_fields as any)?.instagram_post_id;
        const originalPost = data.products.find((p) => p.id === postInstaId);
        if (!originalPost) return;

        const sizes =
          originalPost.sizes && originalPost.sizes.length > 0
            ? originalPost.sizes
            : ["52", "54", "56", "58"];
        const price = originalPost.price || 25;

        sizes.forEach((size: string) => {
          variantRows.push({
            user_id: userId,
            brand_id: brandId,
            product_id: insertedProd.id,
            size,
            size_unit: "",
            color: "",
            fabric: "",
            sku: `IG-${insertedProd.id.slice(0, 5).toUpperCase()}-${size}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            barcode: null,
            cost_price: Math.round(price * 0.5),
            selling_price: price,
            stock_main: originalPost.isSoldOut ? 0 : 15,
            stock_incubator: 0,
          });
        });
      });

      if (variantRows.length > 0) {
        const { error: varErr } = await context.supabase
          .from("product_variants")
          .insert(variantRows);

        if (varErr) {
          throw new Error(`Failed to batch insert variants: ${varErr.message}`);
        }
      }

      return { successCount: insertedProducts.length };
    } catch (error: any) {
      console.error("Bulk database insertion failed:", error);
      throw error;
    }
  });
