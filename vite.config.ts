import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { sitePages, siteSeo } from "./scripts/site-seo.ts";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ["SITE_URL", "GOOGLE_SITE_VERIFICATION"]);
  return {
    plugins: [react(), tailwindcss(), siteSeo(env.SITE_URL, env.GOOGLE_SITE_VERIFICATION)],
    test: { environment: "node", include: ["src/**/*.test.ts"] },
    build: {
      chunkSizeWarningLimit: 650,
      rolldownOptions: {
        input: sitePages.map((page) => fileURLToPath(new URL(page, import.meta.url))),
        output: {
          codeSplitting: {
            groups: [
              { name: "three", test: /node_modules[\\/]three[\\/]/ },
              { name: "gsap", test: /node_modules[\\/]gsap[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
