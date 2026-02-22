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

  // Strip common conversational prefixes/suffixes from user input.
  const stripped = cleaned
    .replace(/^(我(现在)?(有|买了|买的|准备了|冰箱里有|家里有))/, "")
    .replace(/^(还有|以及|并且)/, "")
    .replace(/(怎么吃|怎么做|能做什么|如何做|咋做|可以做啥|做什么)$/, "");

  return synonymMap[stripped] ?? stripped;
}

export function normalizeIngredientList(items: string[]): string[] {
  return items
    .flatMap((item) => item.split(/和|跟|及|还有|以及|并且/))
    .map(normalizeIngredientName)
    .filter(Boolean);
}
