import json
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify

from backend.models.database import (
    get_db,
    DocumentDAO,
    LearningProgressDAO,
    KnowledgePointDAO,
    AssessmentDAO,
    StudySessionDAO,
    WeeklyReportDAO,
)
from backend.services.claude_service import _call_llm

progress_bp = Blueprint("progress", __name__, url_prefix="/api")


# ═══════════════════════════════════════════════════════════════
#  进度接口
# ═══════════════════════════════════════════════════════════════

@progress_bp.route("/progress", methods=["GET"])
def list_progress():
    """所有文档进度（含测评统计）"""
    docs = DocumentDAO.find_all(order="created_at DESC")
    result = []
    for doc in docs:
        progress = LearningProgressDAO.find_by_document(doc["id"])
        quiz_stats = AssessmentDAO.stats_for_document(doc["id"])
        result.append({
            "document_id": doc["id"],
            "document_name": doc["original_name"],
            "file_type": doc["file_type"],
            "parse_status": doc["parse_status"],
            "chunk_count": doc["chunk_count"],
            "progress": progress,
            "quiz_stats": quiz_stats,
        })
    return jsonify(result)


@progress_bp.route("/progress/stats", methods=["GET"])
def global_stats():
    """全局统计数据"""
    conn = get_db()

    total_docs = DocumentDAO.count()
    parsed_docs = DocumentDAO.count("parse_status='done'")
    failed_docs = DocumentDAO.count("parse_status='failed'")

    quiz_stats = conn.execute("""
        SELECT COUNT(*) as total,
               COALESCE(AVG(score), 0) as avg_score
        FROM assessments WHERE status='completed'
    """).fetchone()

    total_duration = StudySessionDAO.total_duration()

    progress_status = conn.execute("""
        SELECT status, COUNT(*) as cnt
        FROM learning_progress GROUP BY status
    """).fetchall()
    status_map = {r["status"]: r["cnt"] for r in progress_status}

    return jsonify({
        "documents": {
            "total": total_docs,
            "parsed": parsed_docs,
            "failed": failed_docs,
        },
        "quizzes": {
            "total": quiz_stats["total"],
            "avg_score": round(quiz_stats["avg_score"], 1),
        },
        "study_duration_sec": total_duration,
        "progress_breakdown": {
            "not_started": status_map.get("not_started", 0),
            "in_progress": status_map.get("in_progress", 0),
            "completed": status_map.get("completed", 0),
            "review_needed": status_map.get("review_needed", 0),
        },
    })


