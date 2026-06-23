"""周报模块路由 — 1 个接口"""

from datetime import datetime, timedelta

from flask import Blueprint, request

from extensions import db
from models.weekly_report import WeeklyReport
from models.material import Material
from models.quiz_attempt import QuizAttempt
from models.knowledge_progress import KnowledgeProgress
from utils import success_response, error_response

report_bp = Blueprint("report", __name__, url_prefix="/api")


@report_bp.route("/weekly-report", methods=["GET"])
def weekly_report():
    """获取/生成周报 — 接入 LLM"""
    week_start_str = request.args.get("week_start_date")

    if week_start_str:
        try:
            week_start = datetime.strptime(week_start_str, "%Y-%m-%d").date()
        except ValueError:
            return error_response("日期格式错误，应为 YYYY-MM-DD")
    else:
        today = datetime.now().date()
        week_start = today - timedelta(days=today.weekday())

    week_end = week_start + timedelta(days=6)

    # 查已有报告
    existing = WeeklyReport.query.filter_by(week_start=week_start).first()
    if existing:
        return success_response(existing.to_dict())

    # ---- 收集数据 ----
    materials = Material.query.filter(Material.status == "ready").all()
    kp_list = KnowledgeProgress.query.all()
    weak_points = [k for k in kp_list if k.accuracy < 65]
    strong_points = [k for k in kp_list if k.accuracy >= 80]

    quiz_attempts = QuizAttempt.query.order_by(QuizAttempt.completed_at.desc()).limit(20).all()
    total_quizzes = len(quiz_attempts)
    avg_score = 0
    if quiz_attempts:
        avg_score = round(sum(a.score for a in quiz_attempts) / len(quiz_attempts), 1)

    # ---- 调用 LLM 生成报告 ----
    report_data = _generate_report_with_llm(
        week_start, week_end, materials, weak_points, strong_points,
        total_quizzes, avg_score, quiz_attempts,
    )

    new_report = WeeklyReport(
        week_start=week_start,
        week_end=week_end,
        report_data=report_data,
    )
    db.session.add(new_report)
    db.session.commit()

    return success_response(new_report.to_dict())


def _generate_report_with_llm(week_start, week_end, materials, weak_points,
                               strong_points, total_quizzes, avg_score, quiz_attempts):
    """调用 LLM 生成自然语言周报"""

    # 组装数据摘要
    materials_summary = "\n".join(
        f"- 《{m.title}》({m.file_type}, {m.page_count}页)" for m in materials
    ) or "暂无资料"

    weak_summary = "\n".join(
        f"- {k.point_name}（正确率 {k.accuracy}%）" for k in weak_points
    ) or "暂无薄弱点"

    strong_summary = "\n".join(
        f"- {k.point_name}（正确率 {k.accuracy}%）" for k in strong_points
    ) or "暂无强项"

    recent_quiz = "\n".join(
        f"- 得分 {a.score}/{a.total_score}" for a in quiz_attempts[:5]
    ) or "暂无测评记录"

    prompt = f"""你是一位学习数据分析师，请根据以下学员本周的学习数据，生成一份结构化的学习周报。

## 本周数据（{week_start.isoformat()} ~ {week_end.isoformat()}）

### 学习资料
{materials_summary}

### 测评情况
- 本周完成测评：{total_quizzes} 次
- 平均分：{avg_score}
- 最近测评：
{recent_quiz}

### 知识点掌握情况
薄弱知识点（正确率 < 65%）：
{weak_summary}

掌握较好的知识点（正确率 ≥ 80%）：
{strong_summary}

## 输出要求
请用 JSON 格式输出，结构如下：
{{
  "summary": "一段话总结本周学习情况（50-100字）",
  "highlights": ["本周亮点1", "本周亮点2"],
  "weak_analysis": "薄弱点原因分析",
  "recommendations": ["下周建议1", "下周建议2", "下周建议3"],
  "study_plan": "下周学习计划（3-5条具体行动）"
}}"""

    try:
        from services.llm_service import chat_json
        result = chat_json(
            messages=[
                {"role": "system", "content": "你是一位学习数据分析师，擅长从学习数据中提炼洞察并给出可操作的建议。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
        )
    except Exception as e:
        # LLM 失败时用模板兜底
        result = {
            "summary": f"本周学习了 {len(materials)} 份资料，完成 {total_quizzes} 次测评，平均分 {avg_score}。",
            "highlights": ["持续学习，保持节奏"],
            "weak_analysis": f"有 {len(weak_points)} 个薄弱知识点需要加强。",
            "recommendations": ["重点复习薄弱知识点", "多做针对性练习", "结合资料原文重新理解"],
            "study_plan": "（AI 生成失败，请稍后重试）",
        }

    # 合并统计数据和 LLM 生成的内容
    report_data = {
        "week_range": {
            "start": week_start.isoformat(),
            "end": week_end.isoformat(),
        },
        "summary": result.get("summary", ""),
        "highlights": result.get("highlights", []),
        "materials_studied": [m.to_dict() for m in materials],
        "quiz_stats": {
            "total_quizzes": total_quizzes,
            "avg_score": avg_score,
        },
        "weak_analysis": result.get("weak_analysis", ""),
        "weak_points": [k.to_dict() for k in weak_points],
        "recommendations": result.get("recommendations", []),
        "study_plan": result.get("study_plan", ""),
    }

    return report_data
