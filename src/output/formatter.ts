/**
 * 输出格式化 — 将测试用例套件转换为 Markdown / JSON / 表格
 */
import type { TestCaseSuite } from "../schemas/test-case.js";

/** 将测试用例套件格式化为 Markdown */
export function toMarkdown(suite: TestCaseSuite): string {
  const lines: string[] = [];

  // 标题和摘要
  lines.push("# 测试用例报告\n");
  lines.push(`- **PRD 来源**: ${suite.prdSource}`);
  lines.push(`- **功能点数**: ${suite.featuresCount}`);
  lines.push(`- **用例总数**: ${suite.cases.length}`);
  lines.push(`- **覆盖率评分**: ${(suite.review.coverageScore * 100).toFixed(0)}%`);
  lines.push(`- **审核结果**: ${suite.review.passed ? "通过" : "未通过"}`);
  lines.push("");

  // 按模块分组
  const modules = new Map<string, typeof suite.cases>();
  for (const c of suite.cases) {
    if (!modules.has(c.module)) modules.set(c.module, []);
    modules.get(c.module)!.push(c);
  }

  for (const [module, cases] of modules) {
    lines.push(`## ${module}\n`);
    lines.push("| 编号 | 标题 | 类型 | 优先级 | 前置条件 | 操作步骤 | 预期结果 |");
    lines.push("|------|------|------|--------|----------|----------|----------|");
    for (const c of cases) {
      const steps = c.steps.map((s, i) => `${i + 1}. ${s}`).join("<br>");
      lines.push(
        `| ${c.id} | ${c.title} | ${c.caseType} | ${c.priority} | ${c.precondition} | ${steps} | ${c.expected} |`
      );
    }
    lines.push("");
  }

  // 审核结果
  if (suite.review.issues.length > 0) {
    lines.push("## 审核发现的问题\n");
    const icons: Record<string, string> = { high: "🔴", medium: "🟡", low: "🟢" };
    for (const issue of suite.review.issues) {
      lines.push(`- ${icons[issue.severity]} **[${issue.severity}]** ${issue.description}`);
      lines.push(`  - 建议: ${issue.suggestion}`);
    }
    lines.push("");
  }

  if (suite.review.missingScenarios.length > 0) {
    lines.push("## 遗漏的测试场景\n");
    for (const s of suite.review.missingScenarios) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  // 覆盖率说明
  lines.push("## 覆盖率说明\n");
  lines.push(suite.coverageNote);

  return lines.join("\n");
}

/** 将测试用例套件格式化为 JSON */
export function toJson(suite: TestCaseSuite): string {
  return JSON.stringify(suite, null, 2);
}

/** 将测试用例格式化为简洁表格 */
export function toTable(suite: TestCaseSuite): string {
  const lines: string[] = [];
  lines.push("| 编号 | 模块 | 标题 | 类型 | 优先级 | 前置条件 | 步骤 | 预期结果 |");
  lines.push("|------|------|------|------|--------|----------|------|----------|");
  for (const c of suite.cases) {
    const steps = c.steps.join("; ");
    lines.push(
      `| ${c.id} | ${c.module} | ${c.title} | ${c.caseType} | ${c.priority} | ${c.precondition} | ${steps} | ${c.expected} |`
    );
  }
  return lines.join("\n");
}
