import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/cleanup-benefit-receipts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET?.trim();
        if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { cleanupBenefitReceipts } = await import("@/lib/benefit-receipt-cleanup.server");
        const result = await cleanupBenefitReceipts();
        return Response.json(result, { status: result.ok ? 200 : 207 });
      },
    },
  },
});
