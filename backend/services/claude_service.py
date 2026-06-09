import json
import re
import time
from typing import List, Dict, Optional
from openai import OpenAI

from config import (
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_MODEL,
    LLM_MAX_TOKENS,
)


# ── 客户端 ──────────────────────────────────────────────────────

_client = OpenAI(api_key=LLM_API_KEY, base_url=LLM_BASE_URL)


# ═══════════════════════════════════════════════════════════════
#  通用工具
# ═══════════════════════════════════════════════════════════════

def _call_llm(
    messages: List[Dict[str, str]],
    temperature: float = 0.7,
    max_tokens: int = LLM_MAX_TOKENS,
    json_mode: bool = False,
) -> str:
    """调用 LLM，带自动重试（3 次，递增间隔）"""
    kwargs = dict(
        model=LLM_MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    last_error = None
    for attempt in range(3):
        try:
            resp = _client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content or ""
        except Exception as e:
            last_error = e
            if attempt < 2:
                wait = (attempt + 1) * 2  # 2s, 4s
                time.sleep(wait)
    raise RuntimeError(f"LLM 调用失败（已重试 3 次）: {last_error}")


def _strip_code_fence(text: str) -> str:
    """去掉 LLM 输出中可能的 ```json ... ``` 包裹"""
    text = text.strip()
    # 匹配 ```json ... ``` 或 ``` ... ```
    m = re.match(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    return text


def _safe_json(text: str) -> dict:
    """安全解析 JSON，自动处理 code fence"""
    cleaned = _strip_code_fence(text)
    return json.loads(cleaned)


# ═══════════════════════════════════════════════════════════════
#  角色 System Prompts
# ═══════════════════════════════════════════════════════════════

SYSTEM_TUTOR = """你是一位专为 AI 产品经理设计的学习助手。

## 你的风格
- **直接、有洞察**：不绕弯子，给出有深度的回答
- **PM 语言**：用产品经理熟悉的词汇组织思路——需求、场景、用户价值、ROI、迭代节奏
- **类比优先**：技术概念用生活化类比解释，让非技术 PM 也能理解

## 回答准则
1. **优先基于资料**：以下提供的「参考资料」是首要知识来源，请优先引用
2. **补充标注**：如果使用了资料外的通用知识，需要在回答末尾用「💡 补充」标注
3. **引用来源**：涉及具体数据、定义、结论时，注明来自哪份文档
4. **结构化输出**：用清晰的标题、列表组织答案
5. **开放问题时**：先给出结论再展开，不要堆砌信息

## 禁止
- 不要编造资料中不存在的内容
- 不要使用「根据我的训练数据」等暴露 AI 身份的说法
- 不要评价问题好坏"""

SYSTEM_QUIZ_MAKER = """你是一个严格的出题系统，基于文档内容生成测评题目。

## 规则
1. **仅基于文档**：每道题必须有明确的文档出处，不可编造
2. **题型支持**：choice（选择题）、tf（判断题）、short（简答题）
3. **标注元信息**：每道题必须附带 knowledge_point（知识点）和 difficulty（easy/medium/hard）

## 输出格式
严格输出 JSON，不要任何额外文字：
{
  "questions": [
    {
      "type": "choice",
      "question": "题目文字",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": 0,
      "knowledge_point": "知识点名称",
      "difficulty": "medium",
      "source": "文档名 · 章节/页码"
    },
    {
      "type": "tf",
      "question": "判断对错题目",
      "answer": "correct",
      "knowledge_point": "知识点名称",
      "difficulty": "easy",
      "source": "文档名 · 章节/页码"
    },
    {
      "type": "short",
      "question": "简答题",
      "answer": "参考答案要点",
      "knowledge_point": "知识点名称",
      "difficulty": "hard",
      "source": "文档名 · 章节/页码"
    }
  ]
}"""

SYSTEM_GRADER = """你是一个严格的评测系统，评判学生的答案是否正确。

## 评分规则
- **选择题**：用户选择的选项索引必须与正确答案完全一致，is_correct 为 true/false
- **判断题**：用户答案（correct/wrong）与正确答案匹配，is_correct 为 true/false
- **简答题**：三档评分
  - score = 1.0：核心要点齐全，表述准确
  - score = 0.5：部分正确，有遗漏或偏差
  - score = 0.0：完全错误或未作答
  - is_correct = score >= 0.5

## 输出格式
严格输出 JSON 数组：
[
  {
    "question_index": 0,
    "is_correct": true,
    "score": 1.0,
    "feedback": "简短评语（1-2句）"
  }
]"""


# ═══════════════════════════════════════════════════════════════
#  业务功能
# ═══════════════════════════════════════════════════════════════

def chat_qa(
    question: str,
    context_chunks: List[Dict],
    history: Optional[List[Dict[str, str]]] = None,
    conversation_id: Optional[int] = None,
) -> Dict:
    """
    RAG 问答。
    
    Args:
        question: 用户问题
        context_chunks: 检索到的文档片段 [{"content": str, "metadata": dict}, ...]
        history: 历史消息 [{"role": "user/assistant", "content": str}, ...]
        conversation_id: 对话 ID（用于记录消息）
    
    Returns:
        {"answer": str, "sources": list}
    """
    # 构建上下文
    context_text = ""
    sources = []
    if context_chunks:
        for i, chunk in enumerate(context_chunks, 1):
            doc_name = chunk.get("metadata", {}).get("source", f"片段 {i}")
            context_text += f"\n### 参考资料 {i}（来源: {doc_name}）\n{chunk['content']}\n"
            sources.append({
                "name": str(doc_name),
                "snippet": chunk["content"][:200],
            })

    # 构建消息
    messages = [{"role": "system", "content": SYSTEM_TUTOR}]
    if history:
        messages.extend(history)
    
    user_msg = question
    if context_text:
        user_msg = f"以下是与问题相关的参考资料：\n{context_text}\n---\n请基于以上资料回答：{question}"
    messages.append({"role": "user", "content": user_msg})

    answer = _call_llm(messages, temperature=0.7)

    # 记录消息到数据库（如果提供了 conversation_id）
    if conversation_id:
        from backend.models.database import MessageDAO, ConversationDAO
        try:
            MessageDAO.insert(
                conversation_id=conversation_id,
                role="user",
                content=question,
                sources_json=json.dumps(sources, ensure_ascii=False),
            )
            MessageDAO.insert(
                conversation_id=conversation_id,
                role="assistant",
                content=answer,
                sources_json=json.dumps(sources, ensure_ascii=False),
            )
            ConversationDAO.touch(conversation_id)
        except Exception:
            pass  # 数据库记录失败不影响主流程

    return {"answer": answer, "sources": sources}


def generate_quiz(
    document_content: str,
    question_count: int = 5,
    document_name: str = "",
    topic_filter: Optional[str] = None,
) -> List[Dict]:
    """
    基于文档内容生成题目。
    
    Args:
        document_content: 文档全文
        question_count: 题目数量
        document_name: 文档名（用于 source 字段）
        topic_filter: 知识点筛选（可选）
    
    Returns:
        [{"type": str, "question": str, ...}, ...]
    """
    # 截断过长内容（保留前后各 6000 字符）
    max_len = 12000
    if len(document_content) > max_len:
        half = max_len // 2
        document_content = document_content[:half] + "\n...(中间省略)...\n" + document_content[-half:]

    prompt = f"请基于以下文档内容生成 {question_count} 道测评题目。\n\n文档名称：{document_name}\n\n文档内容：\n{document_content}"
    if topic_filter:
        prompt += f"\n\n请优先覆盖以下知识点：{topic_filter}"

    messages = [
        {"role": "system", "content": SYSTEM_QUIZ_MAKER},
        {"role": "user", "content": prompt},
    ]

    raw = _call_llm(messages, temperature=0.5, json_mode=True)
    try:
        data = _safe_json(raw)
        return data.get("questions", [])
    except json.JSONDecodeError:
        # 如果 JSON 解析失败，返回空列表
        return []


def grade_answers(
    questions: List[Dict],
    user_answers: Dict[int, str],
) -> List[Dict]:
    """
    批量评判答案。
    
    Args:
        questions: 题目列表 [{"type": str, "question": str, "answer": str, ...}, ...]
        user_answers: {question_index: user_answer}
    
    Returns:
        [{"question_index": int, "is_correct": bool, "score": float, "feedback": str}, ...]
    """
    # 先处理选择题和判断题（可本地精确匹配，节省 API 调用）
    results = []
    llm_questions = []  # 需要 LLM 评判的简答题

    for i, q in enumerate(questions):
        user_ans = user_answers.get(i)

        if q["type"] == "choice":
            is_correct = (user_ans is not None and int(user_ans) == q["answer"])
            results.append({
                "question_index": i,
                "is_correct": is_correct,
                "score": 1.0 if is_correct else 0.0,
                "feedback": "回答正确" if is_correct else f"正确答案是选项 {['A','B','C','D'][q['answer']]}",
            })

        elif q["type"] == "tf":
            is_correct = (user_ans == q["answer"])
            results.append({
                "question_index": i,
                "is_correct": is_correct,
                "score": 1.0 if is_correct else 0.0,
                "feedback": "判断正确" if is_correct else f"正确答案是 {'正确' if q['answer'] == 'correct' else '错误'}",
            })

        else:
            llm_questions.append((i, q, user_ans))

    # 简答题交给 LLM 评判
    if llm_questions:
        eval_text = ""
        for orig_i, q, user_ans in llm_questions:
            eval_text += f"\n题目 {orig_i}: {q['question']}\n参考答案: {q['answer']}\n学生回答: {user_ans or '(未作答)'}\n"

        messages = [
            {"role": "system", "content": SYSTEM_GRADER},
            {"role": "user", "content": f"请评判以下简答题：{eval_text}"},
        ]

        raw = _call_llm(messages, temperature=0.2, json_mode=True)
        try:
            grade_data = _safe_json(raw)
            # grade_data 可能是数组或对象
            if isinstance(grade_data, list):
                for item in grade_data:
                    results.append(item)
            elif isinstance(grade_data, dict) and "results" in grade_data:
                for item in grade_data["results"]:
                    results.append(item)
        except json.JSONDecodeError:
            # 解析失败，默认给 0 分
            for orig_i, q, _ in llm_questions:
                results.append({
                    "question_index": orig_i,
                    "is_correct": False,
                    "score": 0.0,
                    "feedback": "评分系统异常，请联系管理员",
                })

    # 按 question_index 排序
    results.sort(key=lambda x: x["question_index"])
    return results
