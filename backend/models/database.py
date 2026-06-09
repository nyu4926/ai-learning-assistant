import sqlite3
import os
import threading
from datetime import datetime
from config import DATABASE_PATH

# ── 连接管理（WAL + 外键 + 线程本地） ──────────────────────────

_local = threading.local()

def get_db() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
        conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        _local.conn = conn
    return _local.conn

def close_db():
    if hasattr(_local, "conn") and _local.conn:
        _local.conn.close()
        _local.conn = None


# ── 建表 ────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    filename        TEXT    NOT NULL,
    original_name   TEXT    NOT NULL,
    file_type       TEXT    NOT NULL,   -- pdf / pptx / docx / md / txt
    file_size       INTEGER NOT NULL,   -- bytes
    file_path       TEXT    NOT NULL,
    parse_status    TEXT    NOT NULL DEFAULT "pending",  -- pending / parsing / done / failed
    chunk_count     INTEGER DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT "",
    updated_at      TEXT    NOT NULL DEFAULT ""
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    content         TEXT    NOT NULL,
    token_count     INTEGER DEFAULT 0,
    metadata_json   TEXT    DEFAULT "{}",
    created_at      TEXT    NOT NULL DEFAULT ""
);

CREATE TABLE IF NOT EXISTS conversations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT    NOT NULL DEFAULT "新对话",
    document_id     INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    message_count   INTEGER DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT "",
    updated_at      TEXT    NOT NULL DEFAULT ""
);

CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT    NOT NULL,   -- user / assistant
    content         TEXT    NOT NULL,
    sources_json    TEXT    DEFAULT "[]",
    token_count     INTEGER DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT ""
);

CREATE TABLE IF NOT EXISTS learning_progress (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
    status          TEXT    NOT NULL DEFAULT "not_started",
                    -- not_started / in_progress / completed / review_needed
    progress_pct    REAL    DEFAULT 0.0,
    total_chunks    INTEGER DEFAULT 0,
    read_chunks     INTEGER DEFAULT 0,
    quiz_count      INTEGER DEFAULT 0,
    best_score      REAL    DEFAULT 0.0,
    avg_score       REAL    DEFAULT 0.0,
    notes           TEXT    DEFAULT "",
    last_study_at   TEXT,
    created_at      TEXT    NOT NULL DEFAULT "",
    updated_at      TEXT    NOT NULL DEFAULT ""
);

CREATE TABLE IF NOT EXISTS study_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    duration_sec    INTEGER DEFAULT 0,
    action_type     TEXT    NOT NULL,   -- chat / quiz / read
    detail_json     TEXT    DEFAULT "{}",
    started_at      TEXT    NOT NULL DEFAULT "",
    ended_at        TEXT
);

CREATE TABLE IF NOT EXISTS knowledge_points (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    name            TEXT    NOT NULL,
    level           TEXT    NOT NULL DEFAULT "unknown",
                    -- unknown / learning / familiar / mastered / weak
    correct_rate    REAL    DEFAULT 0.0,
    quiz_count      INTEGER DEFAULT 0,
    last_tested_at  TEXT,
    created_at      TEXT    NOT NULL DEFAULT "",
    updated_at      TEXT    NOT NULL DEFAULT "",
    UNIQUE(document_id, name)
);

CREATE TABLE IF NOT EXISTS assessments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    status          TEXT    NOT NULL DEFAULT "pending",
                    -- pending / in_progress / completed
    question_count  INTEGER DEFAULT 0,
    correct_count   INTEGER DEFAULT 0,
    score           REAL    DEFAULT 0.0,
    grade           TEXT,
    duration_sec    INTEGER DEFAULT 0,
    started_at      TEXT,
    completed_at    TEXT,
    created_at      TEXT    NOT NULL DEFAULT ""
);

CREATE TABLE IF NOT EXISTS assessment_questions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id   INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    question_index  INTEGER NOT NULL,
    question_type   TEXT    NOT NULL,   -- choice / tf / short
    difficulty      TEXT    NOT NULL,   -- easy / medium / hard
    topic           TEXT    NOT NULL,
    question_text   TEXT    NOT NULL,
    options_json    TEXT    DEFAULT "[]",
    correct_answer  TEXT    NOT NULL,
    user_answer     TEXT,
    is_correct      INTEGER DEFAULT 0,
    feedback        TEXT    DEFAULT "",
    created_at      TEXT    NOT NULL DEFAULT ""
);