@progress_bp.route("/progress/<int:doc_id>", methods=["PUT"])
def update_progress(doc_id: int):
    """更新单个文档的进度"""
    data = request.get_json(silent=True) or {}
    allowed = {"status", "progress_pct", "read_chunks", "notes", "last_study_at"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return jsonify({"error": "无可更新的字段"}), 400
    updates["updated_at"] = datetime.now().isoformat()

    progress_id = LearningProgressDAO.upsert(doc_id, **updates)
    return jsonify({"success": True, "progress_id": progress_id})


@progress_bp.route("/progress/overview", methods=["GET"])
def progress_overview():
    """进度总览：统计 + 最近测评 + 掌握度分布"""
    conn = get_db()

    # 全局统计
    total_docs = DocumentDAO.count("parse_status='done'")
    completed = LearningProgressDAO.count("status='completed'")
    in_progress = LearningProgressDAO.count("status='in_progress'")

    # 最近 5 次测评
    recent_quizzes = conn.execute("""
        SELECT a.*, d.original_name as document_name
        FROM assessments a
        LEFT JOIN documents d ON a.document_id = d.id
        WHERE a.status='completed'
        ORDER BY a.completed_at DESC LIMIT 5
    """).fetchall()

    # 掌握度分布
    mastery_dist = conn.execute("""
        SELECT level, COUNT(*) as cnt
        FROM knowledge_points GROUP BY level
    """).fetchall()
    mastery_map = {r["level"]: r["cnt"] for r in mastery_dist}

    # 总学习时长（近 7 天）
    week_ago = (datetime.now() - timedelta(days=7)).isoformat()
    week_duration = conn.execute("""
        SELECT COALESCE(SUM(duration_sec), 0)
        FROM study_sessions WHERE started_at >= ?
    """, (week_ago,)).fetchone()[0]

    return jsonify({
        "summary": {
            "total_docs": total_docs,
            "completed": completed,
            "in_progress": in_progress,
            "completion_rate": round(completed / total_docs * 100, 1) if total_docs else 0,
        },
        "recent_quizzes": [
            {
                "id": r["id"],
                "document_name": r["document_name"],
                "score": r["score"],
                "grade": r["grade"],
                "completed_at": r["completed_at"],
            }
            for r in recent_quizzes
        ],
        "mastery_distribution": {
            "mastered": mastery_map.get("mastered", 0),
            "familiar": mastery_map.get("familiar", 0),
            "learning": mastery_map.get("learning", 0),
            "weak": mastery_map.get("weak", 0),
            "unknown": mastery_map.get("unknown", 0),
        },
        "week_duration_sec": week_duration,
    })


# ═══════════════════════════════════════════════════════════════
#  知识点接口
# ═══════════════════════════════════════════════════════════════

@progress_bp.route("/knowledge/weak", methods=["GET"])
def weak_knowledge():
    """薄弱知识点（正确率 < 60% 且至少测评 1 次）"""
    threshold = request.args.get("threshold", 0.6, type=float)
    items = KnowledgePointDAO.find_weak(threshold)
    return jsonify([
        {
            "id": kp["id"],
            "document_id": kp["document_id"],
            "name": kp["name"],
            "level": kp["level"],
            "correct_rate": kp["correct_rate"],
            "quiz_count": kp["quiz_count"],
        }
        for kp in items
    ])


@progress_bp.route("/knowledge/mastery", methods=["GET"])
def knowledge_mastery():
    """知识点掌握度（可按文档过滤）"""
    doc_id = request.args.get("document_id", type=int)
    if doc_id:
        items = KnowledgePointDAO.find_by_document(doc_id)
    else:
        items = KnowledgePointDAO.find_all(order="correct_rate ASC")
    return jsonify([
        {
            "id": kp["id"],
            "document_id": kp["document_id"],
            "name": kp["name"],
            "level": kp["level"],
            "correct_rate": kp["correct_rate"],
            "quiz_count": kp["quiz_count"],
            "last_tested_at": kp["last_tested_at"],
        }
        for kp in items
    ])


# ═══════════════════════════════════════════════════════════════
#  周报接口
# ═══════════════════════════════════════════════════════════════

@progress_bp.route("/reports/generate", methods=["POST"])
def generate_report():
    """生成周报"""
    data = request.get_json(silent=True) or {}
    week_start = data.get("week_start")
    week_end = data.get("week_end")

    if not week_start:
        # 默认本周一 → 今天
        today = datetime.now().date()
        monday = today - timedelta(days=today.weekday())
        week_start = monday.isoformat()
    if not week_end:
        week_end = datetime.now().date().isoformat()

    # 收集数据
    conn = get_db()

    # 测评统计
    quiz_row = conn.execute("""
        SELECT COUNT(*) as total,
               COALESCE(AVG(score), 0) as avg_score,
               COALESCE(MAX(score), 0) as max_score
        FROM assessments
        WHERE status='completed'
          AND completed_at >= ? AND completed_at <= ?
    """, (week_start, week_end + "T23:59:59")).fetchone()

    # 学习时长
    duration = conn.execute("""
        SELECT COALESCE(SUM(duration_sec), 0)
        FROM study_sessions
        WHERE started_at >= ? AND started_at <= ?
    """, (week_start, week_end + "T23:59:59")).fetchone()[0]

    # 薄弱知识点
    weak = KnowledgePointDAO.find_weak(0.6)

    # 文档进度
    docs = DocumentDAO.find_by_status("done")
    progress_summary = []
    for doc in docs[:10]:
        p = LearningProgressDAO.find_by_document(doc["id"])
        s = AssessmentDAO.stats_for_document(doc["id"])
        progress_summary.append(f"- {doc['original_name']}: {p['status'] if p else '未开始'}（测评 {s['total']} 次 · 均分 {s['avg_score']}）")

    # 构建 Markdown
    md = f"""# 📊 学习周报

**时间范围：** {week_start} — {week_end}
**生成时间：** {datetime.now().strftime('%Y-%m-%d %H:%M')}

## 总体概况

| 指标 | 数值 |
|------|------|
| 测评次数 | {quiz_row['total']} 次 |
| 平均得分 | {round(quiz_row['avg_score'], 1)} 分 |
| 最高得分 | {round(quiz_row['max_score'], 1)} 分 |
| 学习时长 | {duration // 60} 分钟 |

## 文档进度

{chr(10).join(progress_summary) if progress_summary else '暂无数据'}

## 薄弱知识点

{chr(10).join(f'- {kp["name"]}（正确率 {kp["correct_rate"]*100:.0f}%）' for kp in weak[:5]) if weak else '暂无薄弱知识点'}

---

*报告由 AI 学习助手自动生成*
"""

    # 写入数据库
    stats = {
        "quiz_total": quiz_row["total"],
        "avg_score": round(quiz_row["avg_score"], 1),
        "max_score": round(quiz_row["max_score"], 1),
        "duration_sec": duration,
        "weak_count": len(weak),
    }

    try:
        report_id = WeeklyReportDAO.insert(
            week_start=week_start,
            week_end=week_end,
            content_md=md,
            stats_json=json.dumps(stats, ensure_ascii=False),
        )
    except Exception:
        # 本周已存在则更新
        existing = WeeklyReportDAO.find_by_week(week_start)
        if existing:
            WeeklyReportDAO.update(
                existing["id"],
                content_md=md,
                stats_json=json.dumps(stats, ensure_ascii=False),
            )
            report_id = existing["id"]
        else:
            raise

    return jsonify({
        "report_id": report_id,
        "week_start": week_start,
        "week_end": week_end,
        "content": md,
        "stats": stats,
    }), 201


@progress_bp.route("/reports", methods=["GET"])
def list_reports():
    """周报列表"""
    reports = WeeklyReportDAO.recent()
    return jsonify([
        {
            "id": r["id"],
            "week_start": r["week_start"],
            "week_end": r["week_end"],
            "stats": json.loads(r["stats_json"]) if r["stats_json"] else {},
            "generated_at": r["generated_at"],
        }
        for r in reports
    ])


@progress_bp.route("/reports/<int:report_id>", methods=["GET"])
def get_report(report_id: int):
    """单条周报（含完整 Markdown）"""
    report = WeeklyReportDAO.find(report_id)
    if not report:
        return jsonify({"error": "周报不存在"}), 404
    return jsonify({
        "id": report["id"],
        "week_start": report["week_start"],
        "week_end": report["week_end"],
        "content": report["content_md"],
        "stats": json.loads(report["stats_json"]) if report["stats_json"] else {},
        "generated_at": report["generated_at"],
    })
