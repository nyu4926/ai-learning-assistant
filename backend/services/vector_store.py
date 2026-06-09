import os
import chromadb
from chromadb.config import Settings as ChromaSettings
from typing import List, Dict, Optional
import threading

from config import VECTOR_DB_DIR, EMBEDDING_MODEL

# ── 强制离线模式 ────────────────────────────────────────────────

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")


# ═══════════════════════════════════════════════════════════════
#  Embedding 模型单例
# ═══════════════════════════════════════════════════════════════

_embedding_model = None
_embedding_lock = threading.Lock()


def _get_embedding_model():
    """延迟加载 Sentence-Transformers 模型（单例，线程安全）"""
    global _embedding_model
    if _embedding_model is not None:
        return _embedding_model
    
    with _embedding_lock:
        if _embedding_model is not None:
            return _embedding_model
        
        from sentence_transformers import SentenceTransformer
        
        _embedding_model = SentenceTransformer(EMBEDDING_MODEL)
        # 预热：跑一次空推理，避免首次调用卡顿
        _ = _embedding_model.encode(["warmup"], show_progress_bar=False)
        return _embedding_model


# ═══════════════════════════════════════════════════════════════
#  ChromaDB 客户端单例
# ═══════════════════════════════════════════════════════════════

_chroma_client = None
_chroma_lock = threading.Lock()


def _get_chroma_client() -> chromadb.PersistentClient:
    global _chroma_client
    if _chroma_client is not None:
        return _chroma_client
    
    with _chroma_lock:
        if _chroma_client is not None:
            return _chroma_client
        
        os.makedirs(VECTOR_DB_DIR, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(
            path=VECTOR_DB_DIR,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        return _chroma_client


# ═══════════════════════════════════════════════════════════════
#  向量存储 API
# ═══════════════════════════════════════════════════════════════

def _collection_name(doc_id: int) -> str:
    """每个文档一个 Collection"""
    return f"doc_{doc_id}"


class VectorStore:
    """ChromaDB 向量存储封装"""

    # ── 写入 ─────────────────────────────────────────────────

    @staticmethod
    def add_chunks(
        doc_id: int,
        chunks: List[Dict],
        batch_size: int = 32,
    ) -> int:
        """
        将文本块写入向量库。
        
        Args:
            doc_id: 文档 ID
            chunks: 文本块列表，每个元素为 {"content": str, "metadata": dict}
            batch_size: 批量编码大小
        
        Returns:
            写入的向量数量
        """
        if not chunks:
            return 0

        client = _get_chroma_client()
        model = _get_embedding_model()
        name = _collection_name(doc_id)

        # 删除旧 Collection（如有）以保证幂等
        try:
            client.delete_collection(name)
        except Exception:
            pass

        collection = client.create_collection(
            name=name,
            metadata={"doc_id": str(doc_id), "dim": "384"},
        )

        # 分批编码 & 写入
        total = 0
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            texts = [c["content"] for c in batch]
            metadatas = [c.get("metadata", {}) for c in batch]
            ids = [f"c{j}" for j in range(i, i + len(batch))]

            embeddings = model.encode(
                texts,
                show_progress_bar=False,
                batch_size=batch_size,
            ).tolist()

            collection.add(
                embeddings=embeddings,
                documents=texts,
                metadatas=metadatas,
                ids=ids,
            )
            total += len(batch)

        return total

    # ── 检索 ─────────────────────────────────────────────────

    @staticmethod
    def search(
        doc_id: int,
        query: str,
        top_k: int = 5,
    ) -> List[Dict]:
        """
        相似度搜索。
        
        Returns:
            [{"content": str, "metadata": dict, "distance": float}, ...]
        """
        client = _get_chroma_client()
        model = _get_embedding_model()
        name = _collection_name(doc_id)

        try:
            collection = client.get_collection(name)
        except Exception:
            return []

        query_embedding = model.encode(
            [query],
            show_progress_bar=False,
        ).tolist()

        results = collection.query(
            query_embeddings=query_embedding,
            n_results=top_k,
            include=["documents", "metadatas", "distances"],
        )

        if not results or not results["ids"] or not results["ids"][0]:
            return []

        return [
            {
                "content": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "distance": results["distances"][0][i],
            }
            for i in range(len(results["ids"][0]))
        ]

    @staticmethod
    def search_across_documents(
        doc_ids: List[int],
        query: str,
        top_k: int = 5,
    ) -> List[Dict]:
        """
        跨多个文档检索，合并排序后返回 top_k。
        """
        if not doc_ids:
            return []

        all_results: List[Dict] = []
        for doc_id in doc_ids:
            results = VectorStore.search(doc_id, query, top_k=top_k)
            for r in results:
                r["doc_id"] = doc_id
            all_results.extend(results)

        # 按 distance 升序排列（越小越相似）
        all_results.sort(key=lambda x: x["distance"])
        return all_results[:top_k]

    # ── 管理 ─────────────────────────────────────────────────

    @staticmethod
    def delete_document(doc_id: int):
        """删除文档对应的 Collection"""
        client = _get_chroma_client()
        name = _collection_name(doc_id)
        try:
            client.delete_collection(name)
        except Exception:
            pass

    @staticmethod
    def document_count(doc_id: int) -> int:
        """获取文档向量数"""
        client = _get_chroma_client()
        name = _collection_name(doc_id)
        try:
            collection = client.get_collection(name)
            return collection.count()
        except Exception:
            return 0

    @staticmethod
    def collection_exists(doc_id: int) -> bool:
        client = _get_chroma_client()
        name = _collection_name(doc_id)
        try:
            client.get_collection(name)
            return True
        except Exception:
            return False
