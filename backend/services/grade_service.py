"""改卷服务 — 公正阅卷官模式

核心流程：
1. 把题目+标准答案+学员作答+资料原文给 LLM
2. 用「公正阅卷官」提示词让 LLM 批改
3. 解析 JSON 响应
"""

from models.material import Material
from services.llm_service import chat_json

# ---- 需求文档 4.3 公正阅卷官提示词 ----

SYSTEM_PROMPT_GRADER = """# 角色
你是一位公正严格的阅卷老师，负责批改学员的测验答卷。

# 输入信息
- 原始题目及标准答案：
{questions_with_answers}
- 学员的作答：
{user_answers}
- 对应资料原文（作为判分依据）：
{material_context}

# 输出格式（严格 JSON）
{{
  "summary": {{
    "total_score": 12.0,
    "max_score": 15.0,
    "accuracy": "80%"
  }},
  "details": [
    {{
      "question_id": "Q1",
      "type": "choice|judge|essay",
      "user_answer": "学员答案",
      "correct_answer": "标准答案",
      "is_correct": true,
      "score": 1,
      "comment": "评语"
    }}
  ],
  "feedback": "整体评价和学习建议（2-3句话）"
}}

# 批改规则

## 客观题（选择 + 判断）
- **严格匹配**：学员答案与标准答案完全一致
  → is_correct=true, score=1, comment="✅ 正确"
- 不一致
  → is_correct=false, score=0, comment="❌ 错误。正确答案是 X。原因：..."

## 主观题（简答题）— 三档评分制
- 1分(完全正确)：涵盖了所有关键要点，表述清晰准确，与参考答案的核心意思一致
- 0.5分(部分正确)：答对了一部分但遗漏了关键点，或者方向对但表述不够准确
- 0分(错误)：完全偏离题意，答非所问

### 简答题评分细则
- 先对照标准答案的关键得分点（通常 2-3 个）
- 全部命中 → 1 分
- 命中部分（≥1个但未全中）→ 0.5 分
- 未命中任何关键点 → 0 分
- 如果学员的回答虽然措辞不同但意思完全正确，应给 1 分（不抠字眼）

# 评语风格
- ✅ 正确时：简洁确认，可以补充一句知识拓展
- ❌ 错误时：指出错误原因，引导回资料中的正确描述
- 📝 简答题半对时：列出哪些说对了、哪些漏掉了

# 整体反馈（feedback 字段）
- 总结本次测验表现（哪些掌握好、哪些薄弱）
- 给出 2 条具体的改进建议
- 语气鼓励但诚实，不吹捧"""


def grade(questions: list[dict], user_answers: list[dict],
          material_ids: list[str] = None) -> dict:
    """
    批改答卷。

    Args:
        questions: 题目列表（含标准答案）
        user_answers: [{"question_id": "Q1", "user_answer": "A"}]
        material_ids: 资料ID（用于获取原文辅助判分）

    Returns:
        {"summary": {...}, "details": [...], "feedback": "..."}
    """
    # 1. 拼接题目+标准答案
    qa_text = _format_questions(questions)

    # 2. 拼接学员作答
    ua_text = _format_answers(user_answers)

    # 3. 获取资料原文（截取关键部分）
    material_context = _get_materials_text(material_ids or [])

    # 4. 组装提示词
    system_prompt = SYSTEM_PROMPT_GRADER.format(
        questions_with_answers=qa_text,
        user_answers=ua_text,
        material_context=material_context,
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": "请严格按照指定 JSON 格式输出批改结果。"},
    ]

    # 5. 调用 LLM
    result = chat_json(messages, temperature=0.2)

    # 确保结构完整
    if "details" not in result:
        result = {"summary": result.get("summary", {}), "details": result.get("details", []), "feedback": result.get("feedback", "")}

    return result


def _format_questions(questions: list[dict]) -> str:
    """格式化题目+标准答案"""
    lines = []
    for q in questions:
        line = f"【{q['id']}】({q['type']}) {q['question']}"
        if q.get("options"):
            line += "\n选项: " + " | ".join(q["options"])
        line += f"\n标准答案: {q['answer']}"
        lines.append(line)
    return "\n\n".join(lines)


def _format_answers(answers: list[dict]) -> str:
    """格式化学员作答"""
    lines = []
    for a in answers:
        lines.append(f"【{a['question_id']}】学员答案: {a['user_answer']}")
    return "\n".join(lines)


def _get_materials_text(material_ids: list[str]) -> str:
    """拼接资料原文（截取前 6000 字，避免超 token）"""
    parts = []
    for mid in material_ids:
        mat = Material.query.get(mid)
        if mat and mat.content_text:
            parts.append(f"=== 资料：{mat.title} ===\n{mat.content_text[:6000]}")
    return "\n\n".join(parts) if parts else "（无资料原文）"
