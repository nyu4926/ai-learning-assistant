"""LLM 调用服务 — DeepSeek API（OpenAI 兼容格式）

核心能力：
- 调用 DeepSeek 大模型（通过 OpenAI SDK）
- 自动重试最多 3 次
- 自动去除 AI 返回的 ```json``` 包裹
- 解析 JSON 响应
"""

import json
import re
import time

from openai import OpenAI

from config import Config

# 全局单例
_client = None

MAX_RETRIES = 3
RETRY_DELAY = 2  # 秒


def _get_client() -> OpenAI:
    """懒初始化 OpenAI 客户端"""
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=Config.LLM_API_KEY,
            base_url=Config.LLM_API_BASE,
        )
    return _client


def chat(messages: list[dict], temperature: float = 0.7, max_tokens: int = 4096) -> str:
    """
    调用 LLM，返回纯文本回复。

    Args:
        messages: [{"role": "system"|"user"|"assistant", "content": "..."}]

    Returns:
        AI 回复文本
    """
    client = _get_client()

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = client.chat.completions.create(
                model=Config.LLM_MODEL,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            if attempt < MAX_RETRIES:
                print(f"[LLM] 调用失败（第{attempt}次），{RETRY_DELAY}s后重试: {e}")
                time.sleep(RETRY_DELAY)
            else:
                raise RuntimeError(f"LLM 调用失败（已重试{MAX_RETRIES}次）: {e}")


def chat_json(messages: list[dict], temperature: float = 0.3) -> dict | list:
    """
    调用 LLM 并解析 JSON 响应。
    自动去除 ```json ... ``` 包裹。

    Args:
        messages: 同 chat()

    Returns:
        解析后的 dict 或 list
    """
    raw = chat(messages, temperature=temperature)

    # 去掉 ```json ... ``` 包裹
    cleaned = strip_json_block(raw)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        # 尝试从文本中提取第一个 JSON 对象/数组
        extracted = _extract_json_from_text(cleaned)
        if extracted is not None:
            return extracted
        raise ValueError(f"LLM 返回的不是合法 JSON: {e}\n原文: {raw[:200]}")


def strip_json_block(text: str) -> str:
    """去掉 ```json ... ``` 或 ``` ... ``` 包裹"""
    # 匹配 ```json ... ``` 或 ``` ... ```（多行）
    m = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    return text.strip()


def _extract_json_from_text(text: str) -> dict | list | None:
    """从文本中尝试提取第一个 { ... } 或 [ ... ]"""
    for start_char, end_char in [("{", "}"), ("[", "]")]:
        start = text.find(start_char)
        if start == -1:
            continue
        # 从后往前找匹配的结束符
        depth = 0
        for i in range(start, len(text)):
            if text[i] == start_char:
                depth += 1
            elif text[i] == end_char:
                depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    break
    return None
