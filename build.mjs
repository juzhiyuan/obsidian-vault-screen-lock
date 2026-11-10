import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const license = (await readFile("LICENSE", "utf8")).trimEnd();

await build({
  banner: { js: `/*!\n${license}\n*/` },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2018",
  minify: true,
  outfile: "main.js",
});
