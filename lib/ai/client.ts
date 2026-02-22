import OpenAI from "openai";
import { getEnv } from "@/lib/utils/env";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;

  const env = getEnv();
  client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
  });

  return client;
}

function extractJsonString(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("LLM did not return JSON object text");
  }
  return raw.slice(start, end + 1);
}

async function callByResponsesAPI(system: string, user: string): Promise<string> {
  const env = getEnv();

  const response = await getClient().responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: system }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: user }],
      },
    ],
    temperature: 0.4,
  });

  const outputText = (response as unknown as { output_text?: string }).output_text;
  if (outputText && outputText.trim()) {
    return outputText;
  }

  const serialized = JSON.stringify(response);
  return serialized;
}

async function callByChatAPI(system: string, user: string): Promise<string> {
  const env = getEnv();

  const completion = await getClient().chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0.4,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned empty content");
  }

  return content;
}

export async function callJsonModel<T>(args: {
  system: string;
  user: string;
  responseTemplate: string;
  retries?: number;
}): Promise<T> {
  const env = getEnv();
  const retries = args.retries ?? 1;
  const systemPrompt = `${args.system}\n\n必须输出严格 JSON 对象，不要 markdown。\nJSON模板：\n${args.responseTemplate}`;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const raw =
        env.OPENAI_API_STYLE === "responses"
          ? await callByResponsesAPI(systemPrompt, args.user)
          : await callByChatAPI(systemPrompt, args.user);

      const jsonText = extractJsonString(raw);
      return JSON.parse(jsonText) as T;
    } catch (error) {
      if (attempt === retries) {
        throw new Error(`LLM JSON parse failed: ${(error as Error).message}`);
      }
    }
  }

  throw new Error("Unexpected retry loop failure");
}

export function getOpenAIClient() {
  return getClient();
}
