"""Flask 应用入口 — app factory 模式"""

import os
import time
import click

from flask import Flask, jsonify, render_template, send_from_directory
from flask_cors import CORS

from config import config_map
from extensions import db


def create_app(config_name=None):
    """创建 Flask 应用实例"""

    if config_name is None:
        config_name = os.getenv("FLASK_ENV", "development")

    app = Flask(__name__)
    app.config.from_object(config_map[config_name])

    # CORS
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # 初始化扩展
    db.init_app(app)

    # 注册蓝图
    from routes.materials import materials_bp
    from routes.chat import chat_bp
    from routes.quiz import quiz_bp
    from routes.progress import progress_bp
    from routes.report import report_bp

    app.register_blueprint(materials_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(quiz_bp)
    app.register_blueprint(progress_bp)
    app.register_blueprint(report_bp)

    # 健康检查接口
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"code": 0, "message": "ok", "data": {"status": "running"}})

    # ========== 前端页面路由 ==========

    @app.route("/")
    def index():
        """首页"""
        return render_template("index.html", version=int(time.time()))

    @app.route("/static/<path:filename>")
    def static_files(filename):
        """静态文件 (JS/CSS)"""
        return send_from_directory("static", filename)

    # ========== CLI 命令 ==========

    @app.cli.command("init-db")
    def init_db():
        """创建所有数据库表"""
        with app.app_context():
            from models import (
                Material,
                ChatSession,
                ChatMessage,
                Quiz,
                QuizAttempt,
                KnowledgeProgress,
                WeeklyReport,
            )
            db.create_all()
            click.echo("数据库表已创建")

    # 确保 instance 目录存在并自动创建数据库表
    with app.app_context():
        instance_dir = os.path.join(app.root_path, "instance")
        os.makedirs(instance_dir, exist_ok=True)

        from models import (
            Material,
            ChatSession,
            ChatMessage,
            Quiz,
            QuizAttempt,
            KnowledgeProgress,
            WeeklyReport,
        )
        db.create_all()

    return app

# 直接运行入口
if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=True)