"""会话表 — 对应需求文档 3.2"""

import uuid
from datetime import datetime, timezone

from extensions import db


class ChatSession(db.Model):
    __tablename__ = "chat_sessions"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), default="default_user")  # 预留多用户
    title = db.Column(db.String(255), default="")
    material_ids = db.Column(db.JSON, default=list)  # 关联资料 ID 列表
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ---- 关系 ----
    messages = db.relationship(
        "ChatMessage", backref="session", lazy="dynamic", cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "session_id": self.id,
            "title": self.title,
            "last_time": self.updated_at.isoformat() if self.updated_at else None,
            "material_count": len(self.material_ids) if self.material_ids else 0,
        }
