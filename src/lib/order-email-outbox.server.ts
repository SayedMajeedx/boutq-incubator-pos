type WorkerRuntimeEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ORDER_EMAIL_WEBHOOK_SECRET?: string;
};

type OutboxEvent = {
  id: string;
};

function requiredEnv(env: WorkerRuntimeEnv, name: keyof WorkerRuntimeEnv): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required Worker secret: ${name}`);
  return value;
}

function supabaseHeaders(serviceRoleKey: string): HeadersInit {
  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
  };
  if (!serviceRoleKey.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${serviceRoleKey}`;
  }
  return headers;
}

export async function retryOrderEmailOutbox(
  env: WorkerRuntimeEnv,
): Promise<{ attempted: number; succeeded: number; failed: number }> {
  const supabaseUrl = requiredEnv(env, "SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requiredEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = requiredEnv(env, "ORDER_EMAIL_WEBHOOK_SECRET");

  // Recover events left in "processing" when an Edge Function invocation is
  // interrupted after claiming the row. Ten minutes is well beyond the normal
  // email delivery window and avoids racing an active invocation.
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recoveryUrl = new URL(`${supabaseUrl}/rest/v1/order_email_events`);
  recoveryUrl.searchParams.set("status", "eq.processing");
  recoveryUrl.searchParams.set("created_at", `lt.${staleBefore}`);
  recoveryUrl.searchParams.set("attempts", "lt.5");
  const recoveryResponse = await fetch(recoveryUrl, {
    method: "PATCH",
    headers: {
      ...supabaseHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      status: "failed",
      last_error: "Recovered after an interrupted email delivery attempt",
    }),
  });
  if (!recoveryResponse.ok) {
    throw new Error(`Could not recover stale email events (${recoveryResponse.status})`);
  }

  const pendingUrl = new URL(`${supabaseUrl}/rest/v1/order_email_events`);
  pendingUrl.searchParams.set("select", "id");
  pendingUrl.searchParams.set("status", "in.(pending,failed)");
  pendingUrl.searchParams.set("attempts", "lt.5");
  pendingUrl.searchParams.set("order", "created_at.asc");
  pendingUrl.searchParams.set("limit", "25");

  const pendingResponse = await fetch(pendingUrl, {
    headers: supabaseHeaders(serviceRoleKey),
  });
  if (!pendingResponse.ok) {
    throw new Error(`Could not load email outbox (${pendingResponse.status})`);
  }

  const events = (await pendingResponse.json()) as OutboxEvent[];
  let succeeded = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/send-order-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": webhookSecret,
        },
        body: JSON.stringify({ outbox_id: event.id }),
      });
      if (!response.ok) {
        throw new Error(`Email function returned ${response.status}`);
      }
      succeeded += 1;
    } catch (error) {
      failed += 1;
      console.error(
        JSON.stringify({
          event: "order_email_retry_failed",
          outboxId: event.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return { attempted: events.length, succeeded, failed };
}
