const synonymMap: Record<string, string> = {
  番茄: "西红柿",
  tomato: "西红柿",
  鸡子: "鸡蛋",
  egg: "鸡蛋",
  葱花: "小葱",
  蒜瓣: "大蒜",
};

const conversationalNoisePatterns: RegExp[] = [
  /^我.{0,8}(在超市)?(刚)?(买了|买的|买到|准备了)/,
  /^我(现在)?(有|家里有|冰箱里有)/,
  /^(今天|刚才|刚刚|现在|目前|手头)/,
  /(怎么吃|怎么做|能做什么|如何做|咋做|可以做啥|做什么)$/,
  /^(验收|测试|test)/,
];

function isLikelyNoise(token: string): boolean {
  if (!token) return true;
  if (/^\d+$/.test(token)) return true;
  if (/[a-z]{4,}\d*/.test(token)) return true;
  if (token.length >= 7 && /我|买|超市|准备|验收|测试/.test(token)) return true;
  return conversationalNoisePatterns.some((pattern) => pattern.test(token));
}

export function normalizeIngredientName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[\s，,。；;：:()（）]/g, "");

  // Strip common conversational prefixes/suffixes from user input.
  const stripped = cleaned
    .replace(/^(我(现在)?(有|买了|买的|准备了|冰箱里有|家里有))/, "")
    .replace(/^(我刚在超市买了|我在超市买了|刚在超市买了|在超市买了)/, "")
    .replace(/^(还有|以及|并且)/, "")
    .replace(/(怎么吃|怎么做|能做什么|如何做|咋做|可以做啥|做什么)$/, "");

  return synonymMap[stripped] ?? stripped;
}

export function normalizeIngredientList(items: string[]): string[] {
  return items
    .flatMap((item) => item.split(/和|跟|及|还有|以及|并且/))
    .map(normalizeIngredientName)
    .filter((item) => Boolean(item) && !isLikelyNoise(item));
}
