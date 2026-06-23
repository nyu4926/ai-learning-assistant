"""消息表 — 对应需求文档 3.3"""

import uuid
from datetime import datetime, timezone

from extensions import db


class ChatMessage(db.Model):
    __tablename__ = "chat_messages"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = db.Column(
        db.String(36), db.ForeignKey("chat_sessions.id"), nullable=False
    )
    role = db.Column(db.String(20), nullable=False)  # user / assistant
    content = db.Column(db.Text, nullable=False)
    sources = db.Column(db.JSON, default=list)  # AI 回复引用的资料来源
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "role": self.role,
            "content": self.content,
            "timestamp": self.created_at.isoformat() if self.created_at else None,
            "sources": self.sources or [],
        }
