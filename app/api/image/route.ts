import { NextResponse } from "next/server";
import { generateDishImage } from "@/lib/ai/image";
import { imageRequestSchema } from "@/lib/schemas/image.schema";
import { getEnv } from "@/lib/utils/env";
import { checkImageRateLimit, readImageCache, toImageCacheHash, writeImageCache } from "@/lib/cache/image-cache";
import { createHistoryEntry, findCachedImageByHash } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = imageRequestSchema.parse(body);
    const env = getEnv();
    const requestHash = toImageCacheHash(parsed.dishName, parsed.style, env.OPENAI_IMAGE_MODEL, env.OPENAI_IMAGE_SIZE);
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown";
    const limit = checkImageRateLimit(ip, parsed.dishName);
    if (!limit.allowed) {
      return NextResponse.json({ error: `请求过于频繁，请 ${limit.retryAfterSec}s 后再试` }, { status: 429 });
    }

    const memoryCached = readImageCache(requestHash);
    if (memoryCached) {
      return NextResponse.json({ imageUrl: memoryCached.imageUrl, cacheSource: "memory" });
    }

    const dbCached = await findCachedImageByHash(requestHash);
    if (dbCached) {
      writeImageCache(requestHash, { imageUrl: dbCached });
      return NextResponse.json({ imageUrl: dbCached, cacheSource: "database" });
    }

    const imageUrl = await generateDishImage(parsed.dishName, parsed.style);
    writeImageCache(requestHash, { imageUrl });
    await createHistoryEntry({
      kind: "image",
      requestHash,
      inputText: `图片生成: ${parsed.dishName}`,
      dishName: parsed.dishName,
      ownedIngredients: [],
      recipeDetail: {
        imageUrl,
        dishName: parsed.dishName,
        style: parsed.style,
      },
    });
    return NextResponse.json({ imageUrl, cacheSource: "generated" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
