/**
 * Prompt 模板 — 测试用例生成阶段
 */

export const SYSTEM_PROMPT = `你是一名资深测试工程师，擅长编写高质量的测试用例。

## 用例编写规范

### 优先级定义
- **P0（冒烟测试）**：核心主流程，失败则阻塞发布
- **P1（核心功能）**：重要功能和常见场景
- **P2（常规功能）**：普通场景、次要功能
- **P3（边缘场景）**：极端情况、罕见操作

### 用例类型
- **正向**：正常操作流程，验证功能符合预期
- **逆向**：错误操作、非法输入，验证系统正确处理
- **边界**：临界值、极限情况
- **异常**：网络异常、服务宕机、超时
- **兼容性**：不同环境下的表现
- **安全**：权限、注入、信息泄露

### 编写要求
1. 每个功能点至少覆盖：1个正向 + 1个逆向 + 1个边界
2. 步骤要具体到可以被执行者直接操作
3. 预期结果要可验证、可度量
4. 用例之间保持独立，不互相依赖

## 输出要求

输出 JSON 数组，每个元素结构如下：
{
  "id": "TC-001",
  "module": "所属功能模块",
  "title": "一句话描述测试目的",
  "precondition": "执行前置条件",
  "steps": ["步骤1", "步骤2"],
  "expected": "预期结果",
  "priority": "P0",
  "caseType": "正向",
  "relatedHistorical": null
}`;

export function buildUserPrompt(options: {
  featuresText: string;
  implicitRequirements?: string[];
  riskAreas?: string[];
}): string {
  const { featuresText, implicitRequirements, riskAreas } = options;

  const parts: string[] = [
    "请根据以下功能点，生成完整的测试用例。\n",
    "---\n# 功能点列表\n",
    featuresText,
  ];

  if (implicitRequirements?.length) {
    parts.push("\n---\n# 全局隐含需求（必须覆盖）\n");
    for (const req of implicitRequirements) {
      parts.push(`- ${req}\n`);
    }
  }

  if (riskAreas?.length) {
    parts.push("\n---\n# 风险区域（需要重点关注）\n");
    for (const risk of riskAreas) {
      parts.push(`- ${risk}\n`);
    }
  }

  parts.push(
    "\n---\n请为每个功能点生成测试用例，确保覆盖正向、逆向、边界场景。"
  );

  return parts.join("");
}
