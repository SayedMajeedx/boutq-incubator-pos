import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/api/cron/process-rent-deductions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET?.trim();
        if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { data, error } = await supabase.rpc("process_rent_auto_deduction");
          if (error) throw error;
          return Response.json(data ?? { success: true });
        } catch (e: any) {
          return Response.json({ success: false, error: e.message }, { status: 500 });
        }
      },
      POST: async () => {
        try {
          const { data, error } = await supabase.rpc("process_rent_auto_deduction");
          if (error) throw error;
          return Response.json(data ?? { success: true });
        } catch (e: any) {
          return Response.json({ success: false, error: e.message }, { status: 500 });
        }
      },
    },
  },
});
