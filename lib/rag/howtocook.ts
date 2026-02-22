import { promises as fs } from "fs";
import path from "path";

const HOW_TO_COOK_ROOT = path.join(process.cwd(), "data", "HowToCook");
const DISHES_ROOT = path.join(HOW_TO_COOK_ROOT, "dishes");

type HowToCookDoc = {
  title: string;
  relativePath: string;
  content: string;
  ingredients: string[];
  operations: string[];
};

export type HowToCookReference = {
  title: string;
  path: string;
  score: number;
  excerpt: string;
};

let docsCache: Promise<HowToCookDoc[]> | null = null;

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s\t\r\n]+/g, "")
    .replace(/[，,。；;：:()（）【】\[\]"'“”‘’]/g, "");
}

function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(/[^\p{Script=Han}a-z0-9]+/u)
    .flatMap((token) => {
      if (!token) return [] as string[];
      if (token.length <= 2) return [token];
      const grams: string[] = [token];
      for (let i = 0; i < token.length - 1; i += 1) {
        grams.push(token.slice(i, i + 2));
      }
      return grams;
    })
    .filter(Boolean);
}

function firstLineTitle(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (!match) return fallback;
  return match[1].replace(/的做法$/, "").trim();
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_`~]/g, "")
    .trim();
}

function extractSection(md: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`##\\s+${escaped}\\n([\\s\\S]*?)(?:\\n##\\s+|$)`, "m");
  const match = md.match(re);
  return match ? match[1].trim() : "";
}

function extractIngredients(md: string): string[] {
  const sec = extractSection(md, "必备原料和工具");
  return sec
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("*"))
    .map((line) => line.replace(/^\*\s*/, "").split(/[（(]/)[0].trim())
    .filter(Boolean)
    .slice(0, 12);
}

function extractOperations(md: string): string[] {
  const sec = extractSection(md, "操作");
  return sec
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("*"))
    .map((line) => line.replace(/^\*\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) return listMarkdownFiles(full);
      if (entry.isFile() && entry.name.endsWith(".md")) return [full];
      return [] as string[];
    }),
  );
  return files.flat();
}

async function loadHowToCookDocsInternal(): Promise<HowToCookDoc[]> {
  try {
    await fs.access(DISHES_ROOT);
  } catch {
    return [];
  }

  const files = await listMarkdownFiles(DISHES_ROOT);
  const docs = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(file, "utf8");
      const fallback = path.basename(file, ".md");
      const title = firstLineTitle(raw, fallback);
      const content = stripMarkdown(raw);
      const relativePath = path.relative(HOW_TO_COOK_ROOT, file);

      return {
        title,
        relativePath,
        content,
        ingredients: extractIngredients(raw),
        operations: extractOperations(raw),
      } satisfies HowToCookDoc;
    }),
  );

  return docs;
}

async function getHowToCookDocs(): Promise<HowToCookDoc[]> {
  if (!docsCache) {
    docsCache = loadHowToCookDocsInternal();
  }
  return docsCache;
}

function scoreDoc(doc: HowToCookDoc, queryTokens: Set<string>, dishName?: string): number {
  const titleNorm = normalizeText(doc.title);
  const ingredientNorm = normalizeText(doc.ingredients.join(" "));
  const contentNorm = normalizeText(doc.content.slice(0, 2000));

  let score = 0;

  if (dishName) {
    const dishNorm = normalizeText(dishName);
    if (dishNorm && titleNorm.includes(dishNorm)) score += 120;
  }

  for (const token of queryTokens) {
    if (!token) continue;
    if (token.length <= 1) continue;
    if (titleNorm.includes(token)) score += 8;
    if (ingredientNorm.includes(token)) score += 5;
    if (contentNorm.includes(token)) score += 1;
  }

  return score;
}

function buildExcerpt(doc: HowToCookDoc): string {
  const parts: string[] = [];
  if (doc.ingredients.length) {
    parts.push(`必备原料: ${doc.ingredients.slice(0, 8).join("、")}`);
  }
  if (doc.operations.length) {
    parts.push(`关键操作: ${doc.operations.slice(0, 4).join("；")}`);
  }
  if (!parts.length) {
    parts.push(doc.content.slice(0, 180));
  }
  return parts.join("\n");
}

export async function retrieveHowToCookReferences(args: {
  inputText?: string;
  ownedIngredients?: string[];
  dishName?: string;
  limit?: number;
}): Promise<HowToCookReference[]> {
  const docs = await getHowToCookDocs();
  if (!docs.length) return [];

  const query = [args.dishName, args.inputText, ...(args.ownedIngredients || [])].filter(Boolean).join(" ");
  const tokens = new Set(tokenize(query));
  const scored = docs
    .map((doc) => ({ doc, score: scoreDoc(doc, tokens, args.dishName) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, args.limit ?? 5)
    .map((item) => ({
      title: item.doc.title,
      path: item.doc.relativePath,
      score: item.score,
      excerpt: buildExcerpt(item.doc),
    }));

  return scored;
}

export function buildHowToCookContext(refs: HowToCookReference[]): string {
  if (!refs.length) {
    return "未命中 HowToCook 本地数据，保持原有规则生成。";
  }

  return refs
    .map((ref, idx) => {
      return `参考${idx + 1}: ${ref.title}\n来源: ${ref.path}\n${ref.excerpt}`;
    })
    .join("\n\n");
}
