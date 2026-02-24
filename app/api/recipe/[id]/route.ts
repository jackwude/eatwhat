import { NextResponse } from "next/server";
import { createHistoryEntry, findCachedRecommendationByHash, findCachedRecipeDetailByHash } from "@/lib/db/queries";
import { generateRecipeDetail } from "@/lib/ai/recipe";
import { fillRecipeStepsFromPreview } from "@/lib/ai/recipe-fill";
import { recipeRequestSchema } from "@/lib/schemas/recipe.schema";
import { normalizeIngredientList } from "@/lib/parser/ingredient-normalizer";
import { computeMissingIngredients } from "@/lib/parser/shopping-diff";
import { readRecipeCache, toRecipeCacheHash, writeRecipeCache } from "@/lib/cache/recipe-cache";
import { sha256 } from "@/lib/utils/hash";

export const runtime = "nodejs";

type RecommendationItem = {
  id?: unknown;
  name?: unknown;
  reason?: unknown;
  estimatedTimeMin?: unknown;
  requiredIngredients?: unknown;
  sourceType?: unknown;
  sourcePath?: unknown;
  sourceTitle?: unknown;
  recipePreview?: unknown;
};

function toRecommendRequestHash(inputText: string, ownedIngredients: string[]) {
  const normalizedInput = inputText.trim().toLowerCase();
  const normalizedOwned = [...ownedIngredients].map((i) => i.trim().toLowerCase()).sort();
  return sha256(`${normalizedInput}__${normalizedOwned.join("|")}`);
}

