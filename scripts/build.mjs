import { mkdir, copyFile } from "node:fs/promises";
import { build } from "vite";
await build({
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});

await mkdir("dist/licenses", { recursive: true });
await Promise.all(
  [
    ["node_modules/three/LICENSE", "three.txt"],
    ["node_modules/@fontsource/barlow/LICENSE", "barlow.txt"],
    [
      "node_modules/@fontsource/barlow-condensed/LICENSE",
      "barlow-condensed.txt",
    ],
  ].map(([source, name]) => copyFile(source, "dist/licenses/" + name)),
);
