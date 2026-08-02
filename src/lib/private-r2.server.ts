import { AwsClient } from "aws4fetch";

type PrivateR2Config = {
  client: AwsClient;
  endpoint: string;
  bucket: string;
};

function sanitizeValue(value: string | undefined): string | undefined {
  return (
    value
      ?.trim()
      .replace(/^['"]|['"]$/g, "")
      .trim() || undefined
  );
}

function runtimeEnv(): Record<string, string | undefined> {
  const globalWithEnv = globalThis as typeof globalThis & {
    __CLOUDFLARE_ENV__?: Record<string, string | undefined>;
  };
  return globalWithEnv.__CLOUDFLARE_ENV__ ?? process.env;
}

function privateR2(): PrivateR2Config {
  const env = runtimeEnv();
  const accountId = sanitizeValue(env.R2_ACCOUNT_ID);
  const accessKeyId = sanitizeValue(
    env.R2_PRIVATE_ACCESS_KEY_ID ?? env.R2_ACCESS_KEY_ID ?? env.ACCESS_KEY_ID,
  );
  const secretAccessKey = sanitizeValue(
    env.R2_PRIVATE_SECRET_ACCESS_KEY ?? env.R2_SECRET_ACCESS_KEY ?? env.SECRET_ACCESS_KEY,
  );
  const bucket = sanitizeValue(env.R2_PRIVATE_BUCKET ?? env.R2_PRIVATE_BUCKET_NAME);

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Missing required private R2 Worker bindings");
  }

  return {
    client: new AwsClient({
      accessKeyId,
      secretAccessKey,
      region: "auto",
      service: "s3",
    }),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    bucket,
  };
}

function objectUrl(config: PrivateR2Config, key: string): URL {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`${config.endpoint}/${encodeURIComponent(config.bucket)}/${encodedKey}`);
}

async function signedRequest(
  config: PrivateR2Config,
  url: URL,
  init: RequestInit,
): Promise<Response> {
  const signed = await config.client.sign(new Request(url, init));
  return fetch(signed);
}

export async function createPrivateUploadUrl(key: string, contentType: string): Promise<string> {
  const config = privateR2();
  const url = objectUrl(config, key);
  url.searchParams.set("X-Amz-Expires", "300");
  const signed = await config.client.sign(
    new Request(url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
    }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}

export async function inspectPrivateObject(key: string) {
  const config = privateR2();
  const response = await signedRequest(config, objectUrl(config, key), {
    method: "HEAD",
  });
  if (!response.ok) throw new Error(`Private R2 HEAD failed (${response.status})`);
  return {
    ContentLength: Number(response.headers.get("content-length") ?? 0),
    ContentType: response.headers.get("content-type") ?? undefined,
  };
}

export async function createPrivateViewUrl(key: string): Promise<string> {
  const config = privateR2();
  const url = objectUrl(config, key);
  url.searchParams.set("X-Amz-Expires", "300");
  url.searchParams.set("response-cache-control", "private, no-store");
  url.searchParams.set("response-content-disposition", "inline");
  const signed = await config.client.sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

export async function deletePrivateObject(key: string): Promise<void> {
  const config = privateR2();
  const response = await signedRequest(config, objectUrl(config, key), {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Private R2 DELETE failed (${response.status})`);
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlValues(xml: string, tag: string): string[] {
  const expression = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g");
  return [...xml.matchAll(expression)].map((match) => decodeXml(match[1]));
}

export async function purgePrivatePrefix(prefix: string): Promise<number> {
  if (!prefix.startsWith("brands/") || prefix.includes("..")) {
    throw new Error("INVALID_PRIVATE_PREFIX");
  }

  const config = privateR2();
  let continuationToken: string | undefined;
  let deleted = 0;
  do {
    const listUrl = new URL(`${config.endpoint}/${encodeURIComponent(config.bucket)}`);
    listUrl.searchParams.set("list-type", "2");
    listUrl.searchParams.set("prefix", prefix);
    listUrl.searchParams.set("max-keys", "1000");
    if (continuationToken) {
      listUrl.searchParams.set("continuation-token", continuationToken);
    }

    const listed = await signedRequest(config, listUrl, { method: "GET" });
    if (!listed.ok) throw new Error(`Private R2 LIST failed (${listed.status})`);
    const xml = await listed.text();
    const keys = xmlValues(xml, "Key");
    for (const key of keys) {
      await deletePrivateObject(key);
      deleted += 1;
    }
    continuationToken = xmlValues(xml, "NextContinuationToken")[0];
  } while (continuationToken);

  return deleted;
}

export function isPrivateReceiptKey(key: string, brandId?: string): boolean {
  const prefix = brandId ? `brands/${brandId}/benefit-receipts/` : "brands/";
  return key.startsWith(prefix) && key.includes("/benefit-receipts/") && !key.includes("..");
}
