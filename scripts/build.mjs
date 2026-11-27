import { mkdir, copyFile } from "node:fs/promises";
import { build } from "vite";

const arcade = process.argv.includes("--arcade");
const outDir = arcade ? "web-export" : "dist";
await build({
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    outDir,
    ...(arcade && {
      // Arcade rebundles JS at the release root. Keep import.meta.url relative to it.
      modulePreload: false,
      rollupOptions: {
        output: { entryFileNames: "[name].js", chunkFileNames: "[name].js" },
      },
    }),
  },
});

await mkdir(outDir + "/licenses", { recursive: true });
await Promise.all(
  [
    ["node_modules/three/LICENSE", "three.txt"],
    ["node_modules/@fontsource/barlow/LICENSE", "barlow.txt"],
    [
      "node_modules/@fontsource/barlow-condensed/LICENSE",
      "barlow-condensed.txt",
    ],
  ].map(([source, name]) => copyFile(source, outDir + "/licenses/" + name)),
);

if (arcade) {
  await copyFile("audio/CREDITS.md", outDir + "/licenses/audio-credits.txt");
  await mkdir("arcade-art", { recursive: true });
  await copyFile("assets/garage-hero.webp", "arcade-art/cover.webp");
}
