"""进度模块路由 — 2 个接口"""

from flask import Blueprint, request

from extensions import db
from models.material import Material
from models.knowledge_progress import KnowledgeProgress
from models.quiz_attempt import QuizAttempt
from utils import success_response, error_response

progress_bp = Blueprint("progress", __name__, url_prefix="/api/progress")


@progress_bp.route("/overview", methods=["GET"])
def overview():
    """进度总览"""
    total_materials = Material.query.count()
    ready_materials = Material.query.filter_by(status="ready").count()
    total_quizzes = QuizAttempt.query.count()
    weak_points = KnowledgeProgress.query.filter(KnowledgeProgress.accuracy < 65).all()

    # 计算平均正确率
    all_kp = KnowledgeProgress.query.all()
    if all_kp:
        avg_accuracy = sum(k.accuracy for k in all_kp) / len(all_kp)
    else:
        avg_accuracy = 0

    return success_response({
        "materials_learned": ready_materials,
        "materials_total": total_materials,
        "quizzes_taken": total_quizzes,
        "accuracy_rate": round(avg_accuracy, 1),
        "weak_points": [k.to_dict() for k in weak_points],
    })


@progress_bp.route("/detail/<material_id>", methods=["GET"])
def detail(material_id):
    """单份资料进度"""
    material = Material.query.get(material_id)
    if not material:
        return error_response("资料不存在", status=404)

    knowledge_points = KnowledgeProgress.query.filter_by(material_id=material_id).all()
    quiz_history = (
        QuizAttempt.query.join(
            "quiz"
        ).filter(
            # 简化：所有答题记录
            QuizAttempt.quiz_id.isnot(None)
        ).order_by(QuizAttempt.completed_at.desc()).limit(10).all()
    )

    # 掌握度
    if knowledge_points:
        mastery = sum(k.accuracy for k in knowledge_points) / len(knowledge_points)
    else:
        mastery = 0

    return success_response({
        "material_id": material_id,
        "title": material.title,
        "mastery_percent": round(mastery, 1),
        "quiz_history": [a.to_result_dict() for a in quiz_history],
        "knowledge_points": [k.to_dict() for k in knowledge_points],
    })
