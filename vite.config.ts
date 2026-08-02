import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // Order Detail is an explicitly documented temporary exception. All other
    // route chunks must remain below this ceiling.
    chunkSizeWarningLimit: 600,
  },
  environments: {
    ssr: {
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: false,
          },
        },
      },
    },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({
      server: {
        entry: "server",
      },
    }),
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: ["vinxi/http"],
  },
  ssr: {
    optimizeDeps: {
      exclude: ["vinxi/http"],
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
});
