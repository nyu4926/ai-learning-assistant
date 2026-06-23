"""周报表 — 对应需求文档 3.7"""

import uuid
from datetime import datetime, timezone

from extensions import db


class WeeklyReport(db.Model):
    __tablename__ = "weekly_reports"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    week_start = db.Column(db.Date, nullable=False)
    week_end = db.Column(db.Date, nullable=False)
    report_data = db.Column(db.JSON, nullable=False)  # 完整周报内容
    generated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "week_start": self.week_start.isoformat() if self.week_start else None,
            "week_end": self.week_end.isoformat() if self.week_end else None,
            "report_data": self.report_data,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
        }
