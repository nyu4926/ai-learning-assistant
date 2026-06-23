"""文本分块服务 — 将长文本切成可检索的小段"""

from config import Config


def chunk_text(text: str, chunk_size: int = None, overlap: int = None) -> list[str]:
    """
    滑窗分块：按字符数切，保留重叠区避免语义截断。

    Args:
        text: 纯文本
        chunk_size: 每块最大字符数（默认从 Config 读）
        overlap: 相邻块重叠字符数

    Returns:
        文本块列表
    """
    if not text.strip():
        return []

    chunk_size = chunk_size or Config.CHUNK_SIZE
    overlap = overlap or Config.CHUNK_OVERLAP

    # 按段落先拆，再按 chunk_size 组装
    paragraphs = text.split("\n\n")
    chunks = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # 如果当前块 + 这段不超限，就拼进去
        if len(current) + len(para) + 2 <= chunk_size:
            current = f"{current}\n\n{para}" if current else para
        else:
            # 当前块满了，存起来
            if current:
                chunks.append(current)
            # 如果单段超长，强制切
            if len(para) > chunk_size:
                chunks.extend(_split_long_para(para, chunk_size, overlap))
                current = ""
            else:
                current = para

    if current:
        chunks.append(current)

    return chunks


def _split_long_para(para: str, chunk_size: int, overlap: int) -> list[str]:
    """对超长段落按字符滑窗切割"""
    result = []
    start = 0
    while start < len(para):
        end = start + chunk_size
        result.append(para[start:end])
        start = end - overlap
    return result
