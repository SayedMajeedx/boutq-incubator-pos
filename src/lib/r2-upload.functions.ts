import { createServerFn } from "@tanstack/react-start";
import { AwsClient } from "aws4fetch";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

let getEventFn: any = null;
const vinxiHttp = "vinxi/http";
import(/* @vite-ignore */ vinxiHttp)
  .then((m) => {
    getEventFn = m.getEvent;
  })
  .catch(() => {});

function getPlatformEnv(name: string): string | undefined {
  const viteName = name.startsWith("VITE_") ? name : `VITE_${name}`;
  const unprefixed = name.startsWith("VITE_") ? name.slice(5) : name;

  const searchNames = [name, viteName, unprefixed];
  if (name === "R2_SECRET_ACCESS_KEY") {
    searchNames.push("SECRET_ACCESS_KEY");
  }

  try {
    if (getEventFn) {
      const event = getEventFn();
      const env =
        event?.context?.cloudflare?.env ||
        (event?.context as any)?.env ||
        event?.context?.cloudflare ||
        (event?.context as any)?.cloudflare?.env;
      if (env) {
        for (const key of searchNames) {
          if (env[key]) return env[key];
        }
      }
    }
  } catch {}

  try {
    const g = globalThis as any;
    const liveEnv = g["__CLOUDFLARE_ENV__"] || g["process"]?.["env"] || process.env;
    if (liveEnv) {
      for (const key of searchNames) {
        if (liveEnv[key]) return liveEnv[key];
      }
    }
  } catch {}

  return undefined;
}

const mediaKinds = [
  "logo",
  "favicon",
  "font",
  "product",
  "category",
  "hero",
  "page",
  "payment-qr",
  "expense-receipt",
] as const;
export const mimeToExtension: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "font/woff": "woff",
  "font/woff2": "woff2",
  "font/ttf": "ttf",
  "font/otf": "otf",
  "application/font-woff": "woff",
  "application/x-font-ttf": "ttf",
  "application/x-font-opentype": "otf",
  "application/octet-stream": "bin",
  "application/pdf": "pdf",
};

const Input = z.object({
  brandId: z.string().uuid(),
  kind: z.enum(mediaKinds),
  contentType: z.string().min(3).max(100),
  size: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024),
});

