/**
 * LLM 调用封装 — 对接 DeepSeek API（兼容 OpenAI SDK）
 */
import OpenAI from "openai";
import { config } from "dotenv";
import { z } from "zod";
import type { ZodType } from "zod";

config();

// ──────────────────────────────────────────────
// 客户端初始化（单例）
// ──────────────────────────────────────────────
let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseURL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

    if (!apiKey || apiKey === "sk-your-key-here") {
      throw new Error(
        "请先在 .env 文件中设置 DEEPSEEK_API_KEY\n参考 .env.example 模板"
      );
    }
    client = new OpenAI({ apiKey, baseURL });
  }
  return client;
}

function getModel(): string {
  return process.env.DEFAULT_MODEL || "deepseek-chat";
}

// ──────────────────────────────────────────────
// 核心调用方法
// ──────────────────────────────────────────────

/** 普通文本对话，返回 LLM 的纯文本回复 */
export async function chat(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3
): Promise<string> {
  const c = getClient();
  const response = await c.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
  });
  return response.choices[0]?.message?.content || "";
}

/**
 * 结构化输出：强制 LLM 按 Zod Schema 返回 JSON
 *
 * DeepSeek 支持 response_format: json_schema，
 * 但兼容性不如 OpenAI 稳定，这里用 JSON mode + 手动校验兜底
 */
export async function chatJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: ZodType<T>,
  temperature = 0.3
): Promise<T> {
  const c = getClient();

  // 在 system prompt 中注入 schema 说明
  const jsonInstruction = [
    systemPrompt,
    "",
    "## 输出格式要求",
    "你必须输出严格的 JSON，符合以下结构：",
    "```json",
    JSON.stringify(
      zodToJsonExample(schema),
      null,
      2
    ),
    "```",
  ].join("\n");

  const response = await c.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: jsonInstruction },
      { role: "user", content: userPrompt },
    ],
    temperature,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);
  return schema.parse(parsed); // Zod 校验，不符合会抛错
}

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────

/** 将 Zod Schema 转为 JSON 示例（用于指导 LLM 输出格式） */
function zodToJsonExample(schema: ZodType): unknown {
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return 0;
  if (schema instanceof z.ZodBoolean) return true;
  if (schema instanceof z.ZodEnum) return schema.options[0];
  if (schema instanceof z.ZodArray) return [zodToJsonExample(schema.element)];
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, ZodType>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(shape)) {
      if (value instanceof z.ZodNullable) {
        result[key] = null;
      } else {
        result[key] = zodToJsonExample(value);
      }
    }
    return result;
  }
  if (schema instanceof z.ZodDefault) return zodToJsonExample(schema._def.innerType as ZodType);
  if (schema instanceof z.ZodNullable) return null;
  return "unknown";
}
