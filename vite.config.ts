import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "process.env.SUPABASE_URL": JSON.stringify(
      process.env.SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        "https://ikciahnuqhemvnyfvbyp.supabase.co"
    ),
    "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy"
    ),
    "process.env.VITE_SUPABASE_URL": JSON.stringify(
      process.env.VITE_SUPABASE_URL ||
        process.env.SUPABASE_URL ||
        "https://ikciahnuqhemvnyfvbyp.supabase.co"
    ),
    "process.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy"
    ),
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
  resolve: {
    tsconfigPaths: true,
  },
});
