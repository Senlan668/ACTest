/**
 * 测试用例数据模型 — 整个 Agent 的数据骨架
 * 使用 Zod 定义 Schema，同时推导出 TypeScript 类型
 */
import { z } from "zod";

// ──────────────────────────────────────────────
// 单条测试用例
// ──────────────────────────────────────────────
export const TestCaseSchema = z.object({
  id: z.string().describe("用例编号，如 TC-001"),
  module: z.string().describe("功能模块，如「购物车-拼团」"),
  title: z.string().describe("用例标题，一句话描述测试目的"),
  precondition: z.string().describe("前置条件，执行前需要满足的状态"),
  steps: z.array(z.string()).describe("操作步骤，有序列表"),
  expected: z.string().describe("预期结果"),
  priority: z.enum(["P0", "P1", "P2", "P3"]).describe(
    "优先级：P0=冒烟 P1=核心 P2=常规 P3=边缘"
  ),
  caseType: z
    .enum(["正向", "逆向", "边界", "异常", "兼容性", "安全"])
    .describe("用例类型"),
  relatedHistorical: z.string().nullable().default(null).describe(
    "关联的历史用例编号或说明（里程碑2+使用）"
  ),
});
export type TestCase = z.infer<typeof TestCaseSchema>;

// ──────────────────────────────────────────────
// 功能点（需求分析阶段的输出）
// ──────────────────────────────────────────────
export const FeatureSchema = z.object({
  name: z.string().describe("功能点名称"),
  description: z.string().describe("功能点详细描述"),
  module: z.string().describe("所属模块"),
  implicitRequirements: z
    .array(z.string())
    .default([])
    .describe("该功能点隐含的需求（PRD未明确写出但需要测试的）"),
});
export type Feature = z.infer<typeof FeatureSchema>;

export const AnalysisResultSchema = z.object({
  features: z.array(FeatureSchema).describe("提取的功能点列表"),
  implicitRequirements: z
    .array(z.string())
    .default([])
    .describe("全局隐含需求（跨功能点的共性需求）"),
  riskAreas: z
    .array(z.string())
    .default([])
    .describe("风险区域（需要重点关注的部分）"),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ──────────────────────────────────────────────
// 质量审核结果
// ──────────────────────────────────────────────
export const ReviewIssueSchema = z.object({
  severity: z.enum(["high", "medium", "low"]).describe("严重程度"),
  description: z.string().describe("问题描述"),
  suggestion: z.string().describe("修复建议"),
});
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;

export const ReviewResultSchema = z.object({
  passed: z.boolean().describe("是否通过审核"),
  coverageScore: z
    .number()
    .min(0)
    .max(1)
    .describe("覆盖率评分（0-1）"),
  issues: z.array(ReviewIssueSchema).default([]).describe("发现的问题"),
  missingScenarios: z
    .array(z.string())
    .default([])
    .describe("遗漏的测试场景"),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

// ──────────────────────────────────────────────
// 最终输出：测试用例套件
// ──────────────────────────────────────────────
export const TestCaseSuiteSchema = z.object({
  prdSource: z.string().describe("PRD来源标识"),
  featuresCount: z.number().describe("识别的功能点数量"),
  cases: z.array(TestCaseSchema).describe("生成的测试用例列表"),
  review: ReviewResultSchema.describe("质量审核结果"),
  coverageNote: z.string().describe("覆盖率说明"),
});
export type TestCaseSuite = z.infer<typeof TestCaseSuiteSchema>;
