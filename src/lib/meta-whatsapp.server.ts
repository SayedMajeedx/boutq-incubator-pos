type MetaWhatsAppEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  PURA_WHATSAPP_ACCESS_TOKEN?: string;
  META_WHATSAPP_APP_SECRET?: string;
  META_WHATSAPP_VERIFY_TOKEN?: string;
};

type OutboxId = { id: string };

type ClaimedEvent = {
  event_id: string;
  brand_id: string;
  recipient: string;
  template_name: string;
  language: "ar" | "en";
  parameters: unknown;
  phone_number_id: string;
  graph_api_version: string;
};

type MetaStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: Array<{
    code?: number;
    title?: string;
    message?: string;
    error_data?: { details?: string };
  }>;
};

type MetaMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
};

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        statuses?: MetaStatus[];
        messages?: MetaMessage[];
      };
    }>;
  }>;
};

const MAX_WEBHOOK_BYTES = 1024 * 1024;
const RETRY_LIMIT = 5;

function requiredEnv(env: MetaWhatsAppEnv, key: keyof MetaWhatsAppEnv): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required Worker secret: ${key}`);
  return value;
}

function optionalEnv(env: MetaWhatsAppEnv, key: keyof MetaWhatsAppEnv): string | null {
  return env[key]?.trim() || null;
}

function supabaseHeaders(serviceRoleKey: string, json = false): Headers {
  const headers = new Headers({ apikey: serviceRoleKey });
  if (!serviceRoleKey.startsWith("sb_secret_")) {
    headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  }
  if (json) headers.set("Content-Type", "application/json");
  return headers;
}

function supabaseConfig(env: MetaWhatsAppEnv) {
  return {
    baseUrl: requiredEnv(env, "SUPABASE_URL").replace(/\/+$/, ""),
    serviceRoleKey: requiredEnv(env, "SUPABASE_SERVICE_ROLE_KEY"),
  };
}

async function rpc<T>(
  env: MetaWhatsAppEnv,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { baseUrl, serviceRoleKey } = supabaseConfig(env);
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: supabaseHeaders(serviceRoleKey, true),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase RPC ${name} failed (${response.status}): ${message.slice(0, 500)}`);
  }
  return (await response.json()) as T;
}

async function insertWebhookEvent(
  env: MetaWhatsAppEnv,
  eventKey: string,
  brandId: string,
  eventKind: string,
): Promise<boolean> {
  const { baseUrl, serviceRoleKey } = supabaseConfig(env);
  const headers = supabaseHeaders(serviceRoleKey, true);
  headers.set("Prefer", "resolution=ignore-duplicates,return=representation");
  const response = await fetch(`${baseUrl}/rest/v1/whatsapp_webhook_events?on_conflict=event_key`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event_key: eventKey,
      brand_id: brandId,
      event_kind: eventKind,
    }),
  });
  if (!response.ok) {
    throw new Error(`Could not record WhatsApp webhook event (${response.status})`);
  }
  const rows = (await response.json()) as Array<{ event_key: string }>;
  return rows.length > 0;
}

async function findIntegrationByPhoneNumberId(
  env: MetaWhatsAppEnv,
  phoneNumberId: string,
): Promise<{ brand_id: string } | null> {
  const { baseUrl, serviceRoleKey } = supabaseConfig(env);
  const url = new URL(`${baseUrl}/rest/v1/whatsapp_integrations`);
  url.searchParams.set("select", "brand_id");
  url.searchParams.set("phone_number_id", `eq.${phoneNumberId}`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, { headers: supabaseHeaders(serviceRoleKey) });
  if (!response.ok) {
    throw new Error(`Could not resolve WhatsApp integration (${response.status})`);
  }
  const rows = (await response.json()) as Array<{ brand_id: string }>;
  return rows[0] ?? null;
}

async function markInbound(
  env: MetaWhatsAppEnv,
  brandId: string,
  receivedAt: string,
): Promise<void> {
  const { baseUrl, serviceRoleKey } = supabaseConfig(env);
  const url = new URL(`${baseUrl}/rest/v1/whatsapp_integrations`);
  url.searchParams.set("brand_id", `eq.${brandId}`);
  const headers = supabaseHeaders(serviceRoleKey, true);
  headers.set("Prefer", "return=minimal");
  const response = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ last_inbound_at: receivedAt, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) {
    throw new Error(`Could not update WhatsApp inbound timestamp (${response.status})`);
  }
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeTextEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return mismatch === 0;
}

