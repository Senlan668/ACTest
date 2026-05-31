/**
 * Web Server — 前端 + API 一体化服务器
 *
 * 启动方式: npx tsx src/server.ts
 * - 前端页面: http://localhost:3000
 * - API 接口: POST http://localhost:3000/api/generate
 */
import express from "express";
import { readFileSync, existsSync } from "fs";
import { resolve, extname } from "path";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";

import { chat, chatJson } from "./llm.js";
import { AnalysisResultSchema, ReviewResultSchema, TestCaseSchema } from "./schemas/test-case.js";
import type { AnalysisResult, TestCase, ReviewResult } from "./schemas/test-case.js";
import * as analyzePrompt from "./prompts/analyze.js";
import * as generatePrompt from "./prompts/generate.js";
import * as reviewPrompt from "./prompts/review.js";

config();

const app = express();
app.use(express.json({ limit: "1mb" }));

// ──────────────────────────────────────────────
// 静态文件服务（前端）
// ──────────────────────────────────────────────
const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "../web");

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

app.use(express.static(webDir, {
  setHeaders(res, filePath) {
    const ct = mimeTypes[extname(filePath)];
    if (ct) res.setHeader("Content-Type", ct);
  },
}));

// ──────────────────────────────────────────────
// API: 生成测试用例
// ──────────────────────────────────────────────
app.post("/api/generate", async (req, res) => {
  const { prd } = req.body as { prd?: string };

  if (!prd?.trim()) {
    res.status(400).json({ error: "PRD 内容不能为空" });
    return;
  }

  // 设置 SSE 流式响应
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Step 1: 需求分析
    send("step", { step: 0, status: "running", label: "需求分析" });

    const analysisRaw = await chatJson(
        analyzePrompt.SYSTEM_PROMPT,
        analyzePrompt.buildUserPrompt(prd),
        AnalysisResultSchema,
        0.2
      );
    const analysis = normalizeAnalysis(analysisRaw);

    send("step", {
      step: 0,
      status: "done",
      detail: `${analysis.features.length} 个功能点`,
      data: analysis,
    });

    // Step 2: 生成测试用例
    send("step", { step: 1, status: "running", label: "生成测试用例" });

    const featuresText = analysis.features
      .map(
        (f) =>
          `### ${f.name} (模块: ${f.module})\n${f.description}\n` +
          (f.implicitRequirements.length > 0
            ? `隐含需求: ${f.implicitRequirements.join(", ")}`
            : "")
      )
      .join("\n\n");

    const raw = await chat(
      generatePrompt.SYSTEM_PROMPT,
      generatePrompt.buildUserPrompt({
        featuresText,
        implicitRequirements: analysis.implicitRequirements,
        riskAreas: analysis.riskAreas,
      }),
      0.4
    );

    const cases = parseTestCases(raw);

    send("step", {
      step: 1,
      status: "done",
      detail: `${cases.length} 条用例`,
      data: cases,
    });

    // Step 3: 质量审核
    send("step", { step: 2, status: "running", label: "质量审核" });

    const casesSummary = cases
      .map((c) => `- [${c.id}] ${c.module} | ${c.title} | ${c.caseType} | ${c.priority}`)
      .join("\n");

    const featuresSummary = analysis.features
      .map((f) => `- ${f.name}: ${f.description}`)
      .join("\n");

    const reviewRaw = await chatJson(
      reviewPrompt.SYSTEM_PROMPT,
      reviewPrompt.buildUserPrompt({
        featuresText: featuresSummary,
        testCasesText: casesSummary,
        implicitRequirements: analysis.implicitRequirements,
      }),
      ReviewResultSchema,
      0.2
    );

    const review: ReviewResult = normalizeReview(reviewRaw);

    send("step", {
      step: 2,
      status: "done",
      detail: `覆盖率 ${Math.round(review.coverageScore * 100)}%`,
      data: review,
    });

    // 完成
    send("done", { cases, review, analysis });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    send("error", { message: msg });
  } finally {
    res.end();
  }
});

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────
function normalizeAnalysis(raw: unknown): AnalysisResult {
  const r = raw as Record<string, unknown>;
  const features = ((r.features ?? []) as Record<string, unknown>[]).map((f) => ({
    name: f.name as string,
    description: f.description as string,
    module: f.module as string,
    implicitRequirements: (f.implicitRequirements ?? []) as string[],
  }));
  return {
    features,
    implicitRequirements: (r.implicitRequirements ?? []) as string[],
    riskAreas: (r.riskAreas ?? []) as string[],
  };
}

function normalizeReview(raw: unknown): ReviewResult {
  const r = raw as Record<string, unknown>;
  return {
    passed: r.passed as boolean,
    coverageScore: r.coverageScore as number,
    issues: (r.issues ?? []) as ReviewResult["issues"],
    missingScenarios: (r.missingScenarios ?? []) as string[],
  };
}

function parseTestCases(raw: string): TestCase[] {
  const text = raw.trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return [];

  let data: unknown[];
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }

  const cases: TestCase[] = [];
  for (let i = 0; i < data.length; i++) {
    try {
      const item = data[i] as Record<string, unknown>;
      if (!item.id) item.id = `TC-${String(i + 1).padStart(3, "0")}`;
      // 兼容 caseType 和 case_type 两种命名
      if (!item.caseType && (item as Record<string, unknown>).case_type) {
        item.caseType = (item as Record<string, unknown>).case_type;
      }
      cases.push(TestCaseSchema.parse(item));
    } catch {
      // 跳过无效用例
    }
  }
  return cases;
}

// ──────────────────────────────────────────────
// 启动
// ──────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`\n  🚀 Test Agent 已启动`);
  console.log(`  📎 打开浏览器: http://localhost:${PORT}\n`);
});