function requiredEnv(name: string): string {
  const value = getPlatformEnv(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function sanitizeValue(val: string | undefined): string | undefined {
  if (!val) return undefined;
  return val
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

type R2PutInput = {
  Bucket?: string;
  Key?: string;
  Body?: unknown;
  ContentType?: string;
  CacheControl?: string;
};

class R2CompatClient {
  constructor(
    readonly signer: AwsClient,
    readonly endpoint: string,
  ) {}

  async send(command: { input?: R2PutInput }): Promise<void> {
    const input = command?.input;
    if (!input?.Bucket || !input.Key) throw new Error("INVALID_R2_PUT_COMMAND");
    const response = await this.signer.fetch(r2ObjectUrl(this.endpoint, input.Bucket, input.Key), {
      method: "PUT",
      headers: {
        ...(input.ContentType ? { "Content-Type": input.ContentType } : {}),
        ...(input.CacheControl ? { "Cache-Control": input.CacheControl } : {}),
      },
      body: input.Body as BodyInit | null | undefined,
    });
    if (!response.ok) throw new Error(`R2 upload failed (${response.status})`);
  }
}

function r2ObjectUrl(endpoint: string, bucket: string, key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${endpoint}/${encodeURIComponent(bucket)}/${encodedKey}`;
}

export function r2Client(): { client: R2CompatClient; bucket: string; publicBaseUrl: string } {
  let env: any = null;
  try {
    if (getEventFn) {
      const event = getEventFn();
      env =
        event?.context?.cloudflare?.env ||
        event?.context?.env ||
        event?.context?.cloudflare ||
        (event?.context as any)?.cloudflare?.env;
    }
  } catch {}

  // Safe global fallback
  if (!env) {
    try {
      const g = globalThis as any;
      env = g["__CLOUDFLARE_ENV__"] || g["__env__"] || g["process"]?.["env"] || process.env;
    } catch {}
  }

  const g = globalThis as any;
  const accountId = sanitizeValue(env?.R2_ACCOUNT_ID || g.R2_ACCOUNT_ID);
  const accessKeyId = sanitizeValue(
    env?.R2_ACCESS_KEY_ID || env?.ACCESS_KEY_ID || g.R2_ACCESS_KEY_ID || g.ACCESS_KEY_ID,
  );
  const secretAccessKey = sanitizeValue(
    env?.R2_SECRET_ACCESS_KEY ||
      env?.SECRET_ACCESS_KEY ||
      g.R2_SECRET_ACCESS_KEY ||
      g.SECRET_ACCESS_KEY,
  );
  const bucket = sanitizeValue(env?.R2_BUCKET_NAME || g.R2_BUCKET_NAME);

  // Provide robust fallback to production storefront custom media domain
  const publicBaseUrl =
    sanitizeValue(env?.R2_PUBLIC_BASE_URL || g.R2_PUBLIC_BASE_URL) || "https://media.boutq.store";

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      `Missing required Cloudflare execution context environment variables for Public R2 client. ` +
        `AccountId: ${!!accountId}, AccessKeyId: ${!!accessKeyId}, SecretAccessKey: ${!!secretAccessKey}, Bucket: ${!!bucket}`,
    );
  }

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const signer = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
  return {
    client: new R2CompatClient(signer, endpoint),
    bucket,
    publicBaseUrl,
  };
}

function r2Connection(): {
  signer: AwsClient;
  endpoint: string;
  bucket: string;
  publicBaseUrl: string;
} {
  const config = r2Client();
  return {
    signer: config.client.signer,
    endpoint: config.client.endpoint,
    bucket: config.bucket,
    publicBaseUrl: config.publicBaseUrl,
  };
}

export async function createR2PresignedPutUrl(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const { signer, endpoint, bucket, publicBaseUrl } = r2Connection();
  const unsignedUrl = new URL(r2ObjectUrl(endpoint, bucket, key));
  unsignedUrl.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signedRequest = await signer.sign(unsignedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    aws: { signQuery: true },
  });
  return { uploadUrl: signedRequest.url, publicUrl: `${publicBaseUrl}/${key}` };
}

export const createR2UploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const [{ data: canAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: data.brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!canAccess || !isAdmin) throw new Error("FORBIDDEN");

    const extension = mimeToExtension[data.contentType.toLowerCase()];
    if (!extension) throw new Error("UNSUPPORTED_FILE_TYPE");
    const isVideo = data.contentType.startsWith("video/");
    const maxSize = isVideo
      ? 100 * 1024 * 1024
      : data.kind === "font"
        ? 10 * 1024 * 1024
        : 12 * 1024 * 1024;
    if (data.size > maxSize) throw new Error("FILE_TOO_LARGE");
    if (isVideo && !["hero", "product"].includes(data.kind))
      throw new Error("UNSUPPORTED_FILE_TYPE");

    const { signer, endpoint, bucket, publicBaseUrl } = r2Connection();
    const key = `brands/${data.brandId}/${data.kind}/${crypto.randomUUID()}.${extension}`;
    const unsignedUrl = new URL(r2ObjectUrl(endpoint, bucket, key));
    unsignedUrl.searchParams.set("X-Amz-Expires", "300");
    const signedRequest = await signer.sign(unsignedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": data.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      aws: { signQuery: true },
    });
    return { uploadUrl: signedRequest.url, publicUrl: `${publicBaseUrl}/${key}`, key };
  });

const DeleteInput = z.object({
  brandId: z.string().uuid(),
  key: z.string().min(20).max(500),
});

export const deleteR2Object = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => DeleteInput.parse(raw))
  .handler(async ({ data, context }) => {
    const [{ data: canAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: data.brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!canAccess || !isAdmin) throw new Error("FORBIDDEN");
    if (!data.key.startsWith(`brands/${data.brandId}/`)) throw new Error("INVALID_OBJECT_KEY");
    const { signer, endpoint, bucket } = r2Connection();
    const response = await signer.fetch(r2ObjectUrl(endpoint, bucket, data.key), {
      method: "DELETE",
    });
    if (!response.ok && response.status !== 404)
      throw new Error(`R2 delete failed (${response.status})`);
    return { deleted: true };
  });

const PurgeBrandInput = z.object({ brandId: z.string().uuid() });

/** Permanently removes every R2 object owned by one brand. Super-admin only. */
export const purgeBrandR2Objects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => PurgeBrandInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isSuperAdmin, error } = await context.supabase.rpc("is_super_admin");
    if (error || !isSuperAdmin) throw new Error("FORBIDDEN");

    const { signer, endpoint, bucket } = r2Connection();
    const prefix = `brands/${data.brandId}/`;
    let continuationToken: string | undefined;
    let deleted = 0;
    do {
      const listUrl = new URL(`${endpoint}/${encodeURIComponent(bucket)}`);
      listUrl.searchParams.set("list-type", "2");
      listUrl.searchParams.set("prefix", prefix);
      listUrl.searchParams.set("max-keys", "1000");
      if (continuationToken) listUrl.searchParams.set("continuation-token", continuationToken);
      const listed = await signer.fetch(listUrl);
      if (!listed.ok) throw new Error(`R2 list failed (${listed.status})`);
      const xml = await listed.text();
      const keys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((match) =>
        match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
      );
      for (let index = 0; index < keys.length; index += 20) {
        const batch = keys.slice(index, index + 20);
        await Promise.all(
          batch.map(async (key) => {
            const response = await signer.fetch(r2ObjectUrl(endpoint, bucket, key), {
              method: "DELETE",
            });
            if (!response.ok && response.status !== 404)
              throw new Error(`R2 delete failed (${response.status})`);
          }),
        );
        deleted += batch.length;
      }
      const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
      continuationToken = truncated
        ? xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1]
        : undefined;
    } while (continuationToken);
    return { deleted, prefix };
  });
