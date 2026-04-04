import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (
            id.includes("/react/") ||
            id.includes("react-dom") ||
            id.includes("react-router") ||
            id.includes("scheduler")
          ) {
            return "react-vendor";
          }

          if (
            id.includes("@tanstack/react-query") ||
            id.includes("@supabase/supabase-js")
          ) {
            return "data-vendor";
          }

          if (id.includes("@radix-ui")) {
            return "ui-vendor";
          }

          if (
            id.includes("embla-carousel") ||
            id.includes("lucide-react")
          ) {
            return "media-vendor";
          }

          return undefined;
        },
      },
    },
  },
}));
