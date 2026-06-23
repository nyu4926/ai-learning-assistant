"""出题服务 — 严谨命题官模式

核心流程：
1. 取资料内容
2. 用「严谨命题官」提示词让 LLM 出题
3. 解析 JSON 响应

题型配比：1/4 判断 + 1/2 选择 + 1/4 简答
难度搭配：简单/中等/较难
"""

from extensions import db
from models.material import Material
from services.llm_service import chat_json

# ---- 需求文档 4.2 严谨命题官提示词 ----

SYSTEM_PROMPT_QUIZ = """# 角色
你是一位严格的考试命题专家，专门负责根据学习资料编写测试题目。

# 任务
基于以下资料内容，生成一套测试题。
{material_context}

# 用户参数（从请求中读取）
- 题型要求：{quiz_types}（choice=选择题, judge=判断题, essay=简答题）
- 数量要求：{quiz_counts}
- 目标难度：中等偏难（区分"背过"和"真正理解"的人）

# 输出格式（严格 JSON）
{{
  "questions": [
    {{
      "id": "Q1",
      "type": "choice | judge | essay",
      "question": "题干文字",
      "options": ["A.xxx","B.xxx","C.xxx","D.xxx"],
      "answer": "标准答案（choice写选项字母，judge写对/错，essay写参考要点）",
      "explanation": "解题思路/解析",
      "source_material": "出自哪份资料哪个章节"
    }}
  ]
}}

# 命题规则

## 选择题规则
- 必须 4 选 1 单选，只有一个正确答案
- 干扰项要有迷惑性（常见错误理解、易混淆概念）
- 不能出现"以上都对""以上都错"等偷懒选项
- 题干不能直接照抄原文句子，要换一种问法

## 判断题规则
- 陈述句，判断对或错
- 要考察容易搞混的概念（如"Attention机制只用于Encoder"→错）
- 正确和错误的比例大致 5:5

## 简答题规则
- 问题要具体，不要泛泛而谈（坏例子："请谈谈Transformer"）
- 参考答案要列出关键得分点（2-3个要点即可）
- 答案能在资料中找到明确依据

# 质量检查（输出前自查）
✅ 所有题目都能在给定资料中找到答案依据
✅ 没有一道题是靠常识就能答对的
✅ 题目覆盖了资料的不同章节/知识点，不扎堆
✅ 选择题的干扰项确实能迷惑没学懂的人"""


def generate_questions(material_ids: list[str], total_count: int = 10) -> list[dict]:
    """
    根据资料生成题目。

    题型配比：1/4 判断 + 1/2 选择 + 1/4 简答
    如果 total_count 不够整除，选择题优先。

    Args:
        material_ids: 资料 ID 列表
        total_count: 总题数

    Returns:
        题目列表
    """
    # 1. 取资料内容
    material_context = _get_materials_text(material_ids)
    if not material_context:
        raise ValueError("所选资料暂无内容，请先上传并等待解析完成")

    # 2. 计算题型配比：1/4 判断 + 1/2 选择 + 1/4 简答
    essay_count = max(1, total_count // 4)
    judge_count = max(1, total_count // 4)
    choice_count = total_count - essay_count - judge_count

    quiz_types = "选择题(choice)、判断题(judge)、简答题(essay)"
    quiz_counts = f"选择题 {choice_count} 道，判断题 {judge_count} 道，简答题 {essay_count} 道"

    # 3. 组装提示词
    system_prompt = SYSTEM_PROMPT_QUIZ.format(
        material_context=material_context,
        quiz_types=quiz_types,
        quiz_counts=quiz_counts,
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"请根据上述资料生成 {total_count} 道题目，严格按照指定 JSON 格式输出。难度搭配：简单、中等、较难各占约1/3。"},
    ]

    # 4. 调用 LLM
    result = chat_json(messages, temperature=0.5)

    questions = result.get("questions", result) if isinstance(result, dict) else result

    # 确保是 list
    if not isinstance(questions, list):
        raise ValueError(f"LLM 返回格式异常: {type(questions)}")

    # 5. 给每道题加上 id（如果没有的话）
    for i, q in enumerate(questions):
        if "id" not in q:
            q["id"] = f"Q{i + 1}"

    return questions


def _get_materials_text(material_ids: list[str]) -> str:
    """拼接多份资料的内容"""
    parts = []
    for mid in material_ids:
        mat = Material.query.get(mid)
        if mat and mat.content_text:
            parts.append(f"=== 资料：{mat.title} ===\n{mat.content_text[:8000]}")
    return "\n\n".join(parts)
