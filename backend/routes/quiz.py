"""测评模块路由 — 3 个接口"""

from flask import Blueprint, request

from extensions import db
from models.quiz import Quiz
from models.quiz_attempt import QuizAttempt
from utils import success_response, error_response

quiz_bp = Blueprint("quiz", __name__, url_prefix="/api/quiz")


@quiz_bp.route("/generate", methods=["POST"])
def generate():
    """生成试卷 — 接入 LLM 出题服务"""
    data = request.get_json()
    material_ids = data.get("material_ids", [])
    types = data.get("types", ["choice", "judge", "essay"])
    counts = data.get("counts", {})

    # 计算总题数
    if isinstance(counts, dict) and counts:
        total_count = sum(counts.values())
    else:
        total_count = 10

    try:
        from services.quiz_service import generate_questions
        questions = generate_questions(material_ids, total_count=total_count)
    except Exception as e:
        return error_response(f"出题失败：{e}", status=500)

    quiz = Quiz(
        material_ids=material_ids,
        questions_json=questions,
        total_questions=len(questions),
    )
    db.session.add(quiz)
    db.session.commit()

    return success_response({
        "quiz_id": quiz.id,
        "questions": questions,
    })


@quiz_bp.route("/submit", methods=["POST"])
def submit():
    """提交答卷 — 接入 LLM 改卷服务"""
    data = request.get_json()
    quiz_id = data.get("quiz_id")
    answers = data.get("answers", [])

    quiz = Quiz.query.get(quiz_id)
    if not quiz:
        return error_response("试卷不存在", status=404)

    questions = quiz.questions_json or []

    try:
        from services.grade_service import grade
        result = grade(
            questions=questions,
            user_answers=answers,
            material_ids=quiz.material_ids or [],
        )
    except Exception as e:
        # LLM 改卷失败，退回简单匹配
        result = _fallback_grade(questions, answers)

    # 从结果中提取数据
    details = result.get("details", [])
    feedback = result.get("feedback", "")
    summary = result.get("summary", {})

    # 计算得分
    score = summary.get("total_score", sum(d.get("score", 0) for d in details))
    total_score = summary.get("max_score", len(questions))

    attempt = QuizAttempt(
        quiz_id=quiz_id,
        answers_json=answers,
        score=score,
        total_score=total_score,
        details_json=details,
    )
    db.session.add(attempt)
    db.session.commit()

    # 返回格式与前端 quiz.js 对齐
    response_details = []
    for d in details:
        response_details.append({
            "question_id": d.get("question_id", ""),
            "correct": d.get("is_correct", False),
            "score": d.get("score", 0),
            "comment": d.get("comment", ""),
        })

    return success_response({
        "score": score,
        "total": total_score,
        "details": response_details,
        "feedback": feedback,
    })


def _fallback_grade(questions: list, answers: list) -> dict:
    """LLM 改卷失败时的兜底：客观题简单匹配"""
    details = []
    score = 0
    total = len(questions)

    for q in questions:
        user_ans = next(
            (a["user_answer"] for a in answers if a.get("question_id") == q.get("id")), ""
        )
        is_correct = str(user_ans).strip().lower() == str(q.get("answer", "")).strip().lower()
        s = 1 if is_correct else 0
        score += s
        details.append({
            "question_id": q.get("id", ""),
            "type": q.get("type", ""),
            "user_answer": user_ans,
            "correct_answer": q.get("answer", ""),
            "is_correct": is_correct,
            "score": s,
            "comment": "✅ 正确" if is_correct else f"❌ 错误，正确答案：{q.get('answer', '')}",
        })

    return {
        "summary": {"total_score": score, "max_score": total},
        "details": details,
        "feedback": "（自动批改模式，简答题未评分）",
    }


@quiz_bp.route("/results", methods=["GET"])
def results():
    """获取历史成绩"""
    material_id = request.args.get("material_id")
    limit = request.args.get("limit", 20, type=int)

    query = QuizAttempt.query.order_by(QuizAttempt.completed_at.desc())
    if material_id:
        query = query.join(Quiz).filter(
            Quiz.material_ids.contains(material_id)
        )
    attempts = query.limit(limit).all()
    return success_response([a.to_result_dict() for a in attempts])
