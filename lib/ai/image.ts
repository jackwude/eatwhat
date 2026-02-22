import OpenAI from "openai";
import { getEnv } from "@/lib/utils/env";

let imageClient: OpenAI | null = null;

function getImageClient() {
  if (imageClient) return imageClient;

  const env = getEnv();
  imageClient = new OpenAI({
    apiKey: env.IMAGE_API_KEY || env.OPENAI_API_KEY,
    baseURL: env.IMAGE_BASE_URL || env.OPENAI_BASE_URL,
  });

  return imageClient;
}

export async function generateDishImage(dishName: string, style: string): Promise<string> {
  const env = getEnv();
  const prompt = `${dishName}，${style}，中式摆盘，高清、自然光、细节清晰、食欲感强`;

  const payload: Record<string, unknown> = {
    model: env.OPENAI_IMAGE_MODEL,
    prompt,
    sequential_image_generation: "disabled",
    response_format: "url",
    size: env.OPENAI_IMAGE_SIZE,
    stream: false,
    watermark: true,
  };

  const result = await getImageClient().images.generate(payload as never);

  const url = result.data?.[0]?.url;
  if (!url) {
    throw new Error("Image generation failed: empty image URL");
  }

  return url;
}
