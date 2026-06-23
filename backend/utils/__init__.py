"""通用辅助函数。"""

from functools import wraps
from flask import jsonify


def success_response(data=None, message="ok", code=0):
    """统一成功响应格式"""
    return jsonify({"code": code, "message": message, "data": data})


def error_response(message="error", code=-1, status=400):
    """统一错误响应格式"""
    return jsonify({"code": code, "message": message, "data": None}), status
