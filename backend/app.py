import os
import sys

# 确保项目根目录在 sys.path 中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS

from config import (
    FLASK_HOST,
    FLASK_PORT,
    FLASK_DEBUG,
    LLM_API_KEY,
    LLM_MODEL,
    LLM_BASE_URL,
    BASE_DIR,
)


def create_app() -> Flask:
    app = Flask(
        __name__,
        static_folder=os.path.join(BASE_DIR, "frontend"),
        static_url_path="",
    )
    app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024

    # CORS
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # ── 注册蓝图 ──────────────────────────────────────────

    from backend.routes.document_routes import doc_bp
    from backend.routes.chat_routes import chat_bp
    from backend.routes.quiz_routes import quiz_bp
    from backend.routes.progress_routes import progress_bp

    app.register_blueprint(doc_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(quiz_bp)
    app.register_blueprint(progress_bp)

    # ── 健康检查 ──────────────────────────────────────────

    @app.route("/api/health")
    def health():
        return jsonify({
            "status": "ok",
            "llm": {
                "configured": bool(LLM_API_KEY),
                "model": LLM_MODEL,
                "base_url": LLM_BASE_URL,
            },
        })

    # ── 前端 SPA ──────────────────────────────────────────

    @app.route("/")
    @app.route("/<path:path>")
    def serve_frontend(path="index.html"):
        static_dir = app.static_folder
        if not static_dir or not os.path.isdir(static_dir):
            return jsonify({"error": "前端文件未找到"}), 404

        # API 路径不处理
        if request.path.startswith("/api/"):
            return jsonify({"error": "接口不存在"}), 404

        # 真实文件直接返回
        if path and path != "index.html":
            file_path = os.path.join(static_dir, path)
            if os.path.isfile(file_path):
                return send_from_directory(static_dir, path)

        # SPA 回退
        index_path = os.path.join(static_dir, "index.html")
        if os.path.isfile(index_path):
            return send_from_directory(static_dir, "index.html")

        return jsonify({"error": "index.html 不存在"}), 404

    # ── 全局错误处理 ──────────────────────────────────────

    @app.errorhandler(404)
    def not_found(e):
        if request.path.startswith("/api/"):
            return jsonify({"error": "接口不存在"}), 404
        static_dir = app.static_folder
        if static_dir and os.path.isfile(os.path.join(static_dir, "index.html")):
            return send_from_directory(static_dir, "index.html")
        return jsonify({"error": "页面不存在"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "服务器内部错误"}), 500

    @app.errorhandler(413)
    def too_large(e):
        return jsonify({"error": "上传文件过大，限制 100MB"}), 413

    return app


# ── 入口 ─────────────────────────────────────────────────────

app = create_app()

if __name__ == "__main__":
    from backend.models.database import init_db
    init_db()
    print(f"  Database initialized")
    print(f"  Server: http://{FLASK_HOST}:{FLASK_PORT}")
    print(f"  Health:  http://{FLASK_HOST}:{FLASK_PORT}/api/health")
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG)
