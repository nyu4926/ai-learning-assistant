from flask import Blueprint, request, jsonify

from backend.services.document_service import (
    process_document,
    retry_document,
    delete_document,
    get_document_detail,
    list_documents,
    get_document_chunks,
)
from backend.services.document_parser import SUPPORTED_EXTENSIONS

doc_bp = Blueprint("documents", __name__, url_prefix="/api/documents")


# ── 辅助 ────────────────────────────────────────────────────────

def _is_allowed(filename: str) -> bool:
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in SUPPORTED_EXTENSIONS or ext == ".markdown"


def _to_doc_dict(doc: dict) -> dict:
    """将 DB row 转为 API 响应格式"""
    return {
        "id": doc["id"],
        "original_name": doc["original_name"],
        "file_type": doc["file_type"],
        "file_size": doc["file_size"],
        "parse_status": doc["parse_status"],
        "chunk_count": doc["chunk_count"],
        "created_at": doc["created_at"],
        "updated_at": doc["updated_at"],
        "progress": doc.get("progress"),
    }


# ── 路由 ────────────────────────────────────────────────────────

@doc_bp.route("", methods=["POST"])
def upload():
    """上传文档"""
    if "file" not in request.files:
        return jsonify({"error": "缺少上传文件，字段名: file"}), 400

    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"error": "未选择文件"}), 400

    if not _is_allowed(file.filename):
        ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "未知"
        supported = ", ".join(SUPPORTED_EXTENSIONS.keys())
        return jsonify({"error": f"不支持的文件格式: .{ext}（支持: {supported}）"}), 400

    result = process_document(file, file.filename)

    if result["success"]:
        return jsonify({
            "success": True,
            "doc_id": result["doc_id"],
            "chunks": result["chunks"],
            "message": f"文档已上传，解析出 {result['chunks']} 个文本块",
        }), 201
    else:
        return jsonify({
            "success": False,
            "doc_id": result.get("doc_id"),
            "error": result["error"],
        }), 422


@doc_bp.route("", methods=["GET"])
def list_all():
    """文档列表"""
    status_filter = request.args.get("status")
    docs = list_documents(status=status_filter)
    return jsonify([_to_doc_dict(d) for d in docs])


@doc_bp.route("/<int:doc_id>", methods=["GET"])
def detail(doc_id: int):
    """文档详情（含进度和文本块）"""
    doc = get_document_detail(doc_id)
    if not doc:
        return jsonify({"error": "文档不存在"}), 404
    result = _to_doc_dict(doc)
    result["chunks"] = get_document_chunks(doc_id)
    return jsonify(result)


@doc_bp.route("/<int:doc_id>", methods=["DELETE"])
def delete(doc_id: int):
    """删除文档"""
    result = delete_document(doc_id)
    if result["success"]:
        return jsonify({"success": True, "message": "文档已删除"})
    return jsonify({"error": result.get("error", "删除失败")}), 404


@doc_bp.route("/<int:doc_id>/reparse", methods=["POST"])
def reparse(doc_id: int):
    """重新解析失败文档"""
    result = retry_document(doc_id)
    if result["success"]:
        return jsonify({
            "success": True,
            "doc_id": result["doc_id"],
            "chunks": result["chunks"],
            "message": f"重新解析完成，{result['chunks']} 个文本块",
        })
    return jsonify({
        "success": False,
        "error": result.get("error", "重解析失败"),
    }), 422
