import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/brands/$brandId/$kind/$filename")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { brandId, kind, filename } = params;

        try {
          // Dynamically import the strictly server-only module inside the server-handler block
          const { handleR2Stream } = await import("../lib/r2-stream.server");
          return await handleR2Stream(brandId, kind, filename);
        } catch (error: any) {
          console.error(
            `Error in brands media streamer router for "${brandId}/${kind}/${filename}":`,
            error,
          );
          return new Response(`Router error: ${error.message} - ${error.stack}`, { status: 500 });
        }
      },
    },
  },
});
