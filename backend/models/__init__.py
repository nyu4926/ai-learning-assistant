"""数据模型包 — 导出所有模型供 app.py 一键注册。"""

from .material import Material
from .chat_session import ChatSession
from .chat_message import ChatMessage
from .quiz import Quiz
from .quiz_attempt import QuizAttempt
from .knowledge_progress import KnowledgeProgress
from .weekly_report import WeeklyReport

__all__ = [
    "Material",
    "ChatSession",
    "ChatMessage",
    "Quiz",
    "QuizAttempt",
    "KnowledgeProgress",
    "WeeklyReport",
]
