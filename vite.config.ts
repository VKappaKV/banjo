import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";

const isWebOnly = process.env.BANJO_WEB_ONLY === "true";

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  server: { port: 9000 },
  build: {
    rollupOptions: {
      input: isWebOnly
        ? { app: path.resolve("./index.html") }
        : {
            app: path.resolve("./index.html"),
            background: path.resolve("./src/ext/background/main.ts"),
            "content-script": path.resolve("./src/ext/content-script.ts"),
            "page-client": path.resolve("./src/ext/client.ts"),
          },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "app" ? "assets/[name]-[hash].js" : "assets/[name].js",
      },
    },
  },
  resolve: {
    conditions: process.env.VITEST ? ["browser"] : undefined,
    alias: {
      $core: path.resolve("./src/lib/core"),
      $lib: path.resolve("./src/lib"),
      $p2p: path.resolve("./src/lib/p2p"),
    },
  },
});
