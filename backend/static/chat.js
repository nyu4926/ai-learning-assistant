/* ============================================
   chat.js 閳?鐎涳缚绡勬い浣冧喊婢垛晙姘︽禍鎺椻偓鏄忕帆
   ============================================ */

const Chat = (() => {
  /* ==================== 閻樿埖鈧?==================== */
  const state = {
    messages: [],          // 濞戝牊浼呴弫鎵矋
    selectedMaterialId: '', // 瑜版挸澧犻柅澶夎厬閻ㄥ嫯绁弬姗閿涘瞼鈹栫€涙顑佹稉?閺咁噣鈧艾顕拠?    materials: [],         // 鐠у嫭鏋￠崚妤勩€冪紓鎾崇摠
    isThinking: false,
    mockIndex: 0,          // Mock 閸ョ偛顦叉潪顔款嚄缁便垹绱?  };

  /* ==================== DOM 瀵洜鏁?==================== */
  let $ = {};

  /* ==================== 閸掓繂顫愰崠?==================== */
  function init() {
    _cacheDom();
    _bindEvents();
    _loadMaterials();
    console.log('[Chat] 濡€虫健閸掓繂顫愰崠鏍х暚閹?);
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
    // 鐠у嫭鏋￠柅澶嬪閸掑洦宕?    if ($.materialSelect) {
      $.materialSelect.addEventListener('change', _onMaterialChange);
    }
    // 閺傛澘顕拠婵囧瘻闁?    if ($.newChatBtn) {
      $.newChatBtn.addEventListener('click', newChat);
    }
    // 閸欐垿鈧焦瀵滈柦?    if ($.sendBtn) {
      $.sendBtn.addEventListener('click', _handleSend);
    }
    // 鏉堟挸鍙嗗鍡涙暛閻╂ü绨ㄦ禒璁圭礄Enter 閸欐垿鈧?/ Shift+Enter 閹广垼顢戦敍?    if ($.input) {
      $.input.addEventListener('keydown', _onInputKeydown);
      // 閼奉亜濮╃拫鍐╂殻妤傛ê瀹?      $.input.addEventListener('input', _autoResize);
    }
  }


  /* ==================== 鐠у嫭鏋＄粻锛勬倞 ==================== */

  /** 閸旂姾娴囩挧鍕灐閸掓銆冩繅顐㈠帠娑撳濯哄?+ 娓氀勭埉 */
  async function _loadMaterials() {
    try {
      const list = await API.materials.list();
      state.materials = Array.isArray(list) ? list : (list.data || []);
      _renderMaterialOptions();
      _renderSidebarList();
    } catch (err) {
      // 缁傝崵鍤?閺冪姴鎮楅崣鐗堟娴ｈ法鏁ょ粚鍝勫灙鐞涱煉绱濋崥搴ｇ敾閸欘垱澧跨仦?Mock 閺佺増宓?      state.materials = [];
      _renderMaterialOptions();
      _renderSidebarList();
      console.warn('[Chat] 閸旂姾娴囩挧鍕灐婢惰精瑙﹂敍灞藉讲閼宠棄鎮楅崣鐗堟弓閸氼垰濮?', err.message);
    }
  }

  /** 濞撳弶鐓嬫稉瀣濡楀棝鈧銆?*/
  function _renderMaterialOptions() {
    if (!$.materialSelect) return;
    // 娣囨繄鏆€缁楊兛绔存稉?閺咁噣鈧艾顕拠?闁銆?    $.materialSelect.innerHTML = '<option value="">閺咁噣鈧艾顕拠婵撶礄娑撳秴绱╅悽銊ㄧカ閺傛瑱绱?/option>';
    state.materials.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name || m.title || '閺堫亜鎳￠崥宥堢カ閺?;
      $.materialSelect.appendChild(opt);
    });
  }

  /** 濞撳弶鐓嬫笟褎鐖挧鍕灐閸掓銆?*/
  function _renderSidebarList() {
    if (!$.sidebarList) return;
    if (!state.materials.length) {
      $.sidebarList.innerHTML = `
        <div class="no-materials-hint">
          <p>閺嗗倹妫ょ挧鍕灐</p>
          <p style="margin-top:8px; font-size:12px;">
            閸撳秴绶氶妴?a href="#materials">鐠у嫭鏋℃惔?/a>閵嗗秳绗傛导?          </p>
        </div>`;
      return;
    }
    $.sidebarList.innerHTML = state.materials.map(m => `
      <div class="material-item ${state.selectedMaterialId === String(m.id) ? 'selected' : ''}"
           data-id="${m.id}" onclick="Chat.selectMaterial('${m.id}')">
        <div class="material-icon">${_getFileIcon(m.type || m.file_type)}</div>
        <div class="material-info">
          <div class="material-name">${_escHtml(m.name || m.title || '閺堫亜鎳￠崥?)}</div>
          <div class="material-meta">${m.type || m.file_type || ''} 璺?${m.upload_time || ''}</div>
        </div>
      </div>
    `).join('');
  }

  /** 鐠у嫭鏋￠柅澶嬪閸欐ɑ娲?*/
  function _onMaterialChange(e) {
    state.selectedMaterialId = e.target.value;
    _updateContextHint();
    _renderSidebarList(); // 閺囧瓨鏌婃笟褎鐖柅澶夎厬閹?    console.log('[Chat] 閸掑洦宕茬挧鍕灐:', state.selectedMaterialId || '(閺咁噣鈧艾顕拠?');
  }

  /** 娴犲簼鏅堕弽蹇曞仯閸戝鈧鑵戠挧鍕灐閿涘牆鍙曢崗杈ㄦ煙濞夋洩绱?*/
  function selectMaterial(id) {
    state.selectedMaterialId = id;
    if ($.materialSelect) $.materialSelect.value = id || '';
    _updateContextHint();
    _renderSidebarList();
  }

  /** 閺囧瓨鏌婂銉ュ徔閺嶅繑褰佺粈鐑樻瀮鐎?*/
  function _updateContextHint() {
    if (!$.contextHint) return;
    if (state.selectedMaterialId) {
      const mat = state.materials.find(m => String(m.id) === state.selectedMaterialId);
      $.contextHint.textContent = '棣冩惛 瀵洜鏁? ' + (mat ? (mat.name || mat.title) : '');
      $.contextHint.style.display = '';
    } else {
      $.contextHint.textContent = '';
      $.contextHint.style.display = 'none';
    }
  }


  /* ==================== 鐎电鐦界粻锛勬倞 ==================== */

  /** 閺傛澘顕拠婵撶窗濞撳懐鈹栧☉鍫熶紖閵嗕焦浠径宥嗩偨鏉╁酣銆?*/
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

    console.log('[Chat] 閺傛澘顕拠婵嗗嚒瀵偓閸?);
  }


  /* ==================== 濞戝牊浼呴崣鎴︹偓?==================== */

  async function _handleSend() {
    const text = ($.input.value || '').trim();
    if (!text || state.isThinking) return;

    // 闂呮劘妫屽▎銏ｇ箣妞?    _toggleWelcome(false);
    // 閺勫墽銇氬☉鍫熶紖鐎圭懓娅?    if ($.messagesEl) $.messagesEl.style.display = '';

    // 鏉╄棄濮為悽銊﹀煕濞戝牊浼?    _appendMessage({ role: 'user', content: text });
    _scrollToBottom();
    _resetInput();

    // 閺勫墽銇氶幀婵娾偓鍐Ц閹?    _toggleThinking(true);
    _setInputDisabled(true);

    try {
      // 鐠嬪啰鏁?API
      const materialIds = state.selectedMaterialId ? [state.selectedMaterialId] : [];
      const response = await API.chat.send(text, materialIds, undefined);

      _toggleThinking(false);
      _setInputDisabled(false);

      // 鏉╄棄濮?AI 閸ョ偛顦?      _appendMessage({
        role: 'assistant',
        content: (response.data?.reply || response.reply || response.message || response.content || '閺€璺哄煂娴ｇ姷娈戝☉鍫熶紖娴滃棎鈧?,
        sources: response.data?.sources || response.sources || response.references || [],
      });

    } catch (err) {
      _toggleThinking(false);
      _setInputDisabled(false);

      // API 婢惰精瑙﹂弮鍓佹暏 Mock 閺佺増宓佸鏃傘仛閿涘牆绱戦崣鎴︽▉濞堢绱?      console.warn('[Chat] API 鐠嬪啰鏁ゆ径杈Е閿涘奔濞囬悽銊δ侀幏鐔锋礀婢?', err.message);
      const mock = _getMockReply(text);
      _appendMessage({
        role: 'assistant',
        content: mock.text,
        sources: mock.sources,
      });
    }

    _scrollToBottom();
  }

  /** 闁款喚娲忔禍瀣╂閿涙nter 閸欐垿鈧?/ Shift+Enter 閹广垼顢?*/
  function _onInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _handleSend();
    }
  }

  /** 鏉堟挸鍙嗗鍡氬殰閸斻劑鐝惔?*/
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


  /* ==================== 濞戝牊浼呭〒鍙夌厠 ==================== */

  /** 鏉╄棄濮炴稉鈧弶鈩冪Х閹垰鍩岄崚妤勩€?*/
  function _appendMessage(msg) {
    state.messages.push(msg);

    if (!$.messagesEl) return;

    const row = document.createElement('div');
    row.className = 'msg-row ' + (msg.role === 'user' ? 'user' : 'assistant');
    row.dataset.msgId = Date.now() + Math.random().toString(36).slice(2, 8);

    if (msg.role === 'user') {
      row.innerHTML = `
        <div class="msg-avatar user">閹?/div>
        <div class="msg-bubble">${_escHtml(msg.content)}</div>`;
    } else {
      const mdHtml = _markdown(msg.content);
      const sourceHtml = (msg.sources && msg.sources.length)
        ? `<div class="msg-source-toggle" onclick="Chat.toggleSource(this)">
             <span class="toggle-arrow">閳?/span>
             閺屻儳婀呭鏇犳暏閺夈儲绨?(${msg.sources.length} 閺?
           </div>
           <div class="msg-source-body">
             ${msg.sources.map(s => `
               <div class="source-item">
                 <div class="source-title">${_escHtml(s.title || s.material_name || '瀵洜鏁ら弶銉︾爱')}</div>
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
   * 鏉炲鍣虹痪?Markdown 閳?HTML 鏉烆剚宕查崳?   * 閺€顖涘瘮閿涙碍鐖ｆ０?/ 缁鏋╂担?/ 鐞涘苯鍞存禒锝囩垳 / 娴狅絿鐖滈崸?/ 閺冪姴绨張澶婄碍閸掓銆?/ 瀵洜鏁?/ 閸掑棝娈х痪?/ 鐞涖劍鐗?/ 濞堜絻鎯?   */
  function _markdown(text) {
    if (!text) return '';

    // HTML 鐎圭偘缍嬫潪顑跨疅閿涘牆婀憴锝嗙€介崜宥勭箽閹躲倧绱?    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 娴狅絿鐖滈崸?```...``` 閿涘牆鍘涙径鍕倞閿涘矂妲诲銏犲敶闁劌鍞寸€圭顫︽潪顑跨疅閿?    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      return '<pre><code class="lang-' + lang + '">' + code.trimEnd() + '</code></pre>';
    });

    // 鐞涘苯鍞存禒锝囩垳 `...`
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 閺嶅洭顣?# ## ### ####
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 缁ぞ缍嬮崪灞炬灘娴?**...** 閸?*...*閿涘牏鐭栨担鎾茬喘閸忓牆灏柊宥夋毐閺嶇厧绱￠敍?    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // 瀵洜鏁ょ悰?> ...
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // 濮樻潙閽╃痪?--- 閹?***
    html = html.replace(/^(?:---|\*\*\*)$/gm, '<hr>');

    // 閺冪姴绨崚妤勩€?- item 閹?* item
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    // 鏉╃偟鐢婚惃?li 閸栧懓锛欐稉?ul
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // 閺堝绨崚妤勩€?1. item
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<oli>$1</oli>');
    html = html.replace(/((?:<oli>.*<\/oli>\n?)+)/g, (_m, body) => {
      return '<ol>' + body.replace(/<\/?oli>/g, (tag) =>
        tag === '<oli>' ? '<li>' : '</li>'
      ) + '</ol>';
    });

    // 鐞涖劍鐗?|...|
    const tablePattern = /^(\|.+\|)\n(\|[-:\s|]+\|)\n((?:\|.+\|\n?)*)/gm;
    html = html.replace(tablePattern, (_match, headerLine, divider, body) => {
      const headers = headerLine.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const rows = body.trim().split('\n').map(line => {
        const cells = line.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    });

    // 閸欏本宕茬悰灞藉瀻濞堜絻鎯ら敍鍫濆⒖娴ｆ瑧娈戦棃鐐寸垼缁涙崘顢戦崠鍛帮紮娑?p閿?    html = html.split('\n\n').map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // 瀹歌尪顫﹂弽鍥╊劮閸栧懓锛欓惃鍕瑝閸愬秴顦╅悶?      if (/^<(ul|ol|pre|blockquote|h[1-4]|hr|table|li)/.test(trimmed)) return trimmed;
      // 缁绢垱鏋冮張顒冾攽 閳?p
      return '<p>' + trimmed + '</p>';
    }).join('\n');

    // 濞撳懐鎮婄粚?p 閸滃矁绻涚紒顓犫敄鐞?    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/\n{3,}/g, '\n\n');

    return html;
  }


  /* ==================== 瀵洜鏁ら弶銉︾爱閹舵ê褰?==================== */

  window.Chat = window.Chat || {};
  /** 閸掑洦宕插鏇犳暏閺夈儲绨仦鏇炵磻/閺€鎯版崳閿涘牓鈧俺绻?onclick 閸忋劌鐪拫鍐暏閿?*/
  function toggleSource(toggleEl) {
    if (!toggleEl) return;
    toggleEl.classList.toggle('expanded');
    const body = toggleEl.nextElementSibling;
    if (body && body.classList.contains('msg-source-body')) {
      body.classList.toggle('visible');
    }
  };


  /* ==================== UI 鏉堝懎濮弬瑙勭《 ==================== */

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

  /** 閼惧嘲褰囬弬鍥︽缁鐎烽崶鐐垼鐎涙顑?*/
  function _getFileIcon(type) {
    if (!type) return '棣冩惈';
    const t = type.toLowerCase();
    if (t.includes('pdf')) return '棣冩憙';
    if (t.includes('ppt') || t.includes('pptx')) return '棣冩惓';
    if (t.includes('md') || t.includes('markdown')) return '棣冩憫';
    return '棣冩惈';
  }

  /** HTML 鏉烆兛绠?*/
  function _escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }


  /* ==================== Mock 閺佺増宓侀敍鍫濈磻閸欐垶绱ㄧ粈铏规暏閿?==================== */

  function _getMockReply(question) {
    const idx = ++state.mockIndex;

    // 閸╄桨绨弰顖氭儊閺堝鈧瀚ㄧ挧鍕灐閿涘矁绻戦崶鐐扮瑝閸氬瞼娈?Mock 閸ョ偛顦?    if (state.selectedMaterialId) {
      const replies = [
        {
          text: `**閸忓厖绨妴?{question}閵嗗秶娈戦梻顕€顣介敍?*\n\n閺嶈宓佹担鐘烩偓澶嬪閻ㄥ嫯绁弬娆忓敶鐎圭櫢绱濋幋鎴炴降娑撹桨缍樼憴锝囩摕閿涙瓡n\n### 鐟曚胶鍋ｉ幀鑽ょ波\n\n- **閺嶇绺惧鍌氬悍**閿涙俺绻栭弰顖欑娑擃亪鍣哥憰浣烘畱閻儴鐦戦悙鐧哥礉闂団偓鐟曚胶鎮婄憴锝呭従閸╃儤婀伴崢鐔烘倞\n- **閸忔娊鏁紒鍡氬Ν**閿涙艾婀€圭偤妾惔鏃傛暏娑擃參娓剁憰浣规暈閹板繗绔熼悾灞惧剰閸愮がn- **瀵ゆ湹鍑犻幀婵娾偓?*閿涙艾褰叉禒銉ョ毦鐠囨洑绮犳径姘嚋鐟欐帒瀹抽弶銉ф倞鐟欙綀绻栨稉顏堟６妫版n\n> 棣冩寱 閹绘劗銇氶敍姘崇箹娑擃亝顩ц箛闈涙躬閸氬酣娼伴惃鍕彿閼哄倷鑵戞导姘冀婢跺秴鍤悳甯礉瀵ら缚顔呴柌宥囧仯閹哄本褰欓妴淇搉\n婵″倹鐏夋潻妯绘箒閸忔湹绮梻顕€顣介敍宀勬閺冨爼妫堕幋鎴磼`,
          sources: [
            { title: '閸欏倽鈧啳绁弬?A', snippet: '閻╃鍙у▓浣冩儰閸愬懎顔愰幗妯款洣...鏉╂瑩鍣风仦鏇犮仛 AI 瀵洜鏁ら惃鍕徔娴ｆ挸甯弬鍥╁濞堢偣鈧? },
            { title: '閸欏倽鈧啳绁弬?B', snippet: '閸欙缚绔存径鍕祲閸忓磭娈戝鏇犳暏閺夈儲绨崘鍛啇...' },
          ],
        },
        {
          text: `鏉╂瑦妲告稉顏勩偨闂傤噣顣介敍浣筋唨閹存垵鐔€娴滃氦绁弬娆忓敶鐎圭顕涚紒鍡氼嚛閺勫函绱癨n\n## 1. 閸╃儤婀扮€规矮绠焅n\n娴犲氦绁弬娆庤厬閸欘垯浜掗惇瀣煂閿涘矁顕氬鍌氬悍閻ㄥ嫭顒滃蹇撶暰娑斿顩ф稉瀣剁窗\n\n**鐎规矮绠熼崘鍛啇**閿涙俺绻栭弰顖氼嚠闂傤噣顣介弽绋跨妇閻ㄥ嫯袙闁插﹥鈧勫伎鏉╄埇鈧繐n\n## 2. 閸忔娊鏁悧瑙勨偓顪\n| 閻楄鈧?| 鐠囧瓨妲?|\n|------|------|\n| 閻楄鈧渿 | 閹诲繗鍫穱鈩冧紖 |\n| 閻楄鈧湀 | 閹诲繗鍫穱鈩冧紖 |\n| 閻楄鈧湁 | 閹诲繗鍫穱鈩冧紖 |\n\n## 3. 鐎圭偤妾惔鏃傛暏\n\n閸︺劌鐤勯梽鍛簚閺咁垯鑵戦敍灞惧灉娴狀剟娓剁憰浣规暈閹板繋浜掓稉瀣殤閻?..\n\n\`\`\`python\n# 缁€杞扮伐娴狅絿鐖淺ndef example():\n    pass\n\`\`\`\n\n鐢本婀滄潻娆掑厴鐢喖鍩屾担鐙呯磼`,
          sources: [
            { title: '鐎涳缚绡勭挧鍕灐 缁?缁?, snippet: '缁楊兛绗佺粩鐘茬磻缁″洤顕拠銉︻洤韫囦絻绻樼悰灞肩啊缁崵绮洪幀褌绮欑紒宥忕礉濞戠數娲婃禍鍡欐倞鐠佸搫鐔€绾偓閸滃苯鐤勭捄闈涚安閻劋琚辨稉顏勭湴闂?..' },
          ],
        },
        {
          text: `閹存垶鐓℃禍鍡曠娑撳绁弬娆欑礉閸忓厖绨?**${question}** 閻ㄥ嫯袙缁涙柨顩ф稉瀣剁窗\n\n### 閻╁瓨甯撮崶鐐电摕\n\n閺嶈宓佺挧鍕灐娑擃厾娈戦幓蹇氬牚閿涘瞼鐡熷鍫濆讲娴犮儰绮犳禒銉ょ瑓閸戠姳閲滅紒鏉戝閻炲棜袙閿涙瓡n\n1. **缁楊兛绔寸紒鏉戝** 閳?鐟欙綁鍣寸拠瀛樻閺傚洤鐡n2. **缁楊兛绨╃紒鏉戝** 閳?閺囩顕涚紒鍡欐畱鐏炴洖绱慭n3. **缁楊兛绗佺紒鏉戝** 閳?鐞涖儱鍘栫憰浣哄仯\n\n---\n\n### 濞夈劍鍓版禍瀣€峔n\n> 鏉╂瑩鍣烽惃鍕敶鐎瑰綊娓剁憰浣虹波閸氬牆澧犻棃銏㈡畱缁旂姾濡稉鈧挧椋庢倞鐟欙絻鈧繐n\n閺堝绗夊〒鍛殶閻ㄥ嫬婀撮弬鐟板讲娴犮儳鎴风紒顓℃嫹闂傤噯绱抈,
          sources: [
            { title: '閸欏倽鈧啳绁弬?缁?閼?, snippet: '鐠囥儱鐨懞鍌欑瑩闂傘劏顓跨拋杞扮啊鏉╂瑤閲滄稉濠氼暯閿涘本褰佹笟娑楃啊鐎瑰本鏆ｉ惃鍕腹鐎佃壈绻冪粙瀣嫲娓氬顣?..' },
            { title: '閸欏倽鈧啳绁弬?闂勫嫬缍?, snippet: '闂勫嫬缍嶆稉顓炲瘶閸氼偂绨℃０婵嗩樆閻ㄥ嫬寮懓鍐т繆閹垰鎷扮悰銉ュ帠閺夋劖鏋?..' },
            { title: '閸欏倽鈧啳绁弬?缂佸啩绡勬０?, snippet: '闁板秴顨滅紒鍐х瘎閸欘垯浜掔敮顔煎И瀹糕晛娴愮€电绻栨稉顏嗙叀鐠囧棛鍋ｉ惃鍕倞鐟?..' },
          ],
        },
      ];
      const r = replies[(idx - 1) % replies.length];
      return { text: r.text, sources: r.sources };
    }

    // 閺咁噣鈧艾顕拠婵嚹佸蹇ョ礄閺堫亪鈧绁弬娆欑礆
    const generalReplies = [
      {
        text: `娴ｇ姴銈介敍浣瑰灉閺?AI 鐎涳缚绡勭€电厧绗€ 棣冩啟\n\n閻╊喖澧犳担鐘虹箷濞屸剝婀侀柅澶嬪娴犺缍嶇€涳缚绡勭挧鍕灐閿涘本澧嶆禒銉﹀灉閸︺劋浜?*閺咁噣鈧艾顕拠婵嚹佸?*閸ョ偟鐡熼妴淇搉\n### 婵″倷缍嶅鈧慨瀣劅娑旂媴绱礬n\n1. 閸︺劌涔忔笟褔娼伴弶鎸庡灗妞ゅ爼鍎存稉瀣濡?**闁瀚ㄦ稉鈧禒鍊熺カ閺?*\n2. 闁瀚ㄩ崥搴㈠灉娴?**閸╄桨绨挧鍕灐閸愬懎顔?* 娑撹桨缍樼憴锝囩摕闂傤噣顣絓n3. 娴ｇ姳绡冮崣顖欎簰閸忓牅绗傛导鐘虫煀鐠у嫭鏋￠崚鑸偓?*鐠у嫭鏋℃惔?*閵嗗硵n\n閺堝绮堟稊鍫熷灉閸欘垯浜掔敮顔荤稑閻ㄥ嫬鎮ч敍鐒?
        sources: [],
      },
      {
        text: `閺€璺哄煂娴ｇ姷娈戦梻顕€顣介敍姘モ偓?{question}閵嗗硵n\n棣冩寱 **瑜版挸澧犻弰顖涙珮闁艾顕拠婵嚹佸?*\n\n婵″倹鐏夋担鐘茬瑖閺堟稒鍨滈崺杞扮艾閺屾劒鍞ょ€涳缚绡勭挧鍕灐閺夈儱娲栫粵鏃撶礉鐠囧嘲婀い鍫曞劥閻ㄥ嫪绗呴幏澶嬵攱娑擃參鈧瀚ㄧ€电懓绨茬挧鍕灐閵嗗倿鈧瀚ㄩ崥搴礉閹存垹娈戦崶鐐电摕娴兼矮寮楅弽鐓庣穿閻劏绁弬娆庤厬閻ㄥ嫬鍞寸€圭櫢绱濋獮鑸电垼濞夈劌鍤径鍕┾偓淇搉\n娴ｇ姴褰叉禒銉╂６閻ㄥ嫰妫舵０妯笺仛娓氬绱癨n- 鏉╂瑤閲滃鍌氬悍閺勵垯绮堟稊鍫熷壈閹繐绱礬n- 閼虫垝绗夐懗鎴掑娓氬顕╅弰搴吹\n- 鐎瑰啫鎷?XX 閺堝绮堟稊鍫濆隘閸掝偓绱礰,
        sources: [],
      },
      {
        text: `婵傜晫娈戦敍灞惧灉閻炲棜袙娴ｇ姷娈戦梻顕€顣芥禍鍡磼\n\n閻╊喖澧犲▽鈩冩箒閸忓疇浠堟禒璁崇秿鐠у嫭鏋￠敍灞惧娴犮儴绻栭弰顖欑閼割剚鈧呮畱閸ョ偟鐡熼妴鍌氼洤閺嬫粈缍樻稉濠佺炊楠炲爼鈧瀚ㄦ禍鍡楊劅娑旂姾绁弬娆欑礉閹存垵褰叉禒銉﹀絹娓氭稒娲跨划鎯у櫙閵嗕礁鐢鏇犳暏閸戝搫顦╅惃鍕礀缁涙柣鈧繐n\n**娑撳绔村銉ョ紦鐠侇噯绱?*\n- 閻愮懓鍤锔挎櫠 閵? 娑撳﹣绱剁挧鍕灐閵?閹稿鎸砛n- 閹存牞鈧懐娲块幒銉﹀Ω閺傚洣娆㈤幏鏍ㄥ閸掕埇鈧矁绁弬娆忕氨閵嗗秹銆夐棃顣俷\n閸戝棗顦總鎴掔啊娑斿鎮楅崨濠呯様閹存埊绱濋幋鎴滄粦瀵偓婵顒滃蹇擃劅娑?棣冩畬`,
        sources: [],
      },
    ];
    const gr = generalReplies[(idx - 1) % generalReplies.length];
    return { text: gr.text, sources: gr.sources };
  }


  /* ==================== 閸忣剙鍙￠幒銉ュ經 ==================== */
  return {
    init,
    newChat,
    selectMaterial,
    toggleSource: toggleSource,
  };
})();
