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

function collectTextRecursively(value: unknown, bucket: string[]) {
  if (typeof value === "string") {
    const text = value.trim();
    if (text) bucket.push(text);
    return;
  }

  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectTextRecursively(item, bucket));
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (key === "output_text" || key === "text" || key === "content") {
      collectTextRecursively(item, bucket);
      continue;
    }
    if (typeof item === "object") {
      collectTextRecursively(item, bucket);
    }
  }
}

function extractBalancedJsonObjects(input: string): string[] {
  const result: string[] = [];

  for (let i = 0; i < input.length; i += 1) {
    if (input[i] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = i; j < input.length; j += 1) {
      const ch = input[j];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          result.push(input.slice(i, j + 1));
          i = j;
          break;
        }
      }
    }
  }

  return result;
}

function getExpectedTopLevelKeys(template: string): string[] {
  try {
    const obj = JSON.parse(template);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
    return Object.keys(obj);
  } catch {
    return [];
  }
}

function tryParsePayloadToJsonObject(payload: unknown, expectedKeys: string[]): unknown {
  const textCandidates: string[] = [];

  if (typeof payload === "string") {
    textCandidates.push(payload);
  } else if (payload && typeof payload === "object") {
    textCandidates.push(JSON.stringify(payload));
    collectTextRecursively(payload, textCandidates);
  }

  const snippets = textCandidates.flatMap((text) => {
    const trimmed = text.trim();
    return [trimmed, ...extractBalancedJsonObjects(trimmed)];
  });

  for (const snippet of snippets) {
    try {
      const parsed = JSON.parse(snippet);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;

      if (!expectedKeys.length) return parsed;
      const hasExpectedKey = expectedKeys.some((key) => key in (parsed as Record<string, unknown>));
      if (hasExpectedKey) return parsed;
    } catch {
      // ignore invalid snippet
    }
  }

  throw new Error("Unable to parse target JSON object from model response");
}

async function callByResponsesAPI(
  system: string,
  user: string,
  model: string,
  tools?: Array<Record<string, unknown>>,
  maxOutputTokens?: number,
): Promise<unknown> {
  return getClient().responses.create({
    model,
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
    ...(tools?.length ? { tools: tools as never } : {}),
    temperature: 0.4,
    max_output_tokens: maxOutputTokens ?? 900,
  });
}

async function callByChatAPI(system: string, user: string, model: string, maxOutputTokens?: number): Promise<string> {
  const completion = await getClient().chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    max_tokens: maxOutputTokens ?? 900,
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
  model?: string;
  responsesTools?: Array<Record<string, unknown>>;
  maxOutputTokens?: number;
}): Promise<T> {
  const env = getEnv();
  const retries = args.retries ?? 1;
  const systemPrompt = `${args.system}\n\n必须输出严格 JSON 对象，不要 markdown。\nJSON模板：\n${args.responseTemplate}`;
  const expectedKeys = getExpectedTopLevelKeys(args.responseTemplate);
  const model = args.model || env.OPENAI_MODEL;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const payload =
        env.OPENAI_API_STYLE === "responses"
          ? await callByResponsesAPI(systemPrompt, args.user, model, args.responsesTools, args.maxOutputTokens)
          : await callByChatAPI(systemPrompt, args.user, model, args.maxOutputTokens);

      return tryParsePayloadToJsonObject(payload, expectedKeys) as T;
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
