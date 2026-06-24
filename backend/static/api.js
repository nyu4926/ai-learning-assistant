/* ============================================
   api.js — 后台请求封装
   ============================================ */

const API = (() => {
  // 后台基础地址（本地开发指向 Flask 5000 端口，部署时改为实际地址）
  const BASE_URL = "https://ai-learning-assistant-production-33d4.up.railway.app";

  // 请求配置
  const DEFAULT_HEADERS = {
    'Content-Type': 'application/json',
    // Authorization: `Bearer ${getToken()}`,  // V1 暂不做鉴权
  };

  /**
   * 核心请求方法
   * @param {string} method - GET / POST / PUT / DELETE
   * @param {string} endpoint - 接口路径（不含前缀）
   * @param {object|null} data - POST/PUT 的 body 数据
   * @param {object} extraHeaders - 额外请求头
   * @returns {Promise<any>}
   */
  async function request(method, endpoint, data = null, extraHeaders = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const options = {
      method,
      headers: { ...DEFAULT_HEADERS, ...extraHeaders },
    };

    if (data !== null && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    try {
      const res = await fetch(url, options);
      const json = await res.json();

      if (!res.ok) {
        console.error(`[API] ${method} ${endpoint} → ${res.status}`, json);
        throw new ApiError(json.message || '请求失败', res.status, json);
      }
      return json;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      console.error(`[API] 网络错误: ${method} ${endpoint}`, err);
      throw new ApiError('网络连接失败，请检查后台是否启动', 0);
    }
  }

  /** 自定义 API 错误类 */
  class ApiError extends Error {
    constructor(message, code, data) {
      super(message);
      this.name = 'ApiError';
      this.code = code;     // HTTP 状态码
      this.data = data;     // 服务端返回的完整 body
    }
  }

  /* ==================== 资料模块 ==================== */

  const materials = {
    /** 上传资料 */
    upload(file, tags) {
      const formData = new FormData();
      formData.append('file', file);
      if (tags) formData.append('tags', JSON.stringify(tags));
      return request('POST', '/api/materials/upload', null, {
        'Content-Type': 'multipart/form-data',
        // 注意：浏览器会自动设置 multipart boundary，这里不能手动设 Content-Type
      }).then(() => {
        // fetch 不支持直接发 FormData 并自定义 Content-Type，
        // 所以用原生方式
        return _uploadNative(file, tags);
      });
    },

    /** 获取资料列表 */
    list() {
      return request('GET', '/api/materials/list');
    },

    /** 获取资料详情+全文 */
    getDetail(id) {
      return request('GET', `/api/materials/${id}`);
    },

    /** 删除资料 */
    delete(id) {
      return request('DELETE', `/api/materials/${id}`);
    },
  };

  function _uploadNative(file, tags) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('filename', file.name);
      if (tags) fd.append('tags', JSON.stringify(tags));

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/api/materials/upload`);
      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText);
          xhr.status >= 200 && xhr.status < 300 ? resolve(json) : reject(json);
        } catch (e) { reject({ message: '解析失败' }); }
      };
      xhr.onerror = () => reject(new ApiError('上传失败：网络错误'));
      xhr.send(fd);
    });
  }


  /* ==================== 对话模块 ==================== */

  const chat = {
    /** 发送消息 */
    send(message, materialIds, sessionId) {
      return request('POST', '/api/chat/send', {
        message,
        material_ids: materialIds,
        session_id: sessionId || undefined,
      });
    },

    /** 获取对话历史 */
    history(sessionId) {
      return request('GET', `/api/chat/history/${sessionId}`);
    },

    /** 获取会话列表 */
    sessions() {
      return request('GET', '/api/chat/sessions');
    },
  };


  /* ==================== 测评模块 ==================== */

  const quiz = {
    /** 生成试卷 */
    generate(materialIds, types, counts) {
      return request('POST', '/api/quiz/generate', {
        material_ids: materialIds,
        types,
        counts,
      });
    },

    /** 提交答卷 */
    submit(quizId, answers) {
      return request('POST', '/api/quiz/submit', { quiz_id: quizId, answers });
    },

    /** 历史成绩 */
    results(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return request('GET', `/api/quiz/results${qs ? '?' + qs : ''}`);
    },
  };


  /* ==================== 进度模块 ==================== */

  const progress = {
    /** 进度总览 */
    overview() {
      return request('GET', '/api/progress/overview');
    },

    /** 单份资料进度 */
    detail(materialId) {
      return request('GET', `/api/progress/detail/${materialId}`);
    },
  };


  /* ==================== 周报模块 ==================== */

  const weeklyReport = {
    /** 获取本周报告 */
    get(weekStart) {
      const qs = weekStart ? `?week_start_date=${weekStart}` : '';
      return request('GET', `/api/weekly-report${qs}`);
    },
  };

  /* ==================== 健康检查（状态灯） ==================== */

  async function healthCheck() {
    try {
      const res = await fetch(`${BASE_URL}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(15000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  return {
    materials,
    chat,
    quiz,
    progress,
    weeklyReport,
    healthCheck,
    ApiError,
  };
})();
