import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Cache of S3Client instances to prevent memory leaks and ensure idempotency
const s3ClientsCache = new Map<string, S3Client>();

function sanitizeValue(val: string | undefined): string | undefined {
  if (!val) return undefined;
  return val
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

function getCachedS3Client(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
): S3Client {
  const cacheKey = `${accountId}:${accessKeyId}`;
  let client = s3ClientsCache.get(cacheKey);

  if (!client) {
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    try {
      new URL(endpoint); // Validates format before passing to S3Client
    } catch (err: any) {
      throw new Error(
        `Generated R2 endpoint URL "${endpoint}" is invalid: ${err.message} (accountId length: ${accountId.length})`,
      );
    }

    client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    s3ClientsCache.set(cacheKey, client);
  }

  return client;
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

async function getR2Config(isPrivate: boolean = false): Promise<R2Config> {
  let env: any = null;

  // 1. Try Cloudflare request context dynamically via Vinxi/H3 event
  try {
    const vinxiHttp = "vinxi/http";
    const { getEvent } = await import(vinxiHttp);
    const event = getEvent();

    env =
      event?.context?.cloudflare?.env ||
      event?.context?.env ||
      event?.context?.cloudflare ||
      (event?.context as any)?.cloudflare?.env;
  } catch (err) {
    console.error("[R2 Context Error] Failed to retrieve H3 event execution context:", err);
  }

  // 2. Fall back safely to global environment contexts (e.g. globalThis.__env__ injected by Vite)
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

  // Map exactly to variables specified by dashboard naming guidelines with standard fallbacks
  const rawBucket = isPrivate
    ? env?.R2_PRIVATE_BUCKET ||
      env?.R2_PRIVATE_BUCKET_NAME ||
      g.R2_PRIVATE_BUCKET ||
      g.R2_PRIVATE_BUCKET_NAME
    : env?.R2_BUCKET_NAME || g.R2_BUCKET_NAME;
  const bucket = sanitizeValue(rawBucket);

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Missing required Cloudflare execution context environment variables for R2 initialization.",
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export async function handleR2Stream(
  brandId: string,
  kind: string,
  filename: string,
): Promise<Response> {
  const key = `brands/${brandId}/${kind}/${filename}`;
  // Receipts are stored in the private bucket, others in public
  const isPrivate =
    kind === "expense-receipt" || kind === "benefit-receipts" || kind.includes("receipt");

  try {
    const config = await getR2Config(isPrivate);
    const client = getCachedS3Client(config.accountId, config.accessKeyId, config.secretAccessKey);

    const command = new GetObjectCommand({
      Bucket: config.bucket, // Plain text string bucket name
      Key: key,
    });

    const response = await client.send(command);
    if (!response.Body) {
      return new Response("Not Found", { status: 404 });
    }

    const headers = new Headers();
    if (response.ContentType) {
      headers.set("Content-Type", response.ContentType);
    }
    if (response.CacheControl) {
      headers.set("Cache-Control", response.CacheControl);
    } else {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    if (response.ContentLength) {
      headers.set("Content-Length", response.ContentLength.toString());
    }

    return new Response(response.Body as any, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error(`Error streaming R2 asset for key "${key}":`, error);
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return new Response("Object Not Found", { status: 404 });
    }
    return new Response(`Streamer Error: ${error.message}`, { status: 500 });
  }
}

export async function handlePlatformR2Stream(filename: string): Promise<Response> {
  const key = `platform/${filename}`;

  try {
    const config = await getR2Config(false); // platform files are in public bucket
    const client = getCachedS3Client(config.accountId, config.accessKeyId, config.secretAccessKey);

    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    });

    const response = await client.send(command);
    if (!response.Body) {
      return new Response("Not Found", { status: 404 });
    }

    const headers = new Headers();
    if (response.ContentType) {
      headers.set("Content-Type", response.ContentType);
    }
    if (response.CacheControl) {
      headers.set("Cache-Control", response.CacheControl);
    } else {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    if (response.ContentLength) {
      headers.set("Content-Length", response.ContentLength.toString());
    }

    return new Response(response.Body as any, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error(`Error streaming platform asset for key "${key}":`, error);
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return new Response("Object Not Found", { status: 404 });
    }
    return new Response(`Streamer Error: ${error.message}`, { status: 500 });
  }
}
