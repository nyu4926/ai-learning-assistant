import os
import uuid
import shutil
import traceback
from typing import Dict, Optional, List
from datetime import datetime

from config import UPLOAD_DIR
from backend.models.database import (
    get_db,
    DocumentDAO,
    DocumentChunkDAO,
    LearningProgressDAO,
    KnowledgePointDAO,
    AssessmentDAO,
    StudySessionDAO,
)
from backend.services.document_parser import (
    get_file_type,
    parse_document,
    chunk_text,
    SUPPORTED_EXTENSIONS,
)
from backend.services.vector_store import VectorStore


# ── 常量 ────────────────────────────────────────────────────────

MAX_PARSE_SIZE = 50 * 1024 * 1024  # 50MB
MAX_RETRY_ROUNDS = 3


# ═══════════════════════════════════════════════════════════════
#  上传 & 保存
# ═══════════════════════════════════════════════════════════════

def save_uploaded_file(file_obj, original_filename: str) -> str:
    """
    保存上传文件到本地，使用 UUID 避免冲突。
    
    Returns:
        保存后的文件路径
    """
    ext = os.path.splitext(original_filename)[1].lower()
    saved_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, saved_name)

    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # file_obj 可能是 Flask FileStorage 或普通文件对象
    if hasattr(file_obj, "save"):
        file_obj.save(filepath)
    else:
        with open(filepath, "wb") as f:
            shutil.copyfileobj(file_obj, f)

    return filepath


# ═══════════════════════════════════════════════════════════════
#  核心管道：上传 → 解析 → 分块 → 向量化
# ═══════════════════════════════════════════════════════════════

def process_document(file_obj, original_filename: str) -> Dict:
    """
    完整处理管道。
    
    Returns:
        {"success": bool, "doc_id": int, "chunks": int, "error": str|None}
    """
    # 1. 校验格式
    try:
        file_type = get_file_type(original_filename)
    except ValueError as e:
        return {"success": False, "doc_id": None, "chunks": 0, "error": str(e)}

    # 2. 校验大小
    file_obj.seek(0, os.SEEK_END)
    file_size = file_obj.tell()
    file_obj.seek(0)
    if file_size > MAX_PARSE_SIZE:
        return {"success": False, "doc_id": None, "chunks": 0, "error": "文件超过 50MB 限制"}

    # 3. 保存文件
    filepath = save_uploaded_file(file_obj, original_filename)

    # 4. 写入数据库记录（状态: parsing）
    doc_id = DocumentDAO.insert(
        filename=os.path.basename(filepath),
        original_name=original_filename,
        file_type=file_type,
        file_size=file_size,
        file_path=filepath,
        parse_status="parsing",
    )

    # 5. 解析 & 分块 & 向量化
    try:
        text = parse_document(filepath, file_type)
        chunks = chunk_text(text)

        if not chunks:
            raise ValueError("文档内容为空，无法提取文本")

        # 写入向量库
        chunk_dicts = [
            {
                "content": c[0],
                "metadata": {
                    "source": original_filename,
                    "chunk_index": i,
                    "char_count": c[1].get("char_count", len(c[0])),
                },
            }
            for i, c in enumerate(chunks)
        ]
        VectorStore.add_chunks(doc_id, chunk_dicts)

        # 写入 document_chunks 表
        for i, c in enumerate(chunks):
            DocumentChunkDAO.insert(
                document_id=doc_id,
                chunk_index=i,
                content=c[0],
                token_count=len(c[0]),
                metadata_json=str(c[1]),
            )

        # 更新文档状态
        DocumentDAO.update(
            doc_id,
            parse_status="done",
            chunk_count=len(chunks),
            updated_at=datetime.now().isoformat(),
        )

        # 创建初始学习进度
        LearningProgressDAO.upsert(
            doc_id,
            status="not_started",
            total_chunks=len(chunks),
            updated_at=datetime.now().isoformat(),
        )

        return {"success": True, "doc_id": doc_id, "chunks": len(chunks), "error": None}

    except Exception as e:
        traceback.print_exc()
        DocumentDAO.update(
            doc_id,
            parse_status="failed",
            updated_at=datetime.now().isoformat(),
        )
        # 清理可能写入了一半的向量数据
        VectorStore.delete_document(doc_id)
        return {"success": False, "doc_id": doc_id, "chunks": 0, "error": str(e)}


