from flask import Blueprint, request, jsonify

from config import TOP_K
from backend.models.database import (
    ConversationDAO,
    MessageDAO,
    DocumentDAO,
    LearningProgressDAO,
    StudySessionDAO,
)
from backend.services.vector_store import VectorStore
from backend.services.claude_service import chat_qa
from datetime import datetime

chat_bp = Blueprint("chat", __name__, url_prefix="/api/conversations")


# ═══════════════════════════════════════════════════════════════
#  对话 CRUD
# ═══════════════════════════════════════════════════════════════

@chat_bp.route("", methods=["POST"])
def create():
    """创建对话"""
    data = request.get_json(silent=True) or {}
    title = data.get("title", "新对话")
    doc_id = data.get("document_id")

    conv_id = ConversationDAO.insert(
        title=title,
        document_id=doc_id,
    )
    return jsonify({"id": conv_id, "title": title}), 201


@chat_bp.route("", methods=["GET"])
def list_all():
    """对话列表"""
    convs = ConversationDAO.recent()
    result = []
    for c in convs:
        result.append({
            "id": c["id"],
            "title": c["title"],
            "document_id": c["document_id"],
            "message_count": c["message_count"],
            "created_at": c["created_at"],
            "updated_at": c["updated_at"],
        })
    return jsonify(result)


@chat_bp.route("/<int:conv_id>", methods=["GET"])
def detail(conv_id: int):
    """对话详情（含消息历史）"""
    conv = ConversationDAO.find(conv_id)
    if not conv:
        return jsonify({"error": "对话不存在"}), 404

    messages = MessageDAO.find_by_conversation(conv_id)
    return jsonify({
        "id": conv["id"],
        "title": conv["title"],
        "document_id": conv["document_id"],
        "created_at": conv["created_at"],
        "updated_at": conv["updated_at"],
        "messages": [
            {
                "id": m["id"],
                "role": m["role"],
                "content": m["content"],
                "sources": m["sources_json"],
                "created_at": m["created_at"],
            }
            for m in messages
        ],
    })


@chat_bp.route("/<int:conv_id>", methods=["DELETE"])
def delete(conv_id: int):
    """删除对话（级联删除消息）"""
    conv = ConversationDAO.find(conv_id)
    if not conv:
        return jsonify({"error": "对话不存在"}), 404
    ConversationDAO.delete(conv_id)
    return jsonify({"success": True, "message": "对话已删除"})


@chat_bp.route("/<int:conv_id>/title", methods=["PUT"])
def update_title(conv_id: int):
    """修改对话标题"""
    conv = ConversationDAO.find(conv_id)
    if not conv:
        return jsonify({"error": "对话不存在"}), 404

    data = request.get_json(silent=True) or {}
    title = data.get("title", "").strip()
    if not title:
        return jsonify({"error": "标题不能为空"}), 400

    ConversationDAO.update(conv_id, title=title)
    return jsonify({"success": True, "title": title})


# ═══════════════════════════════════════════════════════════════
#  RAG 消息
# ═══════════════════════════════════════════════════════════════

@chat_bp.route("/<int:conv_id>/messages", methods=["POST"])
def send_message(conv_id: int):
    """
    RAG 对话核心。
    
    输入: { "message": str, "document_id": int|null }
    流程: 检索 → 过滤低相关 → 拼上下文 → LLM → 记录数据库 → 更新进度
    """
    conv = ConversationDAO.find(conv_id)
    if not conv:
        return jsonify({"error": "对话不存在"}), 404

    data = request.get_json(silent=True) or {}
    question = (data.get("message") or "").strip()
    doc_id = data.get("document_id") or conv.get("document_id")

    if not question:
        return jsonify({"error": "消息不能为空"}), 400

    # 1. 检索相关文档片段
    context_chunks = []
    if doc_id:
        results = VectorStore.search(doc_id, question, top_k=TOP_K)
        # 过滤低相关度（distance < 0.3 时相似度很低，丢弃）
        context_chunks = [
            {"content": r["content"], "metadata": r["metadata"]}
            for r in results
            if r["distance"] < 0.3
        ]
    else:
        # 跨全部已解析文档检索
        docs = DocumentDAO.find_by_status("done")
        doc_ids = [d["id"] for d in docs]
        results = VectorStore.search_across_documents(
            doc_ids, question, top_k=TOP_K
        )
        context_chunks = [
            {"content": r["content"], "metadata": r["metadata"]}
            for r in results
            if r["distance"] < 0.3
        ]

    # 2. 获取历史消息（最近 10 轮）
    history_msgs = MessageDAO.find_by_conversation(conv_id)
    history = [
        {"role": m["role"], "content": m["content"]}
        for m in history_msgs[-20:]  # 最多 10 轮（20 条）
    ]

    # 3. LLM 回答
    result = chat_qa(
        question=question,
        context_chunks=context_chunks,
        history=history,
        conversation_id=conv_id,
    )

    # 4. 更新学习进度（如果有关联文档）
    if doc_id:
        _update_progress(doc_id, "chat")

    return jsonify({
        "answer": result["answer"],
        "sources": result["sources"],
    })


# ── 辅助 ────────────────────────────────────────────────────────

def _update_progress(doc_id: int, action: str):
    """更新文档学习进度和会话记录"""
    now = datetime.now().isoformat()
    doc = DocumentDAO.find(doc_id)
    if not doc:
        return

    # 标记进度为 in_progress
    progress = LearningProgressDAO.find_by_document(doc_id)
    if progress:
        updates = {"updated_at": now}
        if progress["status"] == "not_started":
            updates["status"] = "in_progress"
        LearningProgressDAO.update(progress["id"], **updates)

    # 记录学习会话
    StudySessionDAO.insert(
        document_id=doc_id,
        action_type=action,
        started_at=now,
        ended_at=now,
    )
