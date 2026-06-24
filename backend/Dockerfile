# ============================================
# AI 学习助手 - Docker 生产镜像（API embedding 版）
# 适合 Render / Railway 等低内存平台
# ============================================
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpoppler-cpp-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p instance uploads chroma_data

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "2", "--timeout", "120", "app:create_app()"]
