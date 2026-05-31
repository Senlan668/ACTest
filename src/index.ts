#!/usr/bin/env node
/**
 * Test Agent — 主流程入口
 *
 * PRD → 需求分析 → 用例生成 → 质量审核 → 输出
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

import { chat, chatJson } from "./llm.js";
import { AnalysisResultSchema, ReviewResultSchema, TestCaseSchema } from "./schemas/test-case.js";
import type { AnalysisResult, TestCase, ReviewResult, TestCaseSuite } from "./schemas/test-case.js";
import * as analyzePrompt from "./prompts/analyze.js";
import * as generatePrompt from "./prompts/generate.js";
import * as reviewPrompt from "./prompts/review.js";
import { toMarkdown, toJson, toTable } from "./output/formatter.js";

// ──────────────────────────────────────────────
// PRD 读取
// ──────────────────────────────────────────────
function readPrd(source: string): string {
  const path = resolve(source);
  if (existsSync(path)) {
    return readFileSync(path, "utf-8");
  }
  return source; // 直接当文本
}

// ──────────────────────────────────────────────
// Step 1: 需求分析
// ──────────────────────────────────────────────
async function stepAnalyze(prdContent: string): Promise<AnalysisResult> {
  const userPrompt = analyzePrompt.buildUserPrompt(prdContent);
  const raw = await chatJson(
    analyzePrompt.SYSTEM_PROMPT,
    userPrompt,
    AnalysisResultSchema,
    0.2
  );
  // 确保 default 字段有值（LLM 可能省略）
  return {
    features: raw.features.map((f) => ({
      ...f,
      implicitRequirements: f.implicitRequirements ?? [],
    })),
    implicitRequirements: raw.implicitRequirements ?? [],
    riskAreas: raw.riskAreas ?? [],
  };
}

// ──────────────────────────────────────────────
// Step 2: 生成测试用例
// ──────────────────────────────────────────────
async function stepGenerate(analysis: AnalysisResult): Promise<TestCase[]> {
  const featuresText = analysis.features
    .map(
      (f) =>
        `### ${f.name} (模块: ${f.module})\n${f.description}\n` +
        (f.implicitRequirements.length > 0
          ? `隐含需求: ${f.implicitRequirements.join(", ")}`
          : "")
    )
    .join("\n\n");

  const userPrompt = generatePrompt.buildUserPrompt({
    featuresText,
    implicitRequirements: analysis.implicitRequirements,
    riskAreas: analysis.riskAreas,
  });

  const raw = await chat(
    generatePrompt.SYSTEM_PROMPT,
    userPrompt,
    0.4
  );

  return parseTestCases(raw);
}

// ──────────────────────────────────────────────
// Step 3: 质量审核
// ──────────────────────────────────────────────
async function stepReview(
  analysis: AnalysisResult,
  cases: TestCase[]
): Promise<ReviewResult> {
  const featuresText = analysis.features
    .map((f) => `- ${f.name}: ${f.description}`)
    .join("\n");

  const casesText = cases
    .map((c) => `- [${c.id}] ${c.module} | ${c.title} | ${c.caseType} | ${c.priority}`)
    .join("\n");

  const userPrompt = reviewPrompt.buildUserPrompt({
    featuresText,
    testCasesText: casesText,
    implicitRequirements: analysis.implicitRequirements,
  });

  const raw = await chatJson(
    reviewPrompt.SYSTEM_PROMPT,
    userPrompt,
    ReviewResultSchema,
    0.2
  );
  return {
    passed: raw.passed,
    coverageScore: raw.coverageScore,
    issues: raw.issues ?? [],
    missingScenarios: raw.missingScenarios ?? [],
  };
}

// ──────────────────────────────────────────────
// JSON 解析工具
// ──────────────────────────────────────────────
function parseTestCases(raw: string): TestCase[] {
  const text = raw.trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");

  if (start === -1 || end === -1) {
    console.warn(chalk.yellow("警告: LLM 输出未包含 JSON 数组"));
    return [];
  }

  let data: unknown[];
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    console.error(chalk.red(`JSON 解析失败: ${e}`));
    return [];
  }

  const cases: TestCase[] = [];
  for (let i = 0; i < data.length; i++) {
    try {
      const item = data[i] as Record<string, unknown>;
      if (!item.id) item.id = `TC-${String(i + 1).padStart(3, "0")}`;
      cases.push(TestCaseSchema.parse(item));
    } catch (e) {
      console.warn(chalk.yellow(`跳过无效用例 #${i + 1}: ${e}`));
    }
  }
  return cases;
}

// ──────────────────────────────────────────────
// 主流程
// ──────────────────────────────────────────────
export async function run(
  prdSource: string,
  outputFormat: "markdown" | "json" | "table" = "markdown"
): Promise<string> {
  const prdContent = readPrd(prdSource);
  if (!prdContent.trim()) throw new Error("PRD 内容为空");

  console.log(chalk.bold(`\n📄 PRD 长度: ${prdContent.length} 字符\n`));

  // Step 1
  const spinner1 = ora("Step 1/3: 需求分析...").start();
  const analysis = await stepAnalyze(prdContent);
  spinner1.succeed(
    chalk.green(`Step 1/3: 需求分析完成 — ${analysis.features.length} 个功能点`)
  );

  // Step 2
  const spinner2 = ora("Step 2/3: 生成测试用例...").start();
  const cases = await stepGenerate(analysis);
  spinner2.succeed(
    chalk.green(`Step 2/3: 生成完成 — ${cases.length} 条用例`)
  );

  // Step 3
  const spinner3 = ora("Step 3/3: 质量审核...").start();
  const review = await stepReview(analysis, cases);
  spinner3.succeed(
    chalk.green(`Step 3/3: 审核完成 — 覆盖率 ${(review.coverageScore * 100).toFixed(0)}%`)
  );

  // 组装结果
  const suite: TestCaseSuite = {
    prdSource:
      prdContent.length > 100
        ? prdContent.slice(0, 100) + "..."
        : prdContent,
    featuresCount: analysis.features.length,
    cases,
    review: {
      passed: review.passed,
      coverageScore: review.coverageScore,
      issues: review.issues ?? [],
      missingScenarios: review.missingScenarios ?? [],
    },
    coverageNote:
      (review.missingScenarios ?? []).length > 0
        ? "需要补充: " + review.missingScenarios.join("; ")
        : "覆盖率满足要求",
  };

  // 格式化输出
  const formatters: Record<string, (s: TestCaseSuite) => string> = {
    markdown: toMarkdown,
    json: toJson,
    table: toTable,
  };
  return (formatters[outputFormat] || toMarkdown)(suite);
}

// ──────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────
const program = new Command();

program
  .name("test-agent")
  .description("AI 驱动的测试用例生成工具")
  .version("0.1.0")
  .requiredOption("-i, --input <path>", "PRD 文件路径或直接文本")
  .option("-f, --format <type>", "输出格式: markdown | json | table", "markdown")
  .option("-o, --output <path>", "输出文件路径（不指定则打印到终端）")
  .action(async (opts) => {
    try {
      const result = await run(
        opts.input,
        opts.format as "markdown" | "json" | "table"
      );

      if (opts.output) {
        writeFileSync(resolve(opts.output), result, "utf-8");
        console.log(chalk.green(`\n✅ 结果已保存到: ${opts.output}`));
      } else {
        console.log("\n" + result);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(chalk.red(`\n❌ 错误: ${msg}`));
      process.exit(1);
    }
  });

program.parse();