CREATE TABLE IF NOT EXISTS weekly_reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start      TEXT    NOT NULL,
    week_end        TEXT    NOT NULL,
    content_md      TEXT    NOT NULL DEFAULT "",
    stats_json      TEXT    DEFAULT "{}",
    generated_at    TEXT    NOT NULL DEFAULT "",
    UNIQUE(week_start, week_end)
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc     ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_messages_conv  ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_progress_doc   ON learning_progress(document_id);
CREATE INDEX IF NOT EXISTS idx_sessions_doc   ON study_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_kp_doc         ON knowledge_points(document_id);
CREATE INDEX IF NOT EXISTS idx_assess_doc     ON assessments(document_id);
CREATE INDEX IF NOT EXISTS idx_aq_assess      ON assessment_questions(assessment_id);
"""

def init_db():
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()


# ═══════════════════════════════════════════════════════════════
#  DAO 基类
# ═══════════════════════════════════════════════════════════════

class BaseDAO:
    table = ""
    pk = "id"

    @staticmethod
    def _row_to_dict(row):
        return dict(row) if row else None

    @classmethod
    def _cols(cls, exclude_pk=False):
        conn = get_db()
        cur = conn.execute(f"SELECT * FROM {cls.table} LIMIT 0")
        cols = [d[0] for d in cur.description]
        if exclude_pk:
            cols = [c for c in cols if c != cls.pk]
        return cols

    @classmethod
    def find(cls, id_val):
        conn = get_db()
        row = conn.execute(f"SELECT * FROM {cls.table} WHERE {cls.pk}=?", (id_val,)).fetchone()
        return cls._row_to_dict(row)

    @classmethod
    def find_all(cls, where="", params=(), order=""):
        conn = get_db()
        sql = f"SELECT * FROM {cls.table}"
        if where:
            sql += f" WHERE {where}"
        if order:
            sql += f" ORDER BY {order}"
        rows = conn.execute(sql, params).fetchall()
        return [cls._row_to_dict(r) for r in rows]

    @classmethod
    def insert(cls, **kwargs):
        conn = get_db()
        cols = [k for k in kwargs if k != cls.pk]
        placeholders = ", ".join(["?"] * len(cols))
        sql = f"INSERT INTO {cls.table} ({', '.join(cols)}) VALUES ({placeholders})"
        cur = conn.execute(sql, [kwargs[c] for c in cols])
        conn.commit()
        return cur.lastrowid

    @classmethod
    def update(cls, id_val, **kwargs):
        conn = get_db()
        cols = [k for k in kwargs if k != cls.pk]
        sets = ", ".join([f"{c}=?" for c in cols])
        sql = f"UPDATE {cls.table} SET {sets} WHERE {cls.pk}=?"
        conn.execute(sql, [kwargs[c] for c in cols] + [id_val])
        conn.commit()

    @classmethod
    def delete(cls, id_val):
        conn = get_db()
        conn.execute(f"DELETE FROM {cls.table} WHERE {cls.pk}=?", (id_val,))
        conn.commit()

    @classmethod
    def count(cls, where="", params=()):
        conn = get_db()
        sql = f"SELECT COUNT(*) FROM {cls.table}"
        if where:
            sql += f" WHERE {where}"
        return conn.execute(sql, params).fetchone()[0]


# ═══════════════════════════════════════════════════════════════
#  各实体 DAO
# ═══════════════════════════════════════════════════════════════

class DocumentDAO(BaseDAO):
    table = "documents"

    @classmethod
    def find_by_status(cls, status):
        return cls.find_all("parse_status=?", (status,), "created_at DESC")

    @classmethod
    def search(cls, keyword):
        return cls.find_all("original_name LIKE ?", (f"%{keyword}%",), "created_at DESC")


class DocumentChunkDAO(BaseDAO):
    table = "document_chunks"

    @classmethod
    def find_by_document(cls, doc_id):
        return cls.find_all("document_id=?", (doc_id,), "chunk_index ASC")

    @classmethod
    def find_by_ids(cls, chunk_ids):
        if not chunk_ids:
            return []
        conn = get_db()
        placeholders = ",".join(["?"] * len(chunk_ids))
        rows = conn.execute(
            f"SELECT * FROM {cls.table} WHERE id IN ({placeholders})",
            chunk_ids
        ).fetchall()
        return [cls._row_to_dict(r) for r in rows]

    @classmethod
    def delete_by_document(cls, doc_id):
        conn = get_db()
        conn.execute(f"DELETE FROM {cls.table} WHERE document_id=?", (doc_id,))
        conn.commit()


class ConversationDAO(BaseDAO):
    table = "conversations"

    @classmethod
    def recent(cls, limit=20):
        return cls.find_all(order="updated_at DESC", params=())  # no where needed
    # override: no where clause

    @classmethod
    def recent(cls, limit=20):
        conn = get_db()
        rows = conn.execute(
            f"SELECT * FROM {cls.table} ORDER BY updated_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
        return [cls._row_to_dict(r) for r in rows]

    @classmethod
    def touch(cls, conv_id):
        conn = get_db()
        conn.execute(
            f"UPDATE {cls.table} SET updated_at=datetime('now') WHERE {cls.pk}=?",
            (conv_id,)
        )
        conn.commit()


class MessageDAO(BaseDAO):
    table = "messages"

    @classmethod
    def find_by_conversation(cls, conv_id):
        return cls.find_all("conversation_id=?", (conv_id,), "created_at ASC")


class LearningProgressDAO(BaseDAO):
    table = "learning_progress"

    @classmethod
    def find_by_document(cls, doc_id):
        row = get_db().execute(f"SELECT * FROM {cls.table} WHERE document_id=?", (doc_id,)).fetchone()
        return cls._row_to_dict(row)

    @classmethod
    def upsert(cls, doc_id, **kwargs):
        existing = cls.find_by_document(doc_id)
        if existing:
            cls.update(existing["id"], **kwargs)
            return existing["id"]
        else:
            return cls.insert(document_id=doc_id, **kwargs)


class StudySessionDAO(BaseDAO):
    table = "study_sessions"

    @classmethod
    def find_by_document(cls, doc_id, limit=20):
        conn = get_db()
        rows = conn.execute(
            f"SELECT * FROM {cls.table} WHERE document_id=? ORDER BY started_at DESC LIMIT ?",
            (doc_id, limit)
        ).fetchall()
        return [cls._row_to_dict(r) for r in rows]

    @classmethod
    def total_duration(cls, doc_id=None):
        conn = get_db()
        if doc_id:
            row = conn.execute(
                f"SELECT COALESCE(SUM(duration_sec), 0) FROM {cls.table} WHERE document_id=?",
                (doc_id,)
            ).fetchone()
        else:
            row = conn.execute(
                f"SELECT COALESCE(SUM(duration_sec), 0) FROM {cls.table}"
            ).fetchone()
        return row[0]


class KnowledgePointDAO(BaseDAO):
    table = "knowledge_points"

    @classmethod
    def find_by_document(cls, doc_id):
        return cls.find_all("document_id=?", (doc_id,), "name ASC")

    @classmethod
    def find_weak(cls, threshold=0.6):
        return cls.find_all("correct_rate < ? AND quiz_count > 0", (threshold,), "correct_rate ASC")

    @classmethod
    def upsert(cls, doc_id, name, **kwargs):
        conn = get_db()
        row = conn.execute(
            f"SELECT * FROM {cls.table} WHERE document_id=? AND name=?",
            (doc_id, name)
        ).fetchone()
        if row:
            kp_id = row["id"]
            cls.update(kp_id, **kwargs)
            return kp_id
        else:
            return cls.insert(document_id=doc_id, name=name, **kwargs)


class AssessmentDAO(BaseDAO):
    table = "assessments"

    @classmethod
    def find_by_document(cls, doc_id):
        return cls.find_all("document_id=?", (doc_id,), "created_at DESC")

    @classmethod
    def stats_for_document(cls, doc_id):
        conn = get_db()
        row = conn.execute("""
            SELECT COUNT(*) as total,
                   COALESCE(AVG(score), 0) as avg_score,
                   COALESCE(MAX(score), 0) as max_score
            FROM assessments
            WHERE document_id=? AND status="completed"
        """, (doc_id,)).fetchone()
        return {"total": row[0], "avg_score": round(row[1], 1), "max_score": round(row[2], 1)}


class AssessmentQuestionDAO(BaseDAO):
    table = "assessment_questions"

    @classmethod
    def find_by_assessment(cls, assessment_id):
        return cls.find_all("assessment_id=?", (assessment_id,), "question_index ASC")


class WeeklyReportDAO(BaseDAO):
    table = "weekly_reports"

    @classmethod
    def find_by_week(cls, week_start):
        conn = get_db()
        row = conn.execute(
            f"SELECT * FROM {cls.table} WHERE week_start=?",
            (week_start,)
        ).fetchone()
        return cls._row_to_dict(row)

    @classmethod
    def recent(cls, limit=10):
        return cls.find_all(order="week_start DESC", params=())  # no where


# ── 启动初始化 ─────────────────────────────────────────────────

init_db()
