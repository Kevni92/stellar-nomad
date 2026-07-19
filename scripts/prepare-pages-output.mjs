import { promises as fs } from "node:fs";
import path from "node:path";

const outputDirectory = path.resolve("out");
const publicDirectory = path.resolve("public");
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const basePath = rawBasePath
  ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
  : "";

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml",
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else files.push(fullPath);
  }

  return files;
}

async function main() {
  await fs.access(outputDirectory);
  await fs.writeFile(path.join(outputDirectory, ".nojekyll"), "");

  if (!basePath) {
    console.log("GitHub Pages asset rewriting skipped: NEXT_PUBLIC_BASE_PATH is empty.");
    return;
  }

  const publicEntries = (await fs.readdir(publicDirectory, { withFileTypes: true }))
    .map((entry) => entry.name)
    .filter((name) => name !== ".DS_Store");

  const publicPathPattern = new RegExp(
    `(^|[\\"'\\x60(=:])\\/(${publicEntries.map(escapeRegExp).join("|")})(?=\\/|[?#\\"'\\x60)\\s]|$)`,
    "gm",
  );

  let changedFiles = 0;
  let changedUrls = 0;

  for (const file of await walk(outputDirectory)) {
    if (!textExtensions.has(path.extname(file))) continue;

    const original = await fs.readFile(file, "utf8");
    const rewritten = original.replace(publicPathPattern, (match, prefix, entry) => {
      changedUrls += 1;
      return `${prefix}${basePath}/${entry}`;
    });

    if (rewritten !== original) {
      await fs.writeFile(file, rewritten);
      changedFiles += 1;
    }
  }

  console.log(
    `Prepared static export for ${basePath}: rewrote ${changedUrls} public asset URL(s) in ${changedFiles} file(s).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
