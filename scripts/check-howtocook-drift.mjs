import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

const repoRoot = process.cwd();
const howToCookRoot = path.join(repoRoot, "data", "HowToCook");
const dishesRoot = path.join(howToCookRoot, "dishes");
const lockFile = path.join(repoRoot, "data", "howtocook-upstream.lock.json");

async function listMarkdownFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) return listMarkdownFiles(full);
      if (entry.isFile() && entry.name.endsWith(".md")) return [full];
      return [];
    }),
  );
  return nested.flat();
}

async function computeTreeHash(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    const rel = path.relative(dishesRoot, file).replace(/\\/g, "/");
    const content = await fs.readFile(file);
    hash.update(rel);
    hash.update("\n");
    hash.update(content);
    hash.update("\n");
  }
  return hash.digest("hex");
}

async function main() {
  const lockRaw = await fs.readFile(lockFile, "utf8");
  const lock = JSON.parse(lockRaw);

  const files = await listMarkdownFiles(dishesRoot);
  files.sort((a, b) => a.localeCompare(b, "en"));
  const treeHash = await computeTreeHash(files);

  if (!lock.treeHash || lock.treeHash !== treeHash) {
    throw new Error(
      [
        "HowToCook data drift detected.",
        `expected treeHash: ${lock.treeHash || "<missing>"}`,
        `actual treeHash:   ${treeHash}`,
        "Run: npm run howtocook:sync",
      ].join("\n"),
    );
  }

  if (typeof lock.fileCount === "number" && lock.fileCount !== files.length) {
    throw new Error(
      [
        "HowToCook file count drift detected.",
        `expected fileCount: ${lock.fileCount}`,
        `actual fileCount:   ${files.length}`,
        "Run: npm run howtocook:sync",
      ].join("\n"),
    );
  }

  console.log(
    `[howtocook:check] OK repo=${lock.upstreamRepo || "unknown"} ref=${lock.upstreamRef || "unknown"} files=${files.length}`,
  );
}

main().catch((error) => {
  console.error("[howtocook:check] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
