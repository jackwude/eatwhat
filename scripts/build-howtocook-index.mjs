import { promises as fs } from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const howToCookRoot = path.join(repoRoot, 'data', 'HowToCook');
const dishesRoot = path.join(howToCookRoot, 'dishes');
const outputFile = path.join(repoRoot, 'data', 'howtocook-index.json');

function firstLineTitle(markdown, fallback) {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (!match) return fallback;
  return match[1].replace(/的做法$/, '').trim();
}

function stripMarkdown(md) {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_`~]/g, '')
    .trim();
}

function extractSection(md, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*#{1,6}\\s*${escaped}\\s*$\\n?([\\s\\S]*?)(?=^\\s*#{1,6}\\s+|$)`, 'm');
  const match = md.match(re);
  return match ? match[1].trim() : '';
}

function extractIngredients(md) {
  const sec = extractSection(md, '必备原料和工具');
  return sec
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').split(/[（(]/)[0].trim())
    .filter(Boolean)
    .slice(0, 10);
}

function extractOperations(md) {
  const sec = extractSection(md, '操作');
  return sec
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

async function listMarkdownFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) return listMarkdownFiles(full);
      if (entry.isFile() && entry.name.endsWith('.md')) return [full];
      return [];
    }),
  );
  return files.flat();
}

async function main() {
  await fs.access(dishesRoot);
  const files = await listMarkdownFiles(dishesRoot);

  const docs = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(file, 'utf8');
      const fallback = path.basename(file, '.md');
      const title = firstLineTitle(raw, fallback);
      const content = stripMarkdown(raw);
      const relativePath = path.relative(howToCookRoot, file);

      return {
        title,
        relativePath,
        content,
        ingredients: extractIngredients(raw),
        operations: extractOperations(raw),
      };
    }),
  );

  docs.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-CN'));

  const payload = {
    sourceRoot: 'data/HowToCook',
    count: docs.length,
    docs,
  };

  await fs.writeFile(outputFile, JSON.stringify(payload), 'utf8');
  console.log(`[howtocook-index] wrote ${docs.length} docs -> ${path.relative(repoRoot, outputFile)}`);
}

main().catch((error) => {
  console.error('[howtocook-index] failed', error);
  process.exit(1);
});
