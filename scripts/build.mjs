import { build } from "vite";
await build({
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});
