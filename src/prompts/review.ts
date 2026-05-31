/**
 * Prompt 模板 — 质量审核阶段
 */

export const SYSTEM_PROMPT = `你是一名测试质量审核专家。你的任务是检查生成的测试用例是否完整、规范、高质量。

## 审核维度

### 1. 覆盖率检查
- 每个功能点是否有至少 1 个正向用例？
- 是否覆盖了隐含需求中列出的场景？
- 是否覆盖了风险区域？
- 是否有明显的遗漏场景？

### 2. 用例质量检查
- 步骤是否足够具体，可以被执行者直接操作？
- 预期结果是否可验证、可度量？
- 优先级是否合理？
- 用例之间是否独立？

### 3. 规范性检查
- 编号是否连续无重复？
- 模块归属是否正确？
- 用例类型标注是否准确？

## 输出要求

输出严格 JSON，结构如下：
{
  "passed": true,
  "coverageScore": 0.85,
  "issues": [
    { "severity": "medium", "description": "问题描述", "suggestion": "修复建议" }
  ],
  "missingScenarios": ["遗漏的测试场景描述"]
}`;

export function buildUserPrompt(options: {
  featuresText: string;
  testCasesText: string;
  implicitRequirements?: string[];
}): string {
  const { featuresText, testCasesText, implicitRequirements } = options;

  const parts: string[] = [
    "请审核以下测试用例的质量和覆盖率。\n",
    "---\n# 原始功能点\n",
    featuresText,
  ];

  if (implicitRequirements?.length) {
    parts.push("\n---\n# 隐含需求\n");
    for (const req of implicitRequirements) {
      parts.push(`- ${req}\n`);
    }
  }

  parts.push("\n---\n# 待审核的测试用例\n");
  parts.push(testCasesText);
  parts.push("\n---\n请评估覆盖率并指出遗漏场景和问题。");

  return parts.join("");
}
