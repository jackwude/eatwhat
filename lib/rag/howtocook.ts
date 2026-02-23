import indexData from "@/data/howtocook-index.json";

type HowToCookDoc = {
  title: string;
  relativePath: string;
  content: string;
  ingredients: string[];
  operations: string[];
};

type HowToCookIndex = {
  sourceRoot: string;
  count: number;
  docs: HowToCookDoc[];
};

export type HowToCookReference = {
  title: string;
  path: string;
  score: number;
  excerpt: string;
};

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

function scoreDoc(doc: HowToCookDoc, queryTokens: Set<string>, dishName?: string): number {
  const titleNorm = normalizeText(doc.title);
  const ingredientNorm = normalizeText(doc.ingredients.join(" "));
  const contentNorm = normalizeText(doc.content.slice(0, 1200));

  let score = 0;

  if (dishName) {
    const dishNorm = normalizeText(dishName);
    if (dishNorm && titleNorm.includes(dishNorm)) score += 120;
  }

  for (const token of queryTokens) {
    if (!token || token.length <= 1) continue;
    if (titleNorm.includes(token)) score += 8;
    if (ingredientNorm.includes(token)) score += 5;
    if (contentNorm.includes(token)) score += 1;
  }

  return score;
}

function shortText(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength)}...`;
}

function buildExcerpt(doc: HowToCookDoc): string {
  const parts: string[] = [];
  if (doc.ingredients.length) {
    parts.push(`必备原料: ${doc.ingredients.slice(0, 6).join("、")}`);
  }
  if (doc.operations.length) {
    parts.push(`关键操作: ${doc.operations.slice(0, 3).join("；")}`);
  }
  if (!parts.length) {
    parts.push(shortText(doc.content, 140));
  }
  return shortText(parts.join("\n"), 180);
}

function getHowToCookDocs(): HowToCookDoc[] {
  const index = indexData as HowToCookIndex;
  const docs = Array.isArray(index.docs) ? index.docs : [];
  return docs;
}

function toReference(doc: HowToCookDoc, score: number): HowToCookReference {
  return {
    title: doc.title,
    path: doc.relativePath,
    score,
    excerpt: buildExcerpt(doc),
  };
}

export async function retrieveHowToCookReferences(args: {
  inputText?: string;
  ownedIngredients?: string[];
  dishName?: string;
  limit?: number;
}): Promise<HowToCookReference[]> {
  const docs = getHowToCookDocs();
  if (!docs.length) return [];

  const query = [args.dishName, args.inputText, ...(args.ownedIngredients || [])].filter(Boolean).join(" ");
  const tokens = new Set(tokenize(query));
  const minScore = args.dishName ? 1 : 3;
  const scored = docs
    .map((doc) => ({ doc, score: scoreDoc(doc, tokens, args.dishName) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, args.limit ?? 3)
    .map((item) => toReference(item.doc, item.score));

  return scored;
}

export async function getHowToCookReferenceByPath(pathHint: string): Promise<HowToCookReference | null> {
  const docs = getHowToCookDocs();
  const normalized = normalizeText(pathHint);
  if (!normalized) return null;

  const matched =
    docs.find((doc) => normalizeText(doc.relativePath) === normalized) ||
    docs.find((doc) => normalizeText(doc.relativePath).includes(normalized)) ||
    docs.find((doc) => normalized.includes(normalizeText(doc.relativePath)));

  if (!matched) return null;
  return toReference(matched, 999);
}

export function buildHowToCookContext(refs: HowToCookReference[]): string {
  if (!refs.length) {
    return "未命中 HowToCook 本地数据，保持原有规则生成。";
  }

  return refs
    .map((ref, idx) => `参考${idx + 1}: ${ref.title}\n来源: ${ref.path}\n${ref.excerpt}`)
    .join("\n\n");
}
