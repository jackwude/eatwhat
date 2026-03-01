import test from "node:test";
import assert from "node:assert/strict";
import { __recommendTestUtils } from "@/lib/ai/recommend";

type Difficulty = "easy" | "medium" | "hard";
type FinalizeInput = Parameters<typeof __recommendTestUtils.finalizeRecommendations>[0];

function makeRanked(difficulty: Difficulty, idx: number, overrides?: { name?: string; estimatedTimeMin?: number }) {
  return {
    candidate: {
      name: overrides?.name || `${difficulty}-dish-${idx}`,
      reason: "可执行",
      requiredIngredients: [{ name: "食材", amount: "适量" }],
      steps: [
        { stepNo: 1, instruction: "步骤1" },
        { stepNo: 2, instruction: "步骤2" },
        { stepNo: 3, instruction: "步骤3" },
        { stepNo: 4, instruction: "步骤4" },
      ],
      estimatedTimeMin: overrides?.estimatedTimeMin ?? 20,
      difficulty,
    },
    cookability: {
      missingCount: 0,
      ownedCoverage: 1,
      hitCount: 2,
      requiredCount: 2,
      sparsePenalty: 0,
    },
    nameConfidence: 0.8,
  };
}

// NOTE: 每个难度取 Top 1，所以 3 个难度各有多个候选时结果应为 3 道菜
test("finalizeRecommendations returns 3 items (top 1 per difficulty) when buckets are full", () => {
  const matched = [
    makeRanked("easy", 1),
    makeRanked("easy", 2),
    makeRanked("easy", 3),
    makeRanked("medium", 1),
    makeRanked("medium", 2),
    makeRanked("medium", 3),
    makeRanked("hard", 1),
    makeRanked("hard", 2),
    makeRanked("hard", 3),
  ];

  const results = __recommendTestUtils.finalizeRecommendations(matched as FinalizeInput);
  assert.equal(results.length, 3);
  assert.equal(results.filter((item) => item.difficulty === "easy").length, 1);
  assert.equal(results.filter((item) => item.difficulty === "medium").length, 1);
  assert.equal(results.filter((item) => item.difficulty === "hard").length, 1);

  assert.deepEqual(
    results.map((item) => item.id),
    ["dish_easy_1", "dish_medium_1", "dish_hard_1"],
  );
});

test("finalizeRecommendations handles missing difficulty bucket gracefully", () => {
  const matched = [
    makeRanked("easy", 1),
    makeRanked("easy", 2),
    makeRanked("medium", 1),
  ];

  const results = __recommendTestUtils.finalizeRecommendations(matched as FinalizeInput);
  assert.equal(results.length, 2);
  assert.equal(results.filter((item) => item.difficulty === "easy").length, 1);
  assert.equal(results.filter((item) => item.difficulty === "medium").length, 1);
  assert.equal(results.filter((item) => item.difficulty === "hard").length, 0);
});

// NOTE: 多个候选时排序算法应选出最优的那个（按 cookability 打分）
test("finalizeRecommendations selects best candidate per difficulty by cookability", () => {
  const matched = [
    {
      ...makeRanked("easy", 1, { name: "番茄炒蛋" }),
      cookability: { missingCount: 2, ownedCoverage: 0.5, hitCount: 1, requiredCount: 2, sparsePenalty: 0 },
    },
    {
      ...makeRanked("easy", 2, { name: "白菜炒蛋" }),
      cookability: { missingCount: 0, ownedCoverage: 1, hitCount: 2, requiredCount: 2, sparsePenalty: 0 },
    },
    makeRanked("medium", 1),
    makeRanked("hard", 1),
  ];

  const results = __recommendTestUtils.finalizeRecommendations(matched as FinalizeInput);
  assert.equal(results.length, 3);
  // NOTE: 白菜炒蛋 missingCount=0 优于番茄炒蛋 missingCount=2
  const easyDish = results.find((item) => item.difficulty === "easy");
  assert.equal(easyDish?.name, "白菜炒蛋");
});

test("finalizeRecommendations keeps deterministic ordering for tie scores", () => {
  const matched = [
    makeRanked("easy", 1, { name: "番茄炒蛋", estimatedTimeMin: 30 }),
    makeRanked("easy", 2, { name: "白菜炒蛋", estimatedTimeMin: 30 }),
    makeRanked("easy", 3, { name: "青椒炒蛋", estimatedTimeMin: 30 }),
    makeRanked("medium", 1),
    makeRanked("hard", 1),
  ];

  const results = __recommendTestUtils.finalizeRecommendations(matched as FinalizeInput);
  assert.equal(results.length, 3);
  const easyDish = results.find((item) => item.difficulty === "easy");
  // NOTE: 同分时按菜名排序，白菜 < 番茄 < 青椒
  assert.equal(easyDish?.name, "白菜炒蛋");
});