export async function verifyMetaWebhookSignature(
  rawBody: ArrayBuffer,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const supplied = signatureHeader.slice("sha256=".length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = hex(await crypto.subtle.sign("HMAC", key, rawBody));
  return constantTimeTextEqual(expected, supplied);
}

export function normalizeMetaStatusTimestamp(value?: string): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function metaErrorText(status: MetaStatus): string | null {
  const error = status.errors?.[0];
  if (!error) return null;
  return [
    error.code ? `Meta ${error.code}` : null,
    error.title,
    error.message,
    error.error_data?.details,
  ]
    .filter(Boolean)
    .join(": ")
    .slice(0, 1000);
}

async function processMetaWebhook(
  env: MetaWhatsAppEnv,
  payload: MetaWebhookPayload,
): Promise<void> {
  if (payload.object !== "whatsapp_business_account") return;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const integration = await findIntegrationByPhoneNumberId(env, phoneNumberId);
      if (!integration) continue;

      for (const status of change.value?.statuses ?? []) {
        if (!status.id || !status.status) continue;
        const statusAt = normalizeMetaStatusTimestamp(status.timestamp);
        const eventKey = `status:${status.id}:${status.status}:${status.timestamp ?? ""}`;
        if (!(await insertWebhookEvent(env, eventKey, integration.brand_id, "status"))) continue;
        await rpc<string | null>(env, "apply_whatsapp_delivery_status", {
          p_provider_message_id: status.id,
          p_status: status.status,
          p_status_at: statusAt,
          p_error: metaErrorText(status),
        });
      }

      for (const message of change.value?.messages ?? []) {
        if (!message.id) continue;
        const eventKey = `message:${message.id}`;
        if (!(await insertWebhookEvent(env, eventKey, integration.brand_id, "inbound"))) continue;
        await markInbound(
          env,
          integration.brand_id,
          normalizeMetaStatusTimestamp(message.timestamp),
        );
      }
    }
  }
}

export async function handleMetaWhatsAppWebhook(
  request: Request,
  env: MetaWhatsAppEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method === "GET") {
    const verifyToken = optionalEnv(env, "META_WHATSAPP_VERIFY_TOKEN");
    if (!verifyToken) return new Response("Webhook is not configured.", { status: 503 });
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || !challenge || !constantTimeTextEqual(token, verifyToken)) {
      return new Response("Verification failed.", { status: 403 });
    }
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed.", { status: 405, headers: { Allow: "GET, POST" } });
  }

  const appSecret = optionalEnv(env, "META_WHATSAPP_APP_SECRET");
  if (!appSecret) return new Response("Webhook is not configured.", { status: 503 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_WEBHOOK_BYTES) return new Response("Payload too large.", { status: 413 });

  const rawBody = await request.arrayBuffer();
  if (rawBody.byteLength > MAX_WEBHOOK_BYTES)
    return new Response("Payload too large.", { status: 413 });
  const valid = await verifyMetaWebhookSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    appSecret,
  );
  if (!valid) return new Response("Invalid signature.", { status: 401 });

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody)) as MetaWebhookPayload;
  } catch {
    return new Response("Invalid JSON.", { status: 400 });
  }

  ctx.waitUntil(
    processMetaWebhook(env, payload).catch((error) => {
      console.error(
        JSON.stringify({
          event: "meta_whatsapp_webhook_processing_failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }),
  );
  return new Response("EVENT_RECEIVED", { status: 200 });
}

function templateParameters(value: unknown): Array<{ type: "text"; text: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 10)
    .map((item) => ({ type: "text" as const, text: String(item ?? "").slice(0, 1024) }));
}

async function updateOutbox(
  env: MetaWhatsAppEnv,
  eventId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { baseUrl, serviceRoleKey } = supabaseConfig(env);
  const url = new URL(`${baseUrl}/rest/v1/whatsapp_outbox`);
  url.searchParams.set("id", `eq.${eventId}`);
  const headers = supabaseHeaders(serviceRoleKey, true);
  headers.set("Prefer", "return=minimal");
  const response = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Could not update WhatsApp outbox (${response.status})`);
}

async function sendClaimedEvent(
  env: MetaWhatsAppEnv,
  event: ClaimedEvent,
  accessToken: string,
): Promise<void> {
  const version = event.graph_api_version.replace(/[^a-zA-Z0-9.]/g, "");
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("Invalid Meta Graph API version");
  if (!/^\d+$/.test(event.phone_number_id)) throw new Error("Invalid Meta phone number ID");

  const response = await fetch(
    `https://graph.facebook.com/${version}/${event.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: event.recipient,
        type: "template",
        template: {
          name: event.template_name,
          language: { code: event.language === "en" ? "en_US" : "ar" },
          components: [
            {
              type: "body",
              parameters: templateParameters(event.parameters),
            },
          ],
        },
      }),
    },
  );

  type MetaSendResponse = {
    messages?: Array<{ id?: string }>;
    error?: { code?: number; message?: string; error_subcode?: number };
  };
  const payload: MetaSendResponse = await response.json<MetaSendResponse>().catch(() => ({}));

  if (!response.ok) {
    const detail = payload.error
      ? `Meta ${payload.error.code ?? response.status}: ${payload.error.message ?? "send failed"}`
      : `Meta send failed (${response.status})`;
    throw new Error(detail.slice(0, 1000));
  }

  const messageId = payload.messages?.[0]?.id;
  if (!messageId) throw new Error("Meta accepted the request without a message ID");
  await updateOutbox(env, event.event_id, {
    status: "accepted",
    provider_message_id: messageId,
    provider_status_at: new Date().toISOString(),
    last_error: null,
  });
}