function isIngredientArray(value: unknown): value is Array<{ name: string; amount: string }> {
  if (!Array.isArray(value)) return false;
  return value.every((item) => item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string");
}

function toPreviewRecipe(
  item: RecommendationItem,
  dishName: string,
  ownedIngredients: string[],
  referenceSources: Array<{ title: string; path: string; score: number; excerpt: string }>,
) {
  const requiredIngredients = isIngredientArray(item.requiredIngredients)
    ? (item.requiredIngredients as Array<{ name: string; amount: string }>)
    : [];
  const recipePreview =
    item.recipePreview && typeof item.recipePreview === "object"
      ? (item.recipePreview as {
          servings?: unknown;
          requiredIngredients?: unknown;
          steps?: unknown;
          tips?: unknown;
          timing?: unknown;
          sourceType?: unknown;
        })
      : null;

  const previewRequired = isIngredientArray(recipePreview?.requiredIngredients) ? recipePreview?.requiredIngredients : requiredIngredients;
  const steps = Array.isArray(recipePreview?.steps)
    ? recipePreview.steps
        .filter((step) => step && typeof step === "object")
        .map((step, idx) => ({
          stepNo: typeof (step as { stepNo?: unknown }).stepNo === "number" ? ((step as { stepNo: number }).stepNo || idx + 1) : idx + 1,
          instruction: String((step as { instruction?: unknown }).instruction || "").trim(),
          keyPoint:
            typeof (step as { keyPoint?: unknown }).keyPoint === "string" && (step as { keyPoint: string }).keyPoint.trim()
              ? (step as { keyPoint: string }).keyPoint.trim()
              : undefined,
          sourceTag: (recipePreview?.sourceType === "howtocook" ? "howtocook" : "llm") as "howtocook" | "llm",
        }))
        .filter((step) => step.instruction)
    : [];

  const tips = Array.isArray(recipePreview?.tips) ? recipePreview.tips.map((tip) => String(tip)).filter(Boolean) : [];
  const estimated = typeof item.estimatedTimeMin === "number" && item.estimatedTimeMin > 0 ? item.estimatedTimeMin : 20;
  const timing = recipePreview?.timing && typeof recipePreview.timing === "object"
    ? {
        prepMin: Number((recipePreview.timing as { prepMin?: unknown }).prepMin) || Math.max(3, Math.floor(estimated * 0.4)),
        cookMin: Number((recipePreview.timing as { cookMin?: unknown }).cookMin) || Math.max(5, Math.ceil(estimated * 0.6)),
        totalMin: Number((recipePreview.timing as { totalMin?: unknown }).totalMin) || estimated,
      }
    : {
        prepMin: Math.max(3, Math.floor(estimated * 0.4)),
        cookMin: Math.max(5, Math.ceil(estimated * 0.6)),
        totalMin: estimated,
      };

  const fallbackTip = typeof item.reason === "string" && item.reason.trim() ? item.reason.trim() : "已展示推荐概要，可重试获取完整工序。";
  const normalizedRequired = previewRequired.length ? previewRequired : [{ name: dishName, amount: "适量" }];
  const detailMode = steps.length ? "full" : "preview_only";

  return {
    dishName,
    servings: typeof recipePreview?.servings === "string" && recipePreview.servings.trim() ? recipePreview.servings : "2人份",
    requiredIngredients: normalizedRequired,
    missingIngredients: computeMissingIngredients(normalizedRequired, ownedIngredients),
    steps,
    tips: tips.length ? tips : [fallbackTip],
    sourceType: (item.sourceType === "howtocook" ? "howtocook" : "llm") as "howtocook" | "llm",
    detailMode,
    referenceSources,
    timing,
    webReferences: [],
    fallbackUsed: false,
  };
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await req.json();
    const parsed = recipeRequestSchema.parse(body);
    const params = await context.params;
    const ownedIngredients = normalizeIngredientList(parsed.ownedIngredients);
    const requestHash = toRecipeCacheHash(parsed.dishName, ownedIngredients, parsed.sourceHintPath, parsed.sourceHintType);
    const bypassCache = Boolean(parsed.forceFullDetail);

    if (!bypassCache) {
      const memoryCached = readRecipeCache<unknown>(requestHash);
      if (memoryCached) {
        return NextResponse.json({ ...(memoryCached as Record<string, unknown>), cacheSource: "memory" });
      }
    }

    if (!bypassCache) {
      const dbCached = await findCachedRecipeDetailByHash(requestHash);
      if (dbCached && typeof dbCached === "object") {
        writeRecipeCache(requestHash, dbCached);
        return NextResponse.json({ ...(dbCached as Record<string, unknown>), cacheSource: "database" });
      }
    }

    if (parsed.inputText && params.id) {
      const recommendHash = toRecommendRequestHash(parsed.inputText, ownedIngredients);
      const recommendCached = await findCachedRecommendationByHash(recommendHash);
      const recommendList = Array.isArray(recommendCached?.recommendations) ? (recommendCached.recommendations as RecommendationItem[]) : [];
      const matched =
        recommendList.find((item) => String(item.id || "") === params.id) ||
        recommendList.find((item) => typeof item.name === "string" && item.name === parsed.dishName);

      if (matched) {
        const referenceSources =
          matched.sourceType === "howtocook" && typeof matched.sourcePath === "string" && typeof matched.sourceTitle === "string"
            ? [{ title: matched.sourceTitle, path: matched.sourcePath, score: 100, excerpt: "" }]
            : [];
        const snapshotRecipe = toPreviewRecipe(matched, parsed.dishName, ownedIngredients, referenceSources);

        const shouldAutoFill =
          parsed.sourceHintType === "llm" &&
          (snapshotRecipe.detailMode === "preview_only" || !snapshotRecipe.steps.length);

        if (shouldAutoFill) {
          try {
            const filled = await fillRecipeStepsFromPreview({
              dishName: parsed.dishName,
              requiredIngredients: snapshotRecipe.requiredIngredients,
              ownedIngredients,
              reason: typeof matched.reason === "string" ? matched.reason : undefined,
              estimatedTimeMin: typeof matched.estimatedTimeMin === "number" ? matched.estimatedTimeMin : undefined,
            });

            const filledRecipe = {
              ...snapshotRecipe,
              steps: filled.steps,
              tips: filled.tips.length ? filled.tips : snapshotRecipe.tips,
              timing: filled.timing,
              sourceType: "llm" as const,
              detailMode: "full" as const,
              fillStatus: "filled" as const,
            };

            writeRecipeCache(requestHash, filledRecipe);
            await createHistoryEntry({
              kind: "recipe",
              requestHash,
              inputText: `查看菜谱: ${parsed.dishName}`,
              ownedIngredients,
              dishName: parsed.dishName,
              recipeDetail: filledRecipe,
            });
            return NextResponse.json({ ...filledRecipe, cacheSource: "llm_fill" });
          } catch {
            const failedRecipe = {
              ...snapshotRecipe,
              detailMode: "preview_only" as const,
              fillStatus: "failed" as const,
              retryable: true,
            };
            if (!bypassCache) {
              writeRecipeCache(requestHash, failedRecipe);
            }
            return NextResponse.json({ ...failedRecipe, cacheSource: "recommend_snapshot" });
          }
        }

        const result = {
          ...snapshotRecipe,
          fillStatus: snapshotRecipe.detailMode === "preview_only" ? ("skipped" as const) : undefined,
        };
        writeRecipeCache(requestHash, result);
        return NextResponse.json({ ...result, cacheSource: "recommend_snapshot" });
      }
    }

    if (parsed.sourceHintType === "llm" && !parsed.forceFullDetail) {
      return NextResponse.json(
        {
          error: "当前未找到该推荐菜品的完整详情，请返回推荐页重试生成。",
          detailMode: "preview_only",
          fillStatus: "failed",
          retryable: true,
        },
        { status: 404 },
      );
    }

    const recipe = await generateRecipeDetail(parsed.dishName, ownedIngredients, {
      sourceHintPath: parsed.sourceHintPath,
      sourceHintType: parsed.sourceHintType,
    });

    if (parsed.sourceHintType === "llm" && recipe.sourceType === "fallback") {
      return NextResponse.json(
        {
          error: "完整详情生成失败，已避免返回通用降级菜谱。",
          detailMode: "preview_only",
          fillStatus: "failed",
          retryable: true,
        },
        { status: 502 },
      );
    }

    writeRecipeCache(requestHash, recipe);

    await createHistoryEntry({
      kind: "recipe",
      requestHash,
      inputText: `查看菜谱: ${parsed.dishName}`,
      ownedIngredients,
      dishName: parsed.dishName,
      recipeDetail: recipe,
    });

    return NextResponse.json({ ...recipe, cacheSource: "llm" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
