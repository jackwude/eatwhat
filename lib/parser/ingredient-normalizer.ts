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
  /^(今晚|今早|今晨|明天|中午|下午|晚上)(吃啥|吃什么|做啥|做什么)?/,
  /(怎么吃|怎么做|能做什么|如何做|咋做|可以做啥|做什么)$/,
  /(推荐|帮我|看看|安排|来点)/,
  /^(验收|测试|test)/,
];

function isLikelyNoise(token: string): boolean {
  if (!token) return true;
  if (/^\d+$/.test(token)) return true;
  if (/(今晚|今天|明天|吃啥|吃什么|做啥|做什么|超市|买了|推荐)/.test(token)) return true;
  if (/[0-9]/.test(token) && /[\u4e00-\u9fa5]/.test(token) && !/(g|kg|ml|l|克|千克|毫升|升|斤|两|个|颗|片|块|包)$/.test(token)) {
    return true;
  }
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
    .replace(/(怎么吃|怎么做|能做什么|如何做|咋做|可以做啥|做什么|今晚吃啥|今天吃什么)$/, "")
    .replace(/^\d+(g|kg|ml|l|克|千克|毫升|升|斤|两|个|颗|片|块|包)?/, "")
    .replace(/(\d+(g|kg|ml|l|克|千克|毫升|升|斤|两|个|颗|片|块|包))$/, "");

  return synonymMap[stripped] ?? stripped;
}

export function normalizeIngredientList(items: string[]): string[] {
  return items
    .flatMap((item) => item.split(/和|跟|及|还有|以及|并且/))
    .map(normalizeIngredientName)
    .filter((item) => Boolean(item) && !isLikelyNoise(item));
}
