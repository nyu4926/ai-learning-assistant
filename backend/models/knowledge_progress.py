"""知识点进度表 — 对应需求文档 3.6"""

import uuid
from datetime import datetime, timezone

from extensions import db


class KnowledgeProgress(db.Model):
    __tablename__ = "knowledge_progress"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    material_id = db.Column(
        db.String(36), db.ForeignKey("materials.id"), nullable=False
    )
    point_name = db.Column(db.String(255), nullable=False)
    total_asked = db.Column(db.Integer, default=0)
    correct_count = db.Column(db.Integer, default=0)
    accuracy = db.Column(db.Float, default=0)  # = correct_count / total_asked
    last_updated = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "material_id": self.material_id,
            "point_name": self.point_name,
            "total_asked": self.total_asked,
            "correct_count": self.correct_count,
            "accuracy": round(self.accuracy, 2) if self.accuracy else 0,
        }
