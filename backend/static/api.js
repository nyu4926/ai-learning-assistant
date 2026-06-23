/* ============================================
   api.js 鈥?鍚庡彴璇锋眰灏佽
   ============================================ */

const API = (() => {
  // 鍚庡彴鍩虹鍦板潃锛堟湰鍦板紑鍙戞寚鍚?Flask 5000 绔彛锛岄儴缃叉椂鏀逛负瀹為檯鍦板潃锛?  const BASE_URL = window.location.origin;

  // 璇锋眰閰嶇疆
  const DEFAULT_HEADERS = {
    'Content-Type': 'application/json',
    // Authorization: `Bearer ${getToken()}`,  // V1 鏆備笉鍋氶壌鏉?  };

  /**
   * 鏍稿績璇锋眰鏂规硶
   * @param {string} method - GET / POST / PUT / DELETE
   * @param {string} endpoint - 鎺ュ彛璺緞锛堜笉鍚墠缂€锛?   * @param {object|null} data - POST/PUT 鐨?body 鏁版嵁
   * @param {object} extraHeaders - 棰濆璇锋眰澶?   * @returns {Promise<any>}
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
        console.error(`[API] ${method} ${endpoint} 鈫?${res.status}`, json);
        throw new ApiError(json.message || '璇锋眰澶辫触', res.status, json);
      }
      return json;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      console.error(`[API] 缃戠粶閿欒: ${method} ${endpoint}`, err);
      throw new ApiError('缃戠粶杩炴帴澶辫触锛岃妫€鏌ュ悗鍙版槸鍚﹀惎鍔?, 0);
    }
  }

  /** 鑷畾涔?API 閿欒绫?*/
  class ApiError extends Error {
    constructor(message, code, data) {
      super(message);
      this.name = 'ApiError';
      this.code = code;     // HTTP 鐘舵€佺爜
      this.data = data;     // 鏈嶅姟绔繑鍥炵殑瀹屾暣 body
    }
  }

  /* ==================== 璧勬枡妯″潡 ==================== */

  const materials = {
    /** 涓婁紶璧勬枡 */
    upload(file, tags) {
      const formData = new FormData();
      formData.append('file', file);
      if (tags) formData.append('tags', JSON.stringify(tags));
      return request('POST', '/api/materials/upload', null, {
        'Content-Type': 'multipart/form-data',
        // 娉ㄦ剰锛氭祻瑙堝櫒浼氳嚜鍔ㄨ缃?multipart boundary锛岃繖閲屼笉鑳芥墜鍔ㄨ Content-Type
      }).then(() => {
        // fetch 涓嶆敮鎸佺洿鎺ュ彂 FormData 骞惰嚜瀹氫箟 Content-Type锛?        // 鎵€浠ョ敤鍘熺敓鏂瑰紡
        return _uploadNative(file, tags);
      });
    },

    /** 鑾峰彇璧勬枡鍒楄〃 */
    list() {
      return request('GET', '/api/materials/list');
    },

    /** 鑾峰彇璧勬枡璇︽儏+鍏ㄦ枃 */
    getDetail(id) {
      return request('GET', `/api/materials/${id}`);
    },

    /** 鍒犻櫎璧勬枡 */
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
        } catch (e) { reject({ message: '瑙ｆ瀽澶辫触' }); }
      };
      xhr.onerror = () => reject(new ApiError('涓婁紶澶辫触锛氱綉缁滈敊璇?));
      xhr.send(fd);
    });
  }


  /* ==================== 瀵硅瘽妯″潡 ==================== */

  const chat = {
    /** 鍙戦€佹秷鎭?*/
    send(message, materialIds, sessionId) {
      return request('POST', '/api/chat/send', {
        message,
        material_ids: materialIds,
        session_id: sessionId || undefined,
      });
    },

    /** 鑾峰彇瀵硅瘽鍘嗗彶 */
    history(sessionId) {
      return request('GET', `/api/chat/history/${sessionId}`);
    },

    /** 鑾峰彇浼氳瘽鍒楄〃 */
    sessions() {
      return request('GET', '/api/chat/sessions');
    },
  };


  /* ==================== 娴嬭瘎妯″潡 ==================== */

  const quiz = {
    /** 鐢熸垚璇曞嵎 */
    generate(materialIds, types, counts) {
      return request('POST', '/api/quiz/generate', {
        material_ids: materialIds,
        types,
        counts,
      });
    },

    /** 鎻愪氦绛斿嵎 */
    submit(quizId, answers) {
      return request('POST', '/api/quiz/submit', { quiz_id: quizId, answers });
    },

    /** 鍘嗗彶鎴愮哗 */
    results(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return request('GET', `/api/quiz/results${qs ? '?' + qs : ''}`);
    },
  };


  /* ==================== 杩涘害妯″潡 ==================== */

  const progress = {
    /** 杩涘害鎬昏 */
    overview() {
      return request('GET', '/api/progress/overview');
    },

    /** 鍗曚唤璧勬枡杩涘害 */
    detail(materialId) {
      return request('GET', `/api/progress/detail/${materialId}`);
    },
  };


  /* ==================== 鍛ㄦ姤妯″潡 ==================== */

  const weeklyReport = {
    /** 鑾峰彇鏈懆鎶ュ憡 */
    get(weekStart) {
      const qs = weekStart ? `?week_start_date=${weekStart}` : '';
      return request('GET', `/api/weekly-report${qs}`);
    },
  };

  /* ==================== 鍋ュ悍妫€鏌ワ紙鐘舵€佺伅锛?==================== */

  async function healthCheck() {
    try {
      const res = await fetch(`${BASE_URL}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
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
