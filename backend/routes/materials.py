"""资料模块路由 — 4 个接口"""

import os
import json
import threading

from flask import Blueprint, request, current_app

from extensions import db
from models.material import Material
from utils import success_response, error_response

materials_bp = Blueprint("materials", __name__, url_prefix="/api/materials")


# ---- 后台处理：提取文本 → 分块 → 向量化 ----

def _process_material(app, material_id):
    """
    在后台线程中跑：解析 → 分块 → 向量化 → 更新状态。
    必须在 app context 中运行。
    """
    with app.app_context():
        material = Material.query.get(material_id)
        if not material:
            return

        try:
            # 1. 解析文件提取文本
            from services.parser_service import extract_text
            text, page_count = extract_text(material.file_path)

            material.content_text = text
            material.page_count = page_count
            material.status = "parsing"
            db.session.commit()

            # 2. 分块
            from services.chunk_service import chunk_text
            chunks = chunk_text(text)
            material.chunks_json = chunks
            db.session.commit()

            # 3. 向量化存入 ChromaDB
            from services.vector_service import store_chunks
            store_chunks(material_id, chunks)

            # 4. 标记完成
            material.status = "ready"
            db.session.commit()

        except Exception as e:
            # 解析失败，标记 error
            material.status = "error"
            db.session.commit()
            print(f"[Material] 处理失败 {material_id}: {e}")


@materials_bp.route("/upload", methods=["POST"])
def upload():
    """上传资料 — multipart/form-data"""
    file = request.files.get("file")
    if not file:
        return error_response("缺少文件", status=400)

    filename = request.form.get("filename", file.filename)
    tags_raw = request.form.get("tags", "[]")
    try:
        tags = json.loads(tags_raw)
    except (json.JSONDecodeError, TypeError):
        tags = []

    # 判断文件类型
    ext = os.path.splitext(filename)[1].lower()
    type_map = {
        ".pdf": "pdf",
        ".pptx": "ppt", ".ppt": "ppt",
        ".docx": "word", ".doc": "word",
        ".md": "markdown", ".markdown": "markdown",
        ".txt": "txt",
    }
    file_type = type_map.get(ext, "txt")

    # 保存文件
    upload_dir = os.path.join(current_app.root_path, current_app.config["UPLOAD_FOLDER"])
    os.makedirs(upload_dir, exist_ok=True)
    save_path = os.path.join(upload_dir, filename)
    file.save(save_path)

    # 创建数据库记录（状态先标 uploading）
    material = Material(
        title=filename,
        file_type=file_type,
        file_path=save_path,
        tags=tags,
        status="uploading",
    )
    db.session.add(material)
    db.session.commit()

    # 后台线程处理：提取 → 分块 → 向量化
    app = current_app._get_current_object()
    t = threading.Thread(target=_process_material, args=(app, material.id), daemon=True)
    t.start()

    return success_response({
        "material_id": material.id,
        "title": material.title,
        "status": material.status,
    })


@materials_bp.route("/list", methods=["GET"])
def list_materials():
    """获取资料列表"""
    materials = Material.query.order_by(Material.upload_time.desc()).all()
    return success_response([m.to_dict() for m in materials])


@materials_bp.route("/<material_id>", methods=["GET"])
def get_detail(material_id):
    """获取资料详情+全文"""
    material = Material.query.get(material_id)
    if not material:
        return error_response("资料不存在", status=404)
    return success_response(material.to_detail_dict())


@materials_bp.route("/<material_id>", methods=["DELETE"])
def delete_material(material_id):
    """删除资料 — 文件 + 向量 + 数据库记录一起删"""
    material = Material.query.get(material_id)
    if not material:
        return error_response("资料不存在", status=404)

    # 1. 删除文件
    if material.file_path and os.path.exists(material.file_path):
        os.remove(material.file_path)

    # 2. 删除 ChromaDB 中的向量
    try:
        from services.vector_service import delete_by_material
        delete_by_material(material_id)
    except Exception as e:
        print(f"[Material] 删除向量失败 {material_id}: {e}")

    # 3. 删除数据库记录（级联删知识点等）
    db.session.delete(material)
    db.session.commit()

    return success_response({"success": True})
