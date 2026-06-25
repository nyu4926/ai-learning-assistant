"""閰嶇疆绫?鈥?浠?.env 璇诲彇鐜鍙橀噺"""

import os
from pathlib import Path
from dotenv import load_dotenv

# 椤圭洰鏍圭洰褰曪紙backend/锛?BASE_DIR = Path(__file__).resolve().parent

# 鍔犺浇 .env锛堥」鐩牴鐩綍锛?load_dotenv(BASE_DIR / ".env")


class Config:
    """鍩虹閰嶇疆"""

    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")

    # 鏁版嵁搴?鈥?浣跨敤缁濆璺緞锛岄伩鍏?SQLite 鎵句笉鍒?instance/ 鐩綍
    _db_uri = os.getenv("DATABASE_URL", "")
    if _db_uri:
        SQLALCHEMY_DATABASE_URI = _db_uri
    else:
        _db_path = BASE_DIR / "instance" / "dev.db"
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{_db_path}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # LLM锛圖eepSeek 鈥?OpenAI 鍏煎锛?    LLM_API_BASE = os.getenv("LLM_API_BASE", "https://api.deepseek.com/v1")
    LLM_API_KEY = os.getenv("LLM_API_KEY") or ""
    LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")

    # Embedding API锛圤penAI 鍏煎锛岄粯璁ょ敤 OpenAI text-embedding-3-small锛?    EMBEDDING_API_KEY = os.getenv("EMBEDDING_API_KEY", "")
    EMBEDDING_API_BASE = os.getenv("EMBEDDING_API_BASE", "https://api.openai.com/v1")
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

    # 鏂囦欢涓婁紶
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads")
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 52428800))  # 50MB

    # RAG 鍒嗗潡
    CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 500))
    CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", 50))

    # 鍚戦噺鏁版嵁搴?    CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "")
    SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.3"))


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}
