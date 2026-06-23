"""试卷表 — 对应需求文档 3.4"""

import uuid
from datetime import datetime, timezone

from extensions import db


class Quiz(db.Model):
    __tablename__ = "quizzes"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    material_ids = db.Column(db.JSON, default=list)  # 出题依据的资料 ID
    questions_json = db.Column(db.JSON, default=list)  # 题目数组
    total_questions = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # ---- 关系 ----
    attempts = db.relationship(
        "QuizAttempt", backref="quiz", lazy="dynamic", cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "quiz_id": self.id,
            "material_ids": self.material_ids or [],
            "total_questions": self.total_questions,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
