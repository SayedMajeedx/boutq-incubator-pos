import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/platform/$filename")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { filename } = params;

        try {
          const { handlePlatformR2Stream } = await import("../lib/r2-stream.server");
          return await handlePlatformR2Stream(filename);
        } catch (error: any) {
          console.error(`Error in platform media streamer router for "${filename}":`, error);
          return new Response(`Router error: ${error.message}`, { status: 500 });
        }
      },
    },
  },
});
