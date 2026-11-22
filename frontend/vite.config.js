import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      "@vue/test-utils": fileURLToPath(
        new URL("./node_modules/@vue/test-utils/dist/vue-test-utils.esm-bundler.mjs", import.meta.url),
      ),
    },
  },
  base: "/static/vue/",
  build: {
    outDir: fileURLToPath(new URL("../static/vue", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    fs: {
      allow: [fileURLToPath(new URL("../", import.meta.url))],
    },
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/dokumenty": "http://127.0.0.1:8000",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["../tests/unit/**/*.js"],
  },
});
