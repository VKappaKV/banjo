import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  server: { port: 9000 },
  build: {
    rollupOptions: {
      input: {
        app: path.resolve("./index.html"),
        background: path.resolve("./src/ext/background/main.ts"),
        "content-script": path.resolve("./src/ext/content-script.ts"),
        "page-client": path.resolve("./src/ext/client.ts")
      },
      output: {
        entryFileNames: (chunk) => chunk.name === "app" ? "assets/[name]-[hash].js" : "assets/[name].js"
      }
    }
  },
  resolve: {
    conditions: process.env.VITEST ? ["browser"] : undefined,
    alias: {
      $core: path.resolve("./src/lib/core"),
      $lib: path.resolve("./src/lib")
    }
  }
});
