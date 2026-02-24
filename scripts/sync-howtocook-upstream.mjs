import { createHash } from "crypto";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import path from "path";
import { spawn } from "child_process";

const repoRoot = process.cwd();
const dataRoot = path.join(repoRoot, "data");
const howToCookRoot = path.join(dataRoot, "HowToCook");
const dishesRoot = path.join(howToCookRoot, "dishes");
const lockFile = path.join(dataRoot, "howtocook-upstream.lock.json");

const upstreamRepo = process.env.HOWTOCOOK_UPSTREAM_REPO || "https://github.com/Anduin2017/HowToCook.git";
const upstreamRef = process.env.HOWTOCOOK_UPSTREAM_REF || "master";

function run(cmd, args, cwd = repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (buf) => {
      stdout += String(buf);
      process.stdout.write(buf);
    });
    child.stderr.on("data", (buf) => {
      stderr += String(buf);
      process.stderr.write(buf);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`${cmd} ${args.join(" ")} failed (${code})\n${stderr}`));
    });
  });
}

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
  await fs.mkdir(dataRoot, { recursive: true });
  const checkoutRoot = await fs.mkdtemp(path.join(tmpdir(), "howtocook-upstream-"));

  await run("git", ["clone", "--depth", "1", "--branch", upstreamRef, upstreamRepo, checkoutRoot]);
  const commit = await run("git", ["rev-parse", "HEAD"], checkoutRoot);

  await fs.rm(howToCookRoot, { recursive: true, force: true });
  await fs.cp(checkoutRoot, howToCookRoot, { recursive: true });

  await run("node", ["scripts/build-howtocook-index.mjs"], repoRoot);

  const files = await listMarkdownFiles(dishesRoot);
  files.sort((a, b) => a.localeCompare(b, "en"));
  const treeHash = await computeTreeHash(files);

  const lockPayload = {
    upstreamRepo,
    upstreamRef,
    sourceCommit: commit.trim(),
    fileCount: files.length,
    treeHash,
    generatedAt: new Date().toISOString(),
  };

  await fs.writeFile(lockFile, `${JSON.stringify(lockPayload, null, 2)}\n`, "utf8");
  console.log(`[howtocook:sync] synced ${files.length} files @ ${lockPayload.sourceCommit}`);
  console.log(`[howtocook:sync] lock file -> ${path.relative(repoRoot, lockFile)}`);
}

main().catch((error) => {
  console.error("[howtocook:sync] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
