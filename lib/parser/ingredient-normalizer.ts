const synonymMap: Record<string, string> = {
  番茄: "西红柿",
  tomato: "西红柿",
  鸡子: "鸡蛋",
  egg: "鸡蛋",
  葱花: "小葱",
  蒜瓣: "大蒜",
};

export function normalizeIngredientName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[\s，,。；;：:()（）]/g, "");

  return synonymMap[cleaned] ?? cleaned;
}

export function normalizeIngredientList(items: string[]): string[] {
  return items.map(normalizeIngredientName).filter(Boolean);
}
