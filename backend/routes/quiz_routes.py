import json
from datetime import datetime
from flask import Blueprint, request, jsonify

from backend.models.database import (
    DocumentDAO,
    DocumentChunkDAO,
    AssessmentDAO,
    AssessmentQuestionDAO,
    LearningProgressDAO,
    KnowledgePointDAO,
)
from backend.services.claude_service import generate_quiz, grade_answers

quiz_bp = Blueprint("quiz", __name__, url_prefix="/api")


# ── 辅助 ────────────────────────────────────────────────────────

def _hide_answer(q: dict) -> dict:
    """移除正确答案字段，返回给前端"""
    safe = {k: v for k, v in q.items() if k != "answer"}
    return safe


def _extract_knowledge_points(questions: list) -> list[str]:
    """从题目列表中提取去重的知识点名称"""
    seen = set()
    result = []
    for q in questions:
        kp = q.get("knowledge_point", "")
        if kp and kp not in seen:
            seen.add(kp)
            result.append(kp)
    return result


def _determine_grade(score: float) -> str:
    if score >= 90:
        return "A"
    elif score >= 75:
        return "B"
    elif score >= 60:
        return "C"
    return "D"


def _update_knowledge_level(
    doc_id: int, kp_name: str, is_correct: bool
):
    """根据单题正误更新知识点掌握等级"""
    kps = KnowledgePointDAO.find_by_document(doc_id)
    existing = next((k for k in kps if k["name"] == kp_name), None)

    if existing:
        new_quiz_count = existing["quiz_count"] + 1
        new_correct = existing["correct_rate"] * existing["quiz_count"] + (1 if is_correct else 0)
        new_rate = round(new_correct / new_quiz_count, 3)

        # 根据正确率定级
        if new_rate >= 0.85:
            level = "mastered"
        elif new_rate >= 0.65:
            level = "familiar"
        elif new_rate >= 0.4:
            level = "learning"
        elif existing["quiz_count"] >= 3 and new_rate < 0.4:
            level = "weak"
        else:
            level = existing["level"]

        KnowledgePointDAO.upsert(
            doc_id,
            kp_name,
            level=level,
            correct_rate=new_rate,
            quiz_count=new_quiz_count,
            last_tested_at=datetime.now().isoformat(),
        )
    else:
        KnowledgePointDAO.upsert(
            doc_id,
            kp_name,
            level="mastered" if is_correct else "learning",
            correct_rate=1.0 if is_correct else 0.0,
            quiz_count=1,
            last_tested_at=datetime.now().isoformat(),
        )


# ═══════════════════════════════════════════════════════════════
#  测评 CRUD
# ═══════════════════════════════════════════════════════════════

@quiz_bp.route("/assessments", methods=["POST"])
def create_assessment():
    """
    创建测评（AI 出题）。
    
    输入: { "document_id": int, "count": int (default 8) }
    """
    data = request.get_json(silent=True) or {}
    doc_id = data.get("document_id")
    if not doc_id:
        return jsonify({"error": "document_id 为必填项"}), 400

    doc = DocumentDAO.find(doc_id)
    if not doc:
        return jsonify({"error": "文档不存在"}), 404
    if doc["parse_status"] != "done":
        return jsonify({"error": "文档尚未解析完成"}), 400

    count = min(max(int(data.get("count", 8)), 3), 15)

    # 拼接全文
    chunks = DocumentChunkDAO.find_by_document(doc_id)
    full_text = "\n\n".join(c["content"] for c in chunks)

    # AI 出题
    questions = generate_quiz(
        document_content=full_text,
        question_count=count,
        document_name=doc["original_name"],
    )

    if not questions:
        return jsonify({"error": "AI 出题失败，请重试"}), 500

    # 创建测评记录
    now = datetime.now().isoformat()
    assessment_id = AssessmentDAO.insert(
        document_id=doc_id,
        status="in_progress",
        question_count=len(questions),
        started_at=now,
    )

    # 写入题目（含正确答案，供后端评判使用）
    for i, q in enumerate(questions):
        AssessmentQuestionDAO.insert(
            assessment_id=assessment_id,
            question_index=i,
            question_type=q.get("type", "choice"),
            difficulty=q.get("difficulty", "medium"),
            topic=q.get("knowledge_point", ""),
            question_text=q.get("question", ""),
            options_json=json.dumps(q.get("options", []), ensure_ascii=False),
            correct_answer=str(q.get("answer", "")),
        )

    # 提取知识点大纲写入数据库
    kp_list = _extract_knowledge_points(questions)
    for kp_name in kp_list:
        KnowledgePointDAO.upsert(doc_id, kp_name)

    # 返回题目时隐藏正确答案
    safe_questions = [_hide_answer(q) for q in questions]

    return jsonify({
        "assessment_id": assessment_id,
        "document_id": doc_id,
        "document_name": doc["original_name"],
        "count": len(safe_questions),
        "knowledge_points": kp_list,
        "questions": safe_questions,
    }), 201


