import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  server: { port: 9000 },
  resolve: {
    alias: {
      $core: path.resolve("./src/lib/core"),
      $lib: path.resolve("./src/lib")
    }
  }
});
