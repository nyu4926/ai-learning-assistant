"""服务层包"""

# 已实现：
# - parser_service: 文件解析（PDF/PPT/Word/Markdown/TXT 提取文本）
# - chunk_service: 文本滑窗分块
# - vector_service: ChromaDB 向量存储 + all-MiniLM-L6-v2 嵌入 + 余弦检索
# - llm_service: DeepSeek LLM 调用封装（自动重试3次 + 去除 ```json``` 包裹）
# - rag_service: RAG 检索增强生成（向量检索 + 学习导师提示词 + 多轮上下文）
# - quiz_service: 出题服务（严谨命题官提示词，1/4判断+1/2选择+1/4简答）
# - grade_service: 改卷服务（公正阅卷官提示词，客观题匹配+简答题三档评分）
