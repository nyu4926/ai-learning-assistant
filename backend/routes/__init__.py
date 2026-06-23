"""路由包 — 导出所有蓝图。"""

from .materials import materials_bp
from .chat import chat_bp
from .quiz import quiz_bp
from .progress import progress_bp
from .report import report_bp

__all__ = ["materials_bp", "chat_bp", "quiz_bp", "progress_bp", "report_bp"]