@quiz_bp.route("/assessments/<int:assessment_id>", methods=["GET"])
def get_assessment(assessment_id: int):
    """获取测评详情（含题目，隐藏正确答案）"""
    assessment = AssessmentDAO.find(assessment_id)
    if not assessment:
        return jsonify({"error": "测评不存在"}), 404

    questions = AssessmentQuestionDAO.find_by_assessment(assessment_id)
    safe_questions = [_hide_answer(dict(q)) for q in questions]

    return jsonify({
        "id": assessment["id"],
        "document_id": assessment["document_id"],
        "status": assessment["status"],
        "question_count": assessment["question_count"],
        "correct_count": assessment["correct_count"],
        "score": assessment["score"],
        "grade": assessment["grade"],
        "duration_sec": assessment["duration_sec"],
        "started_at": assessment["started_at"],
        "completed_at": assessment["completed_at"],
        "questions": safe_questions,
    })


@quiz_bp.route("/assessments/<int:assessment_id>/submit", methods=["POST"])
def submit_assessment(assessment_id: int):
    """
    提交答案（AI 评判）。
    
    输入: {
        "answers": { "0": "1", "1": "correct", "2": "简答题回答..." },
        "duration_sec": 300
    }
    """
    assessment = AssessmentDAO.find(assessment_id)
    if not assessment:
        return jsonify({"error": "测评不存在"}), 404
    if assessment["status"] == "completed":
        return jsonify({"error": "测评已完成，不可重复提交"}), 400

    data = request.get_json(silent=True) or {}
    user_answers = data.get("answers", {})
    duration_sec = int(data.get("duration_sec", 0))

    # 获取题目（含正确答案）
    questions_raw = AssessmentQuestionDAO.find_by_assessment(assessment_id)
    questions = [dict(q) for q in questions_raw]

    # AI 评判
    grades = grade_answers(questions, {int(k): v for k, v in user_answers.items()})

    # 更新题目记录
    correct_count = 0
    for g in grades:
        qi = g["question_index"]
        is_correct = g["is_correct"]
        if is_correct:
            correct_count += 1

        AssessmentQuestionDAO.update(
            questions[qi]["id"],
            user_answer=str(user_answers.get(str(qi), "")),
            is_correct=1 if is_correct else 0,
            feedback=g.get("feedback", ""),
        )

        # 更新知识点掌握等级
        doc_id = assessment["document_id"]
        kp_name = questions[qi].get("topic", "")
        if kp_name:
            _update_knowledge_level(doc_id, kp_name, is_correct)

    # 计算总分
    total = len(questions)
    score = round((correct_count / total) * 100, 1) if total > 0 else 0.0
    grade = _determine_grade(score)
    now = datetime.now().isoformat()

    # 更新测评状态
    AssessmentDAO.update(
        assessment_id,
        status="completed",
        correct_count=correct_count,
        score=score,
        grade=grade,
        duration_sec=duration_sec,
        completed_at=now,
    )

    # 更新学习进度
    progress = LearningProgressDAO.find_by_document(assessment["document_id"])
    if progress:
        new_status = "completed" if score >= 80 else "review_needed"
        new_quiz_count = (progress.get("quiz_count") or 0) + 1
        total_score = (progress.get("avg_score") or 0) * (new_quiz_count - 1) + score
        new_avg = round(total_score / new_quiz_count, 1)
        new_best = max(progress.get("best_score") or 0, score)

        summary = (
            f"\n[{now[:10]}] 测评 #{assessment_id} — "
            f"得分 {score}（{grade}级）· 用时 {duration_sec // 60} 分 · "
            f"答对 {correct_count}/{total}"
        )
        new_notes = (progress.get("notes") or "") + summary

        LearningProgressDAO.upsert(
            assessment["document_id"],
            status=new_status,
            quiz_count=new_quiz_count,
            best_score=new_best,
            avg_score=new_avg,
            notes=new_notes,
            last_study_at=now,
            updated_at=now,
        )

    # 构建逐题反馈
    question_feedback = []
    for g in grades:
        qi = g["question_index"]
        q = questions[qi]
        question_feedback.append({
            "question_index": qi,
            "type": q["question_type"],
            "question": q["question_text"],
            "is_correct": g["is_correct"],
            "score": g["score"],
            "feedback": g.get("feedback", ""),
            "correct_answer": q["correct_answer"] if q["question_type"] != "short" else q["correct_answer"],
        })

    return jsonify({
        "assessment_id": assessment_id,
        "score": score,
        "grade": grade,
        "correct_count": correct_count,
        "total": total,
        "duration_sec": duration_sec,
        "questions": question_feedback,
    })


@quiz_bp.route("/assessments/history", methods=["GET"])
def history():
    """测评历史"""
    doc_id = request.args.get("document_id", type=int)
    limit = min(int(request.args.get("limit", 20)), 50)

    from backend.models.database import get_db
    conn = get_db()
    if doc_id:
        rows = conn.execute(
            """SELECT a.*, d.original_name as document_name
               FROM assessments a
               LEFT JOIN documents d ON a.document_id = d.id
               WHERE a.document_id = ? AND a.status = 'completed'
               ORDER BY a.completed_at DESC LIMIT ?""",
            (doc_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT a.*, d.original_name as document_name
               FROM assessments a
               LEFT JOIN documents d ON a.document_id = d.id
               WHERE a.status = 'completed'
               ORDER BY a.completed_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()

    return jsonify([
        {
            "id": r["id"],
            "document_id": r["document_id"],
            "document_name": r["document_name"],
            "score": r["score"],
            "grade": r["grade"],
            "question_count": r["question_count"],
            "correct_count": r["correct_count"],
            "duration_sec": r["duration_sec"],
            "completed_at": r["completed_at"],
        }
        for r in rows
    ])