# ═══════════════════════════════════════════════════════════════
#  重试
# ═══════════════════════════════════════════════════════════════

def retry_document(doc_id: int) -> Dict:
    """
    对失败文档重新解析（最多 3 轮）。
    
    重试轮次通过检查 document_chunks 表中的历史记录推断：
    如果之前有 chunk 记录说明至少解析成功过一次。
    """
    doc = DocumentDAO.find(doc_id)
    if not doc:
        return {"success": False, "error": "文档不存在"}

    if doc["parse_status"] not in ("failed",):
        return {"success": False, "error": f"文档状态为 {doc['parse_status']}，无需重试"}

    filepath = doc["file_path"]
    if not os.path.isfile(filepath):
        return {"success": False, "error": "源文件已丢失，无法重试"}

    # 清理旧数据
    DocumentChunkDAO.delete_by_document(doc_id)
    VectorStore.delete_document(doc_id)

    # 标记为 parsing
    DocumentDAO.update(doc_id, parse_status="parsing", updated_at=datetime.now().isoformat())

    try:
        text = parse_document(filepath, doc["file_type"])
        chunks = chunk_text(text)

        if not chunks:
            raise ValueError("文档内容为空")

        chunk_dicts = [
            {
                "content": c[0],
                "metadata": {
                    "source": doc["original_name"],
                    "chunk_index": i,
                    "char_count": c[1].get("char_count", len(c[0])),
                },
            }
            for i, c in enumerate(chunks)
        ]
        VectorStore.add_chunks(doc_id, chunk_dicts)

        for i, c in enumerate(chunks):
            DocumentChunkDAO.insert(
                document_id=doc_id,
                chunk_index=i,
                content=c[0],
                token_count=len(c[0]),
                metadata_json=str(c[1]),
            )

        DocumentDAO.update(
            doc_id,
            parse_status="done",
            chunk_count=len(chunks),
            updated_at=datetime.now().isoformat(),
        )

        LearningProgressDAO.upsert(
            doc_id,
            total_chunks=len(chunks),
            updated_at=datetime.now().isoformat(),
        )

        return {"success": True, "doc_id": doc_id, "chunks": len(chunks)}

    except Exception as e:
        traceback.print_exc()
        DocumentDAO.update(
            doc_id,
            parse_status="failed",
            updated_at=datetime.now().isoformat(),
        )
        VectorStore.delete_document(doc_id)
        return {"success": False, "doc_id": doc_id, "chunks": 0, "error": str(e)}


# ═══════════════════════════════════════════════════════════════
#  删除
# ═══════════════════════════════════════════════════════════════

def delete_document(doc_id: int) -> Dict:
    """
    完整删除文档：文件 + 向量数据 + 数据库级联记录。
    """
    doc = DocumentDAO.find(doc_id)
    if not doc:
        return {"success": False, "error": "文档不存在"}

    # 1. 删除物理文件
    filepath = doc["file_path"]
    if filepath and os.path.isfile(filepath):
        try:
            os.remove(filepath)
        except OSError:
            pass

    # 2. 删除向量数据
    VectorStore.delete_document(doc_id)

    # 3. 数据库级联删除（外键自动清理 chunks / progress / sessions / kp / assessments）
    DocumentDAO.delete(doc_id)

    return {"success": True, "doc_id": doc_id}


# ═══════════════════════════════════════════════════════════════
#  查询辅助
# ═══════════════════════════════════════════════════════════════

def get_document_detail(doc_id: int) -> Optional[Dict]:
    """获取文档详情（含进度）"""
    doc = DocumentDAO.find(doc_id)
    if not doc:
        return None
    progress = LearningProgressDAO.find_by_document(doc_id)
    doc["progress"] = progress
    return doc


def list_documents(status: Optional[str] = None) -> List[Dict]:
    """列出文档，可按状态筛选"""
    if status:
        return DocumentDAO.find_by_status(status)
    return DocumentDAO.find_all(order="created_at DESC")


def get_document_chunks(doc_id: int) -> List[Dict]:
    """获取文档的所有文本块"""
    return DocumentChunkDAO.find_by_document(doc_id)
