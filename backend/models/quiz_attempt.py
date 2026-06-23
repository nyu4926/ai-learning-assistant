"""答题记录表 — 对应需求文档 3.5"""

import uuid
from datetime import datetime, timezone

from extensions import db


class QuizAttempt(db.Model):
    __tablename__ = "quiz_attempts"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    quiz_id = db.Column(
        db.String(36), db.ForeignKey("quizzes.id"), nullable=False
    )
    answers_json = db.Column(db.JSON, default=list)  # 用户的作答
    score = db.Column(db.Float, default=0)
    total_score = db.Column(db.Float, default=0)
    details_json = db.Column(db.JSON, default=list)  # 每道题批改详情
    completed_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "attempt_id": self.id,
            "quiz_id": self.quiz_id,
            "score": self.score,
            "total_score": self.total_score,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }

    def to_result_dict(self):
        """历史成绩列表用的精简格式"""
        return {
            "quiz_id": self.quiz_id,
            "date": self.completed_at.isoformat() if self.completed_at else None,
            "score": self.score,
            "total": self.total_score,
            "question_count": len(self.details_json) if self.details_json else 0,
        }
