"""资料表 — 对应需求文档 3.1"""

import uuid
from datetime import datetime, timezone

from extensions import db


class Material(db.Model):
    __tablename__ = "materials"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = db.Column(db.String(255), nullable=False)
    file_type = db.Column(db.String(20), nullable=False)  # pdf / ppt / markdown
    file_path = db.Column(db.String(512), default="")
    content_text = db.Column(db.Text, default="")
    chunks_json = db.Column(db.JSON, default=list)  # 分块后的文本片段
    tags = db.Column(db.JSON, default=list)  # 标签数组
    status = db.Column(db.String(20), default="uploading")  # uploading/parsing/ready/error
    page_count = db.Column(db.Integer, default=0)
    upload_time = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ---- 关系 ----
    knowledge_points = db.relationship(
        "KnowledgeProgress", backref="material", lazy="dynamic"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "type": self.file_type,
            "tags": self.tags or [],
            "upload_time": self.upload_time.isoformat() if self.upload_time else None,
            "page_count": self.page_count,
            "status": self.status,
        }

    def to_detail_dict(self):
        """详情接口：含全文 + 分块"""
        d = self.to_dict()
        d["content"] = self.content_text
        d["chunks"] = self.chunks_json or []
        d["metadata"] = {
            "file_path": self.file_path,
            "page_count": self.page_count,
        }
        return d
