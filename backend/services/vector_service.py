"""向量存储服务 — ChromaDB + OpenAI 兼容 Embedding API

使用 ChromaDB 自带的 OpenAIEmbeddingFunction，
不依赖本地模型，适合低内存环境（如 Render 免费版）。
"""

import os
from pathlib import Path

import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

from config import Config

# ---- 全局单例 ----
_client = None
_collection = None
_ef = None

SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.3"))


def _get_ef():
    """懒加载 OpenAI 兼容的 embedding 函数"""
    global _ef
    if _ef is None:
        api_key = os.getenv("EMBEDDING_API_KEY") or os.getenv("LLM_API_KEY") or ""
        if api_key and "CHROMA_OPENAI_API_KEY" not in os.environ:
            os.environ["CHROMA_OPENAI_API_KEY"] = api_key
        _ef = OpenAIEmbeddingFunction(
            api_key=api_key,
            api_base=os.getenv("EMBEDDING_API_BASE", "https://api.openai.com/v1"),
            model_name=os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"),
        )
    return _ef


def _get_collection() -> chromadb.Collection:
    """获取 ChromaDB collection（懒初始化）"""
    global _client, _collection
    if _collection is not None:
        return _collection

    chroma_dir = Config.CHROMA_PERSIST_DIR or str(
        Path(__file__).resolve().parent.parent / "chroma_data"
    )
    _client = chromadb.PersistentClient(path=chroma_dir)

    ef = _get_ef()
    _collection = _client.get_or_create_collection(
        name="learning_materials",
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"},
    )
    return _collection


def store_chunks(material_id: str, chunks: list[str]):
    """将文本块向量化并存入 ChromaDB"""
    if not chunks:
        return

    collection = _get_collection()
    ids = [f"{material_id}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [{"material_id": material_id, "chunk_index": i} for i in range(len(chunks))]

    delete_by_material(material_id)

    collection.add(
        ids=ids,
        documents=chunks,
        metadatas=metadatas,
    )


def search(query: str, material_ids: list[str] = None, top_k: int = 5,
           threshold: float = None) -> list[dict]:
    """用查询文本检索最相关的文本块"""
    threshold = threshold if threshold is not None else SIMILARITY_THRESHOLD
    collection = _get_collection()

    where_filter = None
    if material_ids:
        where_filter = {"material_id": {"$in": material_ids}}

    results = collection.query(
        query_texts=[query],
        n_results=top_k,
        where=where_filter,
        include=["documents", "distances", "metadatas"],
    )

    items = []
    if results and results["documents"]:
        docs = results["documents"][0]
        dists = results["distances"][0]
        metas = results["metadatas"][0]
        for doc, dist, meta in zip(docs, dists, metas):
            similarity = 1 - dist
            if similarity >= threshold:
                items.append({
                    "text": doc,
                    "score": round(similarity, 4),
                    "material_id": meta.get("material_id", ""),
                })

    return items


def delete_by_material(material_id: str):
    """删除某份资料的所有向量块"""
    collection = _get_collection()
    results = collection.get(
        where={"material_id": material_id},
        include=[],
    )
    if results and results["ids"]:
        collection.delete(ids=results["ids"])
