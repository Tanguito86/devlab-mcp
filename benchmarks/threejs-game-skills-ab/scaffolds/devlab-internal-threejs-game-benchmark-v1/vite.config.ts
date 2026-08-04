import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "public",
  server: {
    host: "127.0.0.1",
  },
  preview: {
    host: "127.0.0.1",
  },
  build: {
    target: "esnext",
    outDir: "dist",
    emptyOutDir: true,
  },
});
