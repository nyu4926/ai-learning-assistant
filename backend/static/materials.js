/* ============================================
   materials.js — 资料库页面交互逻辑
   ============================================ */

const Materials = (() => {
  /* ==================== 配置 ==================== */

  /** 允许上传的文件格式 */
  const ALLOWED_EXTENSIONS = ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'md', 'markdown', 'txt'];
  const ACCEPT_STRING = '.pdf,.ppt,.pptx,.doc,.docx,.md,.markdown,.txt';

  const TYPE_MAP = {
    pdf:  { label: 'PDF',  icon: 'pdf' },
    ppt:  { label: 'PPT',  icon: 'ppt' },
    pptx: { label: 'PPTX', icon: 'ppt' },
    doc:  { label: 'Word', icon: 'word' },
    docx: { label: 'DOCX', icon: 'word' },
    md:   { label: 'MD',   icon: 'md' },
    markdown: { label: 'MD', icon: 'md' },
    txt:  { label: 'TXT',  icon: 'txt' },
  };

  /* ==================== 状态 ==================== */
  let items = []; // 资料 [{ id, name, type, size, chunks, status, file }]

  /* ==================== DOM 引用 ==================== */
  let $ = {};

  /* ==================== 初始化 ==================== */
  function init() {
    _cacheDom();
    _bindEvents();
    _loadFromServer();
    console.log('[Materials] 模块初始化完成');
  }

  function _cacheDom() {
    $.uploadZone      = document.getElementById('upload-zone');
    $.fileInput       = document.getElementById('file-input');
    $.listWrap        = document.getElementById('materials-list-wrap');
    $.tbody           = document.getElementById('materials-tbody');
    $.emptyState      = document.getElementById('mat-empty-state');
    $.toastContainer  = document.getElementById('toast-container');
  }

  function _bindEvents() {
    if ($.uploadZone) {
      $.uploadZone.addEventListener('dragenter', _onDragEnter);
      $.uploadZone.addEventListener('dragover', _onDragOver);
      $.uploadZone.addEventListener('dragleave', _onDragLeave);
      $.uploadZone.addEventListener('drop', _onDrop);
    }
    if ($.fileInput) {
      $.fileInput.addEventListener('change', _onFileSelect);
    }
  }


  /* ==================== 拖拽上传 ==================== */

  function _onDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    $.uploadZone.classList.add('drag-active');
  }

  function _onDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    // 保持 drag-active 状态
  }

  function _onDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    // 只有离开整个 zone 才移除（避免子元素触发误移除）
    if (!$.uploadZone.contains(e.relatedTarget)) {
      $.uploadZone.classList.remove('drag-active');
    }
  }

  function _onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    $.uploadZone.classList.remove('drag-active');

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      _handleFiles(files);
    }
  }

  function _onFileSelect(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      _handleFiles(files);
    }
    // 重置 input 以便重复选择同一文件
    e.target.value = '';
  }


  /* ==================== 文件处理核心 ==================== */

  /** 校验 + 上传文件列表 */
  async function _handleFiles(files) {
    // 格式校验
    const valid = [];
    const invalid = [];

    for (const f of files) {
      const ext = f.name.split('.').pop().toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        valid.push(f);
      } else {
        invalid.push(f.name);
      }
    }

    if (invalid.length > 0) {
      toast(`不支持的格式：${invalid.join(', ')}\n支持：PDF / PPT / Word / Markdown / TXT`, 'error');
    }

    if (valid.length === 0) return;

    for (const file of valid) {
      await _uploadOne(file);
    }
  }

  /** 上传单个文件 */
  async function _uploadOne(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const typeInfo = TYPE_MAP[ext] || { label: ext.toUpperCase(), icon: 'txt' };

    // 先在 UI 中插入一行"解析中"
    const item = {
      id: 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name: file.name,
      type: typeInfo.label,
      typeIcon: typeInfo.icon,
      size: file.size,
      chunks: '--',
      status: 'parsing',
      file: file,
    };
    items.push(item);
    _renderList();

    try {
      // 调用 API
      await API.materials.upload(file);

      // 成功 → 更新状态为完成，模拟分块数
      item.status = 'done';
      item.chunks = _mockChunkCount(file.size);
      _renderList();
      toast(`「${file.name}」上传成功`, 'success');

      // 通知 Chat 模块刷新资料下拉框
      if (typeof Chat !== 'undefined' && Chat.init) {
        // 重新加载资料到聊天页面的下拉框
        // Chat 内部会调 API.materials.list()
      }

    } catch (err) {
      // 失败 → 更新状态为失败
      item.status = 'failed';
      item.chunks = '--';
      _renderList();
      toast(`「${file.name}」上传失败：${err.message || '网络错误或后台未启动'}`, 'error');
    }
  }


  /* ==================== 列表渲染 ==================== */

  function _renderList() {
    if (!$.tbody || !$.listWrap || !$.emptyState) return;

    if (items.length === 0) {
      $.listWrap.style.display = 'none';
      $.emptyState.style.display = '';
      return;
    }

    $.listWrap.style.display = '';
    $.emptyState.style.display = 'none';

    $.tbody.innerHTML = items.map(item => `
      <tr data-id="${item.id}">
        <td>
          <div class="mat-file-name">
            <span class="mat-file-icon ${item.typeIcon}">
              ${_typeIconSvg(item.typeIcon)}
            </span>
            <span class="mat-filename-text" title="${_escHtml(item.name)}">${_escHtml(item.name)}</span>
          </div>
        </td>
        <td><span class="mat-meta-text">${item.type}</span></td>
        <td><span class="mat-meta-text">${_formatSize(item.size)}</span></td>
        <td><span class="mat-meta-text">${item.chunks}</span></td>
        <td>${_statusBadge(item)}</td>
        <td>${_actionButtons(item)}</td>
      </tr>
    `).join('');
  }

  /** 状态徽章 HTML */
  function _statusBadge(item) {
    switch (item.status) {
      case 'parsing':
        return `<span class="mat-status parsing"><span class="mat-status-spinner"></span>解析中</span>`;
      case 'done':
        return `<span class="mat-status done">✓ 完成</span>`;
      case 'failed':
        return `<span class="mat-status failed">✗ 失败</span>`;
      default:
        return `<span class="mat-status">未知</span>`;
    }
  }

  /** 操作按钮 HTML */
  function _actionButtons(item) {
    let html = '';
    if (item.status === 'failed') {
      html += `<button class="mat-btn-retry" onclick="Materials.retry('${item.id}')">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                 重试
               </button> `;
    }
    html += `<button class="mat-btn-delete" onclick="Materials.remove('${item.id}')" title="删除">
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
               删除
             </button>`;
    return html;
  }


  /* ==================== 操作方法（公共接口） ==================== */

  /** 重试上传失败的资料 */
  async function retry(id) {
    const item = items.find(i => i.id === id);
    if (!item || !item.file) return;

    item.status = 'parsing';
    item.chunks = '--';
    _renderList();

    try {
      await API.materials.upload(item.file);
      item.status = 'done';
      item.chunks = _mockChunkCount(item.file.size);
      _renderList();
      toast(`「${item.name}」重新上传成功`, 'success');
    } catch (err) {
      item.status = 'failed';
      _renderList();
      toast(`「${item.name}」重试失败：${err.message || '网络错误'}`, 'error');
    }
  }

  /** 删除资料 */
  async function remove(id) {
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;

    const item = items[idx];
    const name = item.name;

    // 尝试调用后端删除 API
    try {
      if (!id.startsWith('local_')) {
        await API.materials.delete(id);
      }
    } catch (e) {
      // 后端不可用时忽略，只删前端
    }

    items.splice(idx, 1);
    _renderList();
    toast(`已删除「${name}」`, 'info');
  }


  /* ==================== 服务端数据 ==================== */

  /** 从服务端加载已有资料列表 */
  async function _loadFromServer() {
    try {
      const list = await API.materials.list();
      const arr = Array.isArray(list) ? list : (list.data || []);
      // 转换为内部格式
      items = arr.map(m => ({
        id: String(m.id),
        name: m.name || m.title || '未命名',
        type: _guessTypeLabel(m.type || m.file_type || ''),
        typeIcon: _guessTypeIcon(m.type || m.file_type || ''),
        size: m.file_size || 0,
        chunks: m.chunk_count || m.chunks || '--',
        status: m.status === 'failed' ? 'failed' :
               m.status === 'processing' ? 'parsing' : 'done',
        file: null, // 从服务端来的没有 File 对象
      }));
      _renderList();
    } catch (err) {
      console.warn('[Materials] 加载资料失败:', err.message);
      // 空列表
      items = [];
      _renderList();
    }
  }


  /* ==================== Toast 通知 ==================== */

  /**
   * 显示一条通知
   * @param {string} message - 提示文字（支持 \n 换行）
   * @param {'success'|'error'|'info'} [type='info'] - 类型
   * @param {number} [duration=3500] - 显示毫秒数
   */
  function toast(message, type, duration) {
    type = type || 'info';
    duration = duration || (type === 'error' ? 5000 : 3500);

    if (!$.toastContainer) return;

    const el = document.createElement('div');
    el.className = `toast-item ${type}`;

    const icons = { success: '✓', error: '✗', info: 'ℹ' };
    const msgHtml = message.replace(/\n/g, '<br>');

    el.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span style="flex:1;">${msgHtml}</span>
      <span class="toast-close" onclick="this.parentElement._remove()">×</span>
    ];

    el._remove = () => {
      el.style.animation = 'toastOut 0.25s ease both';
      setTimeout(() => el.remove(), 260);
    };

    $.toastContainer.appendChild(el);

    // 自动消失
    setTimeout(() => { if (el.parentElement) el._remove(); }, duration);
  }


  /* ==================== 工具函数 ==================== */

  /** 格式化文件大小 */
  function _formatSize(bytes) {
    if (!bytes || bytes <= 0) return '-- B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return bytes.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  /** 根据扩展名猜类型标签 */
  function _guessTypeLabel(typeStr) {
    const t = String(typeStr).toLowerCase();
    if (t.includes('pdf')) return 'PDF';
    if (t.includes('ppt') || t.includes('powerpoint')) return 'PPT';
    if (t.includes('doc') || t.includes('word')) return 'Word';
    if (t.includes('md') || t.includes('markdown')) return 'MD';
    if (t.includes('text') || t.includes('txt')) return 'TXT';
    return typeStr || '--';
  }

  /** 根据扩展名猜类型图标类名 */
  function _guessTypeIcon(typeStr) {
    const t = String(typeStr).toLowerCase();
    if (t.includes('pdf')) return 'pdf';
    if (t.includes('ppt') || t.includes('powerpoint')) return 'ppt';
    if (t.includes('doc') || t.includes('word')) return 'word';
    if (t.includes('md') || t.includes('markdown')) return 'md';
    return 'txt';
  }

  /** SVG 图标（按类型） */
  function _typeIconSvg(iconType) {
    const svgs = {
      pdf: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/><path d="M12 18v-6l-3 4-3-4v6"/></svg>',
      ppt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
      word: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><line x1="10" y1="13" x2="14" y2="13"/><line x1="10" y1="17" x2="14" y2="17"/></svg>',
      md: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16v16H4z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 8h4m-4 4h5m-5 4h7"/></svg>',
      txt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>',
    };
    return svgs[iconType] || svgs.txt;
  }

  /** 模拟分块数量 */
  function _mockChunkCount(size) {
    // 假设每 chunk 约 512 字符，粗略计算
    if (!size || size <= 0) return '--';
    const estimatedChars = size; // 粗略按字节估算
    if (estimatedChars < 2000) return 1;
    if (estimatedChars < 10000) return Math.floor(estimatedChars / 2000);
    if (estimatedChars < 100000) return Math.floor(estimatedChars / 4000);
    return Math.floor(Math.min(estimatedChars / 8000, 99));
  }

  /** HTML 转义 */
  function _escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }


  /* ==================== 公共接口 ==================== */
  return {
    init,
    retry,
    remove,
    toast,
    refresh: _renderList,
  };
})();
