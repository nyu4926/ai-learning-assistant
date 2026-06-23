"""RAG 对话服务 — 向量检索 + LLM 生成

核心流程：
1. 用户提问 → 在已选资料中向量检索相关段落
2. 把检索结果塞进「学习导师」提示词
3. 带上历史消息做多轮上下文 → 调用 LLM
4. 返回回复 + 引用来源
"""

from services.vector_service import search
from services.llm_service import chat
from models.material import Material

# ---- 需求文档 4.1 学习导师提示词 ----

SYSTEM_PROMPT_TUTOR = """# 角色
你是一位资深 AI 产品经理转型的大模型课程导师。你的学员正在学习大模型相关的技术课程。

# 性格特征
- 说话有洞察力，不啰嗦，一针见血
- 能把复杂概念用简单类比讲清楚
- 会主动指出学员理解中的常见误区
- 语气像一位经验丰富的同事在带新人，不端着不装

# 核心规则（最高优先级）
1. **严格基于提供的资料内容回答**。你只拥有以下资料作为知识来源：
{material_context}
2. 如果问题超出资料范围，明确告知："这个问题超出了当前资料覆盖的范围，建议补充 XX 方面的资料。"
3. **每次回答必须标注引用来源**，格式为：
   > 📖 引自《资料名称》：原文摘录...
4. 不要编造资料中没有的内容，即使你对这个话题很了解也不行。

# 回答风格
- 开门见山，先给结论再解释原因
- 用类比和实例帮助理解，避免堆砌术语
- 当学员的理解有明显偏差时，温和但坚定地纠正
- 适当反问，引导学员自己思考（"你觉得这里为什么这样设计？"）

# 禁止行为
❌ 不要说"这是一个很好的问题"之类废话
❌ 不要长篇大论，控制在 300 字以内（除非学员要求展开）
❌ 不要用外部知识替代资料内容回答
❌ 不要扮演客服语气"""


def ask(question: str, material_ids: list[str], history: list[dict] = None) -> tuple[str, list[dict]]:
    """
    RAG 对话：检索相关段落 → 组装 prompt → 调用 LLM

    Args:
        question: 用户提问
        material_ids: 关联的资料 ID 列表
        history: 历史消息 [{"role": "user"|"assistant", "content": "..."}]

    Returns:
        (回复文本, 引用来源列表)
    """
    # 1. 向量检索相关段落
    search_results = search(query=question, material_ids=material_ids, top_k=5)

    # 2. 组装资料上下文
    material_context = _build_material_context(search_results)

    # 3. 组装系统提示词
    system_prompt = SYSTEM_PROMPT_TUTOR.format(material_context=material_context)

    # 4. 组装消息列表（系统提示 + 历史 + 当前问题）
    messages = [{"role": "system", "content": system_prompt}]

    # 历史消息（最近 10 轮，避免超 token）
    if history:
        recent = history[-20:]  # 最多 20 条消息（约 10 轮）
        for msg in recent:
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": question})

    # 5. 调用 LLM
    reply = chat(messages, temperature=0.7)

    # 6. 构建引用来源
    sources = []
    for r in search_results:
        mat = Material.query.get(r["material_id"])
        title = mat.title if mat else "未知资料"
        sources.append({
            "material_id": r["material_id"],
            "material_title": title,
            "chunk_text": r["text"],
            "score": r["score"],
        })

    return reply, sources


def _build_material_context(search_results: list[dict]) -> str:
    """把检索结果拼成可读的资料上下文"""
    if not search_results:
        return "（未找到相关资料内容）"

    parts = []
    for r in search_results:
        mat = Material.query.get(r["material_id"])
        title = mat.title if mat else "未知资料"
        parts.append(f"【{title}】\n{r['text']}")

    return "\n\n---\n\n".join(parts)
