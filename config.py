import os
import sys


# -- .env manual parsing --------------------------------------------

def _parse_env_file(path):
    result = {}
    if not os.path.isfile(path):
        return result
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if len(value) >= 2:
                if (value.startswith('"') and value.endswith('"')) or \
                   (value.startswith("'") and value.endswith("'")):
                    value = value[1:-1]
            result[key] = value
    return result


def _resolve(key, file_vars, default=""):
    return os.environ.get(key) or file_vars.get(key) or default


# -- load .env ------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_env = _parse_env_file(os.path.join(BASE_DIR, ".env"))


# -- LLM config -----------------------------------------------------

LLM_API_KEY = _resolve("LLM_API_KEY", _env) or _resolve("ANTHROPIC_API_KEY", _env)
LLM_BASE_URL = _resolve("LLM_BASE_URL", _env, "https://api.deepseek.com/v1")
LLM_MODEL = _resolve("LLM_MODEL", _env, "deepseek-chat")
LLM_MAX_TOKENS = int(_resolve("LLM_MAX_TOKENS", _env, "4096"))


# -- Flask config ---------------------------------------------------

FLASK_HOST = _resolve("FLASK_HOST", _env, "127.0.0.1")
FLASK_PORT = int(_resolve("FLASK_PORT", _env, "5000"))
FLASK_DEBUG = _resolve("FLASK_DEBUG", _env, "false").lower() == "true"


# -- Data directories -----------------------------------------------

DATA_DIR = os.path.join(BASE_DIR, "data")
UPLOAD_DIR = _resolve("UPLOAD_DIR", _env, os.path.join(DATA_DIR, "uploads"))
VECTOR_DB_DIR = _resolve("VECTOR_DB_DIR", _env, os.path.join(DATA_DIR, "vector_db"))
REPORT_DIR = _resolve("REPORT_DIR", _env, os.path.join(DATA_DIR, "reports"))
DATABASE_PATH = _resolve("DATABASE_PATH", _env, os.path.join(DATA_DIR, "app.db"))


# -- Vector config --------------------------------------------------

TOP_K = int(_resolve("TOP_K", _env, "5"))
CHUNK_SIZE = int(_resolve("CHUNK_SIZE", _env, "800"))
CHUNK_OVERLAP = int(_resolve("CHUNK_OVERLAP", _env, "150"))
EMBEDDING_MODEL = _resolve("EMBEDDING_MODEL", _env, "all-MiniLM-L6-v2")


# -- Weekly report config -------------------------------------------

REPORT_WEEKDAY = int(_resolve("REPORT_WEEKDAY", _env, "0"))


# -- Auto-create directories ----------------------------------------

for _dir in (UPLOAD_DIR, VECTOR_DB_DIR, REPORT_DIR, os.path.dirname(DATABASE_PATH)):
    if _dir and not os.path.exists(_dir):
        os.makedirs(_dir, exist_ok=True)


# -- Quick check ----------------------------------------------------

if not LLM_API_KEY:
    print("[WARN] LLM_API_KEY not set", file=sys.stderr)
