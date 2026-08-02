import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({ url: z.string().url().max(2048) });

export const getInvoiceAssetDataUrl = createServerFn({ method: "POST" })
  .validator((value: unknown) => inputSchema.parse(value))
  .handler(async ({ data }) => {
    const url = new URL(data.url);
    const allowed =
      url.protocol === "https:" &&
      (url.hostname === "media.boutq.store" ||
        url.hostname.endsWith(".r2.cloudflarestorage.com") ||
        url.hostname.endsWith(".supabase.co"));
    if (!allowed) throw new Error("Invoice asset host is not allowed");
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) throw new Error("Unable to load invoice asset");
    const contentType = response.headers.get("content-type") || "image/png";
    if (!contentType.startsWith("image/")) throw new Error("Invalid invoice image");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  });