export async function retryWhatsAppOutbox(
  env: MetaWhatsAppEnv,
): Promise<{ configured: boolean; attempted: number; succeeded: number; failed: number }> {
  const accessToken = optionalEnv(env, "PURA_WHATSAPP_ACCESS_TOKEN");
  if (!accessToken) return { configured: false, attempted: 0, succeeded: 0, failed: 0 };

  const { baseUrl, serviceRoleKey } = supabaseConfig(env);
  const pendingUrl = new URL(`${baseUrl}/rest/v1/whatsapp_outbox`);
  pendingUrl.searchParams.set("select", "id");
  pendingUrl.searchParams.set("status", "in.(pending,failed)");
  pendingUrl.searchParams.set("attempts", `lt.${RETRY_LIMIT}`);
  pendingUrl.searchParams.set("next_attempt_at", `lte.${new Date().toISOString()}`);
  pendingUrl.searchParams.set("order", "created_at.asc");
  pendingUrl.searchParams.set("limit", "25");
  const pendingResponse = await fetch(pendingUrl, { headers: supabaseHeaders(serviceRoleKey) });
  if (!pendingResponse.ok) {
    throw new Error(`Could not load WhatsApp outbox (${pendingResponse.status})`);
  }

  const pending = (await pendingResponse.json()) as OutboxId[];
  let succeeded = 0;
  let failed = 0;

  for (const item of pending) {
    const claimedRows = await rpc<ClaimedEvent[]>(env, "claim_whatsapp_outbox_event", {
      p_event_id: item.id,
    });
    const event = claimedRows[0];
    if (!event) continue;
    try {
      await sendClaimedEvent(env, event, accessToken);
      succeeded += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const attemptRow = await fetch(
        `${baseUrl}/rest/v1/whatsapp_outbox?select=attempts&id=eq.${event.event_id}`,
        { headers: supabaseHeaders(serviceRoleKey) },
      );
      const attempts = attemptRow.ok
        ? Number(((await attemptRow.json()) as Array<{ attempts?: number }>)[0]?.attempts ?? 1)
        : 1;
      const dead = attempts >= RETRY_LIMIT;
      const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
      await updateOutbox(env, event.event_id, {
        status: dead ? "dead" : "failed",
        next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        last_error: message.slice(0, 1000),
      });
      console.error(
        JSON.stringify({
          event: "meta_whatsapp_send_failed",
          outboxId: event.event_id,
          attempt: attempts,
          dead,
          error: message,
        }),
      );
    }
  }

  return { configured: true, attempted: pending.length, succeeded, failed };
}
