"""配置类 — 从 .env 读取环境变量"""

import os
from pathlib import Path
from dotenv import load_dotenv

# 项目根目录（backend/）
BASE_DIR = Path(__file__).resolve().parent

# 加载 .env（项目根目录）
load_dotenv(BASE_DIR / ".env")


class Config:
    """基础配置"""

    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")

    # 数据库 — 使用绝对路径，避免 SQLite 找不到 instance/ 目录
    _db_uri = os.getenv("DATABASE_URL", "")
    if _db_uri:
        SQLALCHEMY_DATABASE_URI = _db_uri
    else:
        _db_path = BASE_DIR / "instance" / "dev.db"
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{_db_path}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # LLM（DeepSeek — OpenAI 兼容）
    LLM_API_BASE = os.getenv("LLM_API_BASE", "https://api.deepseek.com/v1")
    LLM_API_KEY = os.getenv("LLM_API_KEY") or ""
    LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")

    # Embedding API（OpenAI 兼容，默认用 OpenAI text-embedding-3-small）
    EMBEDDING_API_KEY = os.getenv("EMBEDDING_API_KEY", "")
    EMBEDDING_API_BASE = os.getenv("EMBEDDING_API_BASE", "https://api.openai.com/v1")
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

    # 文件上传
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads")
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 52428800))  # 50MB

    # RAG 分块
    CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 500))
    CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", 50))

    # 向量数据库
    CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "")
    SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.3"))


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}