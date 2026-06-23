"""对话模块路由 — 3 个接口"""

from flask import Blueprint, request

from extensions import db
from models.chat_session import ChatSession
from models.chat_message import ChatMessage
from utils import success_response, error_response

chat_bp = Blueprint("chat", __name__, url_prefix="/api/chat")


@chat_bp.route("/send", methods=["POST"])
def send():
    """发送消息 — 接入 RAG 服务"""
    data = request.get_json()
    message = data.get("message", "").strip()
    material_ids = data.get("material_ids", [])
    session_id = data.get("session_id")

    if not message:
        return error_response("消息不能为空")

    # 获取或创建会话
    if session_id:
        session = ChatSession.query.get(session_id)
        if not session:
            return error_response("会话不存在", status=404)
    else:
        session = ChatSession(
            title=message[:30],
            material_ids=material_ids,
        )
        db.session.add(session)
        db.session.flush()

    # 保存用户消息
    user_msg = ChatMessage(session_id=session.id, role="user", content=message)
    db.session.add(user_msg)
    db.session.commit()

    # ---- RAG 检索 + LLM 回复 ----
    try:
        # 取历史消息做多轮上下文
        history_msgs = (
            ChatMessage.query.filter_by(session_id=session.id)
            .order_by(ChatMessage.created_at.asc())
            .all()
        )
        history = [{"role": m.role, "content": m.content} for m in history_msgs[:-1]]  # 排除刚存的

        from services.rag_service import ask
        reply_text, sources = ask(
            question=message,
            material_ids=session.material_ids or material_ids,
            history=history,
        )
    except Exception as e:
        reply_text = f"AI 回复失败：{e}"
        sources = []

    # 保存 AI 回复
    ai_msg = ChatMessage(
        session_id=session.id, role="assistant", content=reply_text, sources=sources
    )
    db.session.add(ai_msg)
    db.session.commit()

    return success_response({
        "reply": reply_text,
        "sources": sources,
        "session_id": session.id,
    })


@chat_bp.route("/history/<session_id>", methods=["GET"])
def history(session_id):
    """获取对话历史"""
    session = ChatSession.query.get(session_id)
    if not session:
        return error_response("会话不存在", status=404)

    messages = (
        ChatMessage.query.filter_by(session_id=session_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    return success_response([m.to_dict() for m in messages])


@chat_bp.route("/sessions", methods=["GET"])
def sessions():
    """获取会话列表"""
    sessions = ChatSession.query.order_by(ChatSession.updated_at.desc()).all()
    return success_response([s.to_dict() for s in sessions])
