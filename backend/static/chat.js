/* ============================================
   chat.js — 学习页聊天交互逻辑
   ============================================ */

const Chat = (() => {
  /* ==================== 状态 ==================== */
  const state = {
    messages: [],          // 消息数组
    selectedMaterialId: '', // 当前选中的资料ID，空字符串=普通对话
    materials: [],         // 资料列表缓存
    isThinking: false,
    mockIndex: 0,          // Mock 回复轮询索引
  };

  /* ==================== DOM 引用 ==================== */
  let $ = {};

  /* ==================== 初始化 ==================== */
  function init() {
    _cacheDom();
    _bindEvents();
    _loadMaterials();
    console.log('[Chat] 模块初始化完成');
  }

  function _cacheDom() {
    $.materialSelect   = document.getElementById('chat-material-select');
    $.contextHint      = document.getElementById('context-hint');
    $.newChatBtn       = document.getElementById('btn-new-chat');
    $.chatBody         = document.getElementById('chat-body');
    $.welcomeEl        = document.getElementById('chat-welcome');
    $.messagesEl       = document.getElementById('chat-messages');
    $.thinkingEl       = document.getElementById('chat-thinking');
    $.input            = document.getElementById('chat-input');
    $.sendBtn          = document.getElementById('chat-send-btn');
    $.sidebarList      = document.getElementById('learn-material-list');
  }

  function _bindEvents() {
    // 资料选择切换
    if ($.materialSelect) {
      $.materialSelect.addEventListener('change', _onMaterialChange);
    }
    // 新对话按钮
    if ($.newChatBtn) {
      $.newChatBtn.addEventListener('click', newChat);
    }
    // 发送按钮
    if ($.sendBtn) {
      $.sendBtn.addEventListener('click', _handleSend);
    }
    // 输入框键盘事件（Enter 发送 / Shift+Enter 换行）
    if ($.input) {
      $.input.addEventListener('keydown', _onInputKeydown);
      // 自动调整高度
      $.input.addEventListener('input', _autoResize);
    }
  }


  /* ==================== 资料管理 ==================== */

  /** 加载资料列表填充下拉框 + 侧栏 */
  async function _loadMaterials() {
    try {
      const list = await API.materials.list();
      state.materials = Array.isArray(list) ? list : (list.data || []);
      _renderMaterialOptions();
      _renderSidebarList();
    } catch (err) {
      // 离线/无后台时使用空列表，后续可扩展 Mock 数据
      state.materials = [];
      _renderMaterialOptions();
      _renderSidebarList();
      console.warn('[Chat] 加载资料失败，可能后台未启动:', err.message);
    }
  }

  /** 渲染下拉框选项 */
  function _renderMaterialOptions() {
    if (!$.materialSelect) return;
    // 保留第一个"普通对话"选项
    $.materialSelect.innerHTML = '<option value="">普通对话（不引用资料）</option>';
    state.materials.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name || m.title || '未命名资料';
      $.materialSelect.appendChild(opt);
    });
  }

  /** 渲染侧栏资料列表 */
  function _renderSidebarList() {
    if (!$.sidebarList) return;
    if (!state.materials.length) {
      $.sidebarList.innerHTML = `
        <div class="no-materials-hint">
          <p>暂无资料</p>
          <p style="margin-top:8px; font-size:12px;">
            前往「<a href="#materials">资料库</a>」上传
          </p>
        </div>`;
      return;
    }
    $.sidebarList.innerHTML = state.materials.map(m => `
      <div class="material-item ${state.selectedMaterialId === String(m.id) ? 'selected' : ''}"
           data-id="${m.id}" onclick="Chat.selectMaterial('${m.id}')">
        <div class="material-icon">${_getFileIcon(m.type || m.file_type)}</div>
        <div class="material-info">
          <div class="material-name">${_escHtml(m.name || m.title || '未命名')}</div>
          <div class="material-meta">${m.type || m.file_type || ''} · ${m.upload_time || ''}</div>
        </div>
      </div>
    `).join('');
  }

  /** 资料选择变更 */
  function _onMaterialChange(e) {
    state.selectedMaterialId = e.target.value;
    _updateContextHint();
    _renderSidebarList(); // 更新侧栏选中态
    console.log('[Chat] 切换资料:', state.selectedMaterialId || '(普通对话)');
  }

  /** 从侧栏点击选中资料（公共方法） */
  function selectMaterial(id) {
    state.selectedMaterialId = id;
    if ($.materialSelect) $.materialSelect.value = id || '';
    _updateContextHint();
    _renderSidebarList();
  }

  /** 更新工具栏提示文字 */
  function _updateContextHint() {
    if (!$.contextHint) return;
    if (state.selectedMaterialId) {
      const mat = state.materials.find(m => String(m.id) === state.selectedMaterialId);
      $.contextHint.textContent = '📎 引用: ' + (mat ? (mat.name || mat.title) : '');
      $.contextHint.style.display = '';
    } else {
      $.contextHint.textContent = '';
      $.contextHint.style.display = 'none';
    }
  }


  /* ==================== 对话管理 ==================== */

  /** 新对话：清空消息、恢复欢迎页 */
  function newChat() {
    state.messages = [];
    state.selectedMaterialId = '';
    state.mockIndex = 0;

    if ($.materialSelect) $.materialSelect.value = '';
    _updateContextHint();
    _renderSidebarList();

    if ($.messagesEl) $.messagesEl.innerHTML = '';
    _toggleWelcome(true);
    _toggleThinking(false);
    _resetInput();

    console.log('[Chat] 新对话已开启');
  }


  /* ==================== 消息发送 ==================== */

  async function _handleSend() {
    const text = ($.input.value || '').trim();
    if (!text || state.isThinking) return;

    // 隐藏欢迎页
    _toggleWelcome(false);
    // 显示消息容器
    if ($.messagesEl) $.messagesEl.style.display = '';

    // 追加用户消息
    _appendMessage({ role: 'user', content: text });
    _scrollToBottom();
    _resetInput();

    // 显示思考状态
    _toggleThinking(true);
    _setInputDisabled(true);

    try {
      // 调用 API
      const materialIds = state.selectedMaterialId ? [state.selectedMaterialId] : [];
      const response = await API.chat.send(text, materialIds, undefined);

      _toggleThinking(false);
      _setInputDisabled(false);

      // 追加 AI 回复
      _appendMessage({
        role: 'assistant',
        content: response.reply || response.message || response.content || '收到你的消息了。',
        sources: response.sources || response.references || [],
      });

    } catch (err) {
      _toggleThinking(false);
      _setInputDisabled(false);

      // API 失败时用 Mock 数据演示（开发阶段）
      console.warn('[Chat] API 调用失败，使用模拟回复:', err.message);
      const mock = _getMockReply(text);
      _appendMessage({
        role: 'assistant',
        content: mock.text,
        sources: mock.sources,
      });
    }

    _scrollToBottom();
  }

  /** 键盘事件：Enter 发送 / Shift+Enter 换行 */
  function _onInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _handleSend();
    }
  }

  /** 输入框自动高度 */
  function _autoResize() {
    const el = $.input;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function _resetInput() {
    if ($.input) {
      $.input.value = '';
      $.input.style.height = 'auto';
    }
  }

  function _setInputDisabled(disabled) {
    state.isThinking = disabled;
    if ($.input) $.input.disabled = disabled;
    if ($.sendBtn) $.sendBtn.disabled = disabled;
  }


  /* ==================== 消息渲染 ==================== */

  /** 追加一条消息到列表 */
  function _appendMessage(msg) {
    state.messages.push(msg);

    if (!$.messagesEl) return;

    const row = document.createElement('div');
    row.className = 'msg-row ' + (msg.role === 'user' ? 'user' : 'assistant');
    row.dataset.msgId = Date.now() + Math.random().toString(36).slice(2, 8);

    if (msg.role === 'user') {
      row.innerHTML = `
        <div class="msg-avatar user">我</div>
        <div class="msg-bubble">${_escHtml(msg.content)}</div>`;
    } else {
      const mdHtml = _markdown(msg.content);
      const sourceHtml = (msg.sources && msg.sources.length)
        ? `<div class="msg-source-toggle" onclick="Chat.toggleSource(this)">
             <span class="toggle-arrow">▶</span>
             查看引用来源 (${msg.sources.length} 条)
           </div>
           <div class="msg-source-body">
             ${msg.sources.map(s => `
               <div class="source-item">
                 <div class="source-title">${_escHtml(s.title || s.material_name || '引用来源')}</div>
                 <div class="source-snippet">${_escHtml(s.snippet || s.content || s.text || '')}</div>
               </div>
             `).join('')}
           </div>`
        : '';

      row.innerHTML = `
        <div class="msg-avatar ai">A</div>
        <div class="msg-bubble">${mdHtml}${sourceHtml}</div>`;
    }

    $.messagesEl.appendChild(row);
  }

  /**
   * 轻量级 Markdown → HTML 转换器
   * 支持：标题 / 粗斜体 / 行内代码 / 代码块 / 无序有序列表 / 引用 / 分隔线 / 表格 / 段落
   */
  function _markdown(text) {
    if (!text) return '';

    // HTML 实体转义（在解析前保护）
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 代码块 ```...``` （先处理，防止内部内容被转义）
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      return '<pre><code class="lang-' + lang + '">' + code.trimEnd() + '</code></pre>';
    });

    // 行内代码 `...`
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 标题 # ## ### ####
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 粗体和斜体 **...** 和 *...*（粗体优先匹配长格式）
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // 引用行 > ...
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // 水平线 --- 或 ***
    html = html.replace(/^(?:---|\*\*\*)$/gm, '<hr>');

    // 无序列表 - item 或 * item
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    // 连续的 li 包裹为 ul
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // 有序列表 1. item
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<oli>$1</oli>');
    html = html.replace(/((?:<oli>.*<\/oli>\n?)+)/g, (_m, body) => {
      return '<ol>' + body.replace(/<\/?oli>/g, (tag) =>
        tag === '<oli>' ? '<li>' : '</li>'
      ) + '</ol>';
    });

    // 表格 |...|
    const tablePattern = /^(\|.+\|)\n(\|[-:\s|]+\|)\n((?:\|.+\|\n?)*)/gm;
    html = html.replace(tablePattern, (_match, headerLine, divider, body) => {
      const headers = headerLine.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const rows = body.trim().split('\n').map(line => {
        const cells = line.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    });

    // 双换行分段落（剩余的非标签行包裹为 p）
    html = html.split('\n\n').map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // 已被标签包裹的不再处理
      if (/^<(ul|ol|pre|blockquote|h[1-4]|hr|table|li)/.test(trimmed)) return trimmed;
      // 纯文本行 → p
      return '<p>' + trimmed + '</p>';
    }).join('\n');

    // 清理空 p 和连续空行
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/\n{3,}/g, '\n\n');

    return html;
  }


  /* ==================== 引用来源折叠 ==================== */

  window.Chat = window.Chat || {};
  /** 切换引用来源展开/收起（通过 onclick 全局调用） */
  function toggleSource(toggleEl) {
    if (!toggleEl) return;
    toggleEl.classList.toggle('expanded');
    const body = toggleEl.nextElementSibling;
    if (body && body.classList.contains('msg-source-body')) {
      body.classList.toggle('visible');
    }
  };


  /* ==================== UI 辅助方法 ==================== */

  function _toggleWelcome(show) {
    if ($.welcomeEl) $.welcomeEl.style.display = show ? '' : 'none';
  }

  function _toggleThinking(show) {
    if ($.thinkingEl) $.thinkingEl.style.display = show ? '' : 'none';
  }

  function _scrollToBottom() {
    requestAnimationFrame(() => {
      if ($.chatBody) $.chatBody.scrollTop = $.chatBody.scrollHeight;
    });
  }

  /** 获取文件类型图标字符 */
  function _getFileIcon(type) {
    if (!type) return '📄';
    const t = type.toLowerCase();
    if (t.includes('pdf')) return '📕';
    if (t.includes('ppt') || t.includes('pptx')) return '📊';
    if (t.includes('md') || t.includes('markdown')) return '📝';
    return '📄';
  }

  /** HTML 转义 */
  function _escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }


  /* ==================== Mock 数据（开发演示用） ==================== */

  function _getMockReply(question) {
    const idx = ++state.mockIndex;

    // 基于是否有选择资料，返回不同的 Mock 回复
    if (state.selectedMaterialId) {
      const replies = [
        {
          text: `**关于「${question}」的问题：**\n\n根据你选择的资料内容，我来为你解答：\n\n### 要点总结\n\n- **核心概念**：这是一个重要的知识点，需要理解其基本原理\n- **关键细节**：在实际应用中需要注意边界情况\n- **延伸思考**：可以尝试从多个角度来理解这个问题\n\n> 💡 提示：这个概念在后面的章节中会反复出现，建议重点掌握。\n\n如果还有其他问题，随时问我！`,
          sources: [
            { title: '参考资料 A', snippet: '相关段落内容摘要...这里展示 AI 引用的具体原文片段。' },
            { title: '参考资料 B', snippet: '另一处相关的引用来源内容...' },
          ],
        },
        {
          text: `这是个好问题！让我基于资料内容详细说明：\n\n## 1. 基本定义\n\n从资料中可以看到，该概念的正式定义如下：\n\n**定义内容**：这是对问题核心的解释性描述。\n\n## 2. 关键特性\n\n| 特性 | 说明 |\n|------|------|\n| 特性A | 描述信息 |\n| 特性B | 描述信息 |\n| 特性C | 描述信息 |\n\n## 3. 实际应用\n\n在实际场景中，我们需要注意以下几点...\n\n\`\`\`python\n# 示例代码\ndef example():\n    pass\n\`\`\`\n\n希望这能帮到你！`,
          sources: [
            { title: '学习资料 第3章', snippet: '第三章开篇对该概念进行了系统性介绍，涵盖了理论基础和实践应用两个层面...' },
          ],
        },
        {
          text: `我查了一下资料，关于 **${question}** 的解答如下：\n\n### 直接回答\n\n根据资料中的描述，答案可以从以下几个维度理解：\n\n1. **第一维度** — 解释说明文字\n2. **第二维度** — 更详细的展开\n3. **第三维度** — 补充要点\n\n---\n\n### 注意事项\n\n> 这里的内容需要结合前面的章节一起理解。\n\n有不清楚的地方可以继续追问！`,
          sources: [
            { title: '参考资料 第5节', snippet: '该小节专门讨论了这个主题，提供了完整的推导过程和例题...' },
            { title: '参考资料 附录', snippet: '附录中包含了额外的参考信息和补充材料...' },
            { title: '参考资料 练习题', snippet: '配套练习可以帮助巩固对这个知识点的理解...' },
          ],
        },
      ];
      const r = replies[(idx - 1) % replies.length];
      return { text: r.text, sources: r.sources };
    }

    // 普通对话模式（未选资料）
    const generalReplies = [
      {
        text: `你好！我是 AI 学习导师 👋\n\n目前你还没有选择任何学习资料，所以我在以**普通对话模式**回答。\n\n### 如何开始学习？\n\n1. 在左侧面板或顶部下拉框 **选择一份资料**\n2. 选择后我会 **基于资料内容** 为你解答问题\n3. 你也可以先上传新资料到「**资料库**」\n\n有什么我可以帮你的吗？`,
        sources: [],
      },
      {
        text: `收到你的问题：「${question}」\n\n💡 **当前是普通对话模式**\n\n如果你希望我基于某份学习资料来回答，请在顶部的下拉框中选择对应资料。选择后，我的回答会严格引用资料中的内容，并标注出处。\n\n你可以问的问题示例：\n- 这个概念是什么意思？\n- 能不能举例说明？\n- 它和 XX 有什么区别？`,
        sources: [],
      },
      {
        text: `好的，我理解你的问题了！\n\n目前没有关联任何资料，所以这是一般性的回答。如果你上传并选择了学习资料，我可以提供更精准、带引用出处的回答。\n\n**下一步建议：**\n- 点击左侧 「+ 上传资料」 按钮\n- 或者直接把文件拖拽到「资料库」页面\n\n准备好了之后告诉我，我们开始正式学习 🚀`,
        sources: [],
      },
    ];
    const gr = generalReplies[(idx - 1) % generalReplies.length];
    return { text: gr.text, sources: gr.sources };
  }


  /* ==================== 公共接口 ==================== */
  return {
    init,
    newChat,
    selectMaterial,
    toggleSource: toggleSource,
  };
})();
