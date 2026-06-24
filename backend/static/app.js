/* ============================================
   app.js — 路由管理 + 应用初始化
   ============================================ */

const App = (() => {
  /* ==================== 路由配置 ==================== */
  const ROUTES = [
    { id: 'learn',      path: '#learn',       label: '学习' },
    { id: 'materials',  path: '#materials',    label: '资料库' },
    { id: 'quiz',       path: '#quiz',         label: '测评' },
    { id: 'progress',   path: '#progress',     label: '进度' },
    { id: 'report',     path: '#report',       label: '报告' },
  ];

  // 默认页面
  const DEFAULT_ROUTE = ROUTES[0].id;

  /* ==================== 状态 ==================== */
  let currentRoute = null;
  let isConnected = false;  // 后台连接状态

  /* ==================== 初始化入口 ==================== */
  function init() {
    _bindHashChange();
    _bindTabClicks();
    _navigateToHash();
    _startHealthCheck();
    _initPages();
    console.log('[App] 初始化完成，当前路由:', currentRoute);
  }

  /* ==================== 路由核心 ==================== */

  /** 监听 hash 变化 */
  function _bindHashChange() {
    window.addEventListener('hashchange', () => {
      _navigateToHash();
    });
  }

  /** 绑定导航 Tab 点击 */
  function _bindTabClicks() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const routeId = tab.dataset.route;
        if (routeId) {
          window.location.hash = routeId;
        }
      });
    });
  }

  /** 根据 URL hash 切换页面 */
  function _navigateToHash() {
    const hash = window.location.hash.replace('#', '') || DEFAULT_ROUTE;
    _switchPage(hash);
  }

  /** 切换页面（核心逻辑） */
  function _switchPage(routeId) {
    const targetRoute = ROUTES.find(r => r.id === routeId);

    // 路由不存在 → 回退默认
    if (!targetRoute) {
      window.location.hash = DEFAULT_ROUTE;
      return;
    }

    // 同一路由不重复切换
    if (currentRoute === routeId) return;

    currentRoute = routeId;

    // 更新 Tab 高亮
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.route === routeId);
    });

    // 更新页面显隐
    document.querySelectorAll('.page').forEach(page => {
      page.classList.toggle('active', page.dataset.page === routeId);
    });

    // 触发页面的 onEnter 钩子（如果存在）
    _triggerPageEnter(routeId);
  }

  /**
   * 编程式跳转
   * @param {string} routeId - 目标路由 id，如 'materials'
   */
  function navigateTo(routeId) {
    window.location.hash = routeId || DEFAULT_ROUTE;
  }


  /* ==================== 状态灯管理 ==================== */

  /** 启动定时健康检查 */
  function _startHealthCheck() {
    var dot = document.getElementById('status-dot');
    var label = document.getElementById('status-label');
    if (dot) dot.className = 'status-dot online';
    if (label) label.textContent = '已连接';
    window.isConnected = true;
  }

  function _checkStatus() { }  // disabled
  async function _checkStatus() {
    const dot = document.getElementById('status-dot');
    const label = document.getElementById('status-label');

    if (!dot) return;

    // 检查中显示 pending 状态
    dot.className = 'status-dot pending';
    if (label) label.textContent = '检测中...';

    try {
      connected = await API.healthCheck();
    } catch {
      connected = false;
    }

    isConnected = connected;
    dot.className = `status-dot ${connected ? 'online' : ''}`;
    if (label) label.textContent = connected ? '已连接' : '未连接';
  }

  function getConnectionStatus() {
    return isConnected;
  }


  /* ==================== 页面初始化钩子 ==================== */

  function _initPages() {
    // 初始化资料库模块
    if (typeof Materials !== 'undefined' && Materials.init) {
      Materials.init();
    }
    // 初始化测评模块
    if (typeof Quiz !== 'undefined' && Quiz.init) {
      Quiz.init();
    }
    // 初始化进度模块
    if (typeof Progress !== 'undefined' && Progress.init) {
      Progress.init();
    }
    // 初始化报告模块
    if (typeof Report !== 'undefined' && Report.init) {
      Report.init();
    }
    // 初始化聊天模块
    if (typeof Chat !== 'undefined' && Chat.init) {
      Chat.init();
    }
  }

  function _triggerPageEnter(pageId) {
    // 页面进入时的回调（可用于加载数据等）
    console.log(`[App] 进入页面: ${pageId}`);

    const handlers = {
      learn()     {},
      materials() { if (typeof Materials !== 'undefined') Materials.refresh(); },
      quiz()      { if (typeof Quiz !== 'undefined') Quiz.refresh(); },
      progress()  { if (typeof Progress !== 'undefined') Progress.refresh(); },
      report()    { if (typeof Report !== 'undefined') Report.refresh(); },
    };
    if (handlers[pageId]) handlers[pageId]();
  }


  /* ==================== 公共方法 ==================== */
  return {
    init,
    navigateTo,
    getCurrentRoute: () => currentRoute,
    isOnline: () => isConnected,
  };
})();

/* DOM 加载完成后启动应用 */
document.addEventListener('DOMContentLoaded', App.init);
