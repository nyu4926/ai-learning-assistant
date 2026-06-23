/* ============================================
   progress.js — 进度模块（IIFE）
   功能：统计卡片 / 雷达图 / 知识点列表
        / 资料笔记(自动保存) / 薄弱点
   ============================================ */

const Progress = (() => {
  'use strict';

  /* ==================== Mock 数据 ==================== */

  // 知识点定义（6个维度）
  var _knowledgePoints = [
    { id: 'kp1', name: 'Transformer 架构', score: 85 },
    { id: 'kp2', name: '注意力机制',       score: 72 },
    { id: 'kp3', name: '预训练与微调',     score: 60 },
    { id: 'kp4', name: '词向量表示',       score: 90 },
    { id: 'kp5', name: '序列模型',         score: 55 },
    { id: 'kp6', name: '模型评估方法',     score: 78 }
  ];

  // 资料列表（模拟）
  var _materials = [
    { id: 'm1', name: 'Transformer 入门指南', type: 'pdf',
      pages: 42, studiedAt: '04-28', studyCount: 3,
      mastery: 82, note: '重点掌握 Self-Attention 的 Q/K/V 计算' },
    { id: 'm2', name: '深度学习基础', type: 'md',
      pages: 68, studiedAt: '04-29', studyCount: 5,
      mastery: 75, note: '' },
    { id: 'm3', name: 'NLP 实战手册', type: 'ppt',
      pages: 35, studiedAt: '05-01', studyCount: 2,
      mastery: 58, note: 'BERT 章节需要复习' }
  ];

  // 测评历史（用于计算平均分等）
  var _quizHistory = [
    { date: '05-01', material: 'Transformer 入门指南', score: 8, total: 10 },
    { date: '04-30', material: '深度学习基础',          score: 7, total: 10 },
    { date: '04-29', material: 'NLP 实战手册',          score: 5, total: 10 }
  ];

  // 笔记自动保存状态
  var _saveTimers = {};

  /* ==================== DOM 缓存 ==================== */
  var $ = {};

  function _cacheDom() {
    $.statTotalMaterials = document.getElementById('pg-total-materials');
    $.statMastered      = document.getElementById('pg-mastered');
    $.statStudyCount    = document.getElementById('pg-study-count');
    $.statAvgScore      = document.getElementById('pg-avg-score');
    $.statWeakCount     = document.getElementById('pg-weak-count');

    $.radarSvg           = document.getElementById('pg-radar-svg');
    $.radarLegend        = _qs('.pg-radar-legend');
    $.kpList             = document.getElementById('pg-kp-list');

    $.matList            = document.getElementById('pg-mat-list');

    $.weakSection        = document.getElementById('pg-weak-section');
    $.weakHint           = document.getElementById('pg-weak-hint');
    $.weakList           = document.getElementById('pg-weak-list');
  }

  function _qs(sel) {
    return document.querySelector(sel);
  }


  /* ==================== 初始化 & 绑定 ==================== */

  function init() {
    _cacheDom();
    if ($.statTotalMaterials) {
      _renderAll();
    }
  }

  function refresh() {
    _renderAll();
  }

  function _renderAll() {
    _renderStats();
    _renderRadarChart();
    _renderKpList();
    _renderMaterials();
    _renderWeakPoints();
  }


  /* ════════════════════════════════════
     ① 统计卡片（5个）
     ════════════════════════════════════ */

  function _renderStats() {
    var totalMat    = _materials.length;
    var mastered    = _materials.filter(function(m) { return m.mastery >= 70; }).length;
    var studyCount  = _quizHistory.length;
    var avgScore    = _calcAvgScore();
    var weakCount   = _getWeakPoints().length;

    _animNumber($.statTotalMaterials, totalMat);
    _animNumber($.statMastered, mastered);
    _animNumber($.statStudyCount, studyCount);

    if (studyCount > 0) {
      $.statAvgScore.textContent = avgScore.toFixed(1);
    } else {
      $.statAvgScore.textContent = '--';
    }
    $.statWeakCount.textContent = weakCount;
  }

  function _calcAvgScore() {
    if (_quizHistory.length === 0) return 0;
    var sum = 0;
    for (var i = 0; i < _quizHistory.length; i++) {
      sum += (_quizHistory[i].score / _quizHistory[i].total) * 100;
    }
    return sum / _quizHistory.length;
  }

  // 数字递增动画（复用 quiz.js 同款思路）
  function _animNumber(el, target) {
    if (!el) return;
    var start = parseInt(el.textContent) || 0;
    var duration = 600;
    var startTime = null;

    function step(ts) {
      if (!startTime) startTime = ts;
      var p = Math.min((ts - startTime) / duration, 1);
      // easeOutExpo
      var eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = Math.round(start + (target - start) * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }


  /* ════════════════════════════════════
     ② SVG 雷达图
     ════════════════════════════════════ */

  function _renderRadarChart() {
    if (!$.radarSvg) return;

    var svg = $.radarSvg;
    var cx = 160, cy = 160, maxR = 110; // viewBox=320x320，中心160,160

    // 清空
    svg.innerHTML = '';

    var n = _knowledgePoints.length;
    var angleStep = (Math.PI * 2) / n;

    // ---- 绘制背景网格（5层五边形） ----
    var levels = [0.2, 0.4, 0.6, 0.8, 1.0];
    for (var li = 0; li < levels.length; li++) {
      var r = maxR * levels[li];
      var pts = '';
      for (var vi = 0; vi < n; vi++) {
        var a = angleStep * vi - Math.PI / 2;
        var px = cx + r * Math.cos(a);
        var py = cy + r * Math.sin(a);
        pts += px + ',' + py + ' ';
      }
      var poly = _createSvgEl('polygon');
      poly.setAttribute('points', pts.trim());
      poly.setAttribute('class', 'pg-radar-grid');
      svg.appendChild(poly);
    }

    // ---- 轴线（从中心到各顶点） ----
    for (var ai = 0; ai < n; ai++) {
      var ang = angleStep * ai - Math.PI / 2;
      var ex = cx + maxR * Math.cos(ang);
      var ey = cy + maxR * Math.sin(ang);

      var line = _createSvgEl('line');
      line.setAttribute('x1', cx); line.setAttribute('y1', cy);
      line.setAttribute('x2', ex); line.setAttribute('y2', ey);
      line.setAttribute('class', 'pg-radar-axis');
      svg.appendChild(line);

      // 标签文字
      var labelR = maxR + 22;
      var lx = cx + labelR * Math.cos(ang);
      var ly = cy + labelR * Math.sin(ang);

      var text = _createSvgEl('text');
      text.setAttribute('x', lx);
      text.setAttribute('y', ly + 4); // 微调垂直居中
      text.setAttribute('class', 'pg-radar-text');
      text.textContent = _knowledgePoints[ai].name.replace(/(.{4})/g, '$1\n').trim(); // 简短截断显示
      svg.appendChild(text);
    }

    // ---- 数据多边形 + 顶点圆 ----
    var dataPts = '';
    var dotPositions = [];
    for (var di = 0; di < n; di++) {
      var val = _knowledgePoints[di].score / 100; // 归一化
      var da = angleStep * di - Math.PI / 2;
      var dr = maxR * val;
      var dx = cx + dr * Math.cos(da);
      var dy = cy + dr * Math.sin(da);
      dataPts += dx + ',' + dy + ' ';
      dotPositions.push({ x: dx, y: dy });
    }

    // 多边形
    var dataPoly = _createSvgEl('polygon');
    dataPoly.setAttribute('points', dataPts.trim());
    dataPoly.setAttribute('class', 'pg-radar-polygon');
    dataPoly.setAttribute('id', 'pg-radar-data-poly');
    // 动画入场：从中心展开（先设为全零再动画到目标值）
    var centerPts = '';
    for (var zi = 0; zi < n; zi++) { centerPts += cx + ',' + cy + ' '; }
    dataPoly.setAttribute('points', centerPts.trim());
    svg.appendChild(dataPoly);

    // 顶点圆点
    for (var dodi = 0; dodi < dotPositions.length; dodi++) {
      var dot = _createSvgEl('circle');
      dot.setAttribute('cx', dotPositions[dodi].x);
      dot.setAttribute('cy', dotPositions[dodi].y);
      dot.setAttribute('class', 'pg-radar-dot');
      dot.setAttribute('opacity', '0');
      dot.setAttribute('id', 'pg-dot-' + dodi);
      svg.appendChild(dot);
    }

    // 触发雷达图展开动画
    setTimeout(function() {
      dataPoly.setAttribute('points', dataPts.trim());
      for (var dii = 0; dii < dotPositions.length; dii++) {
        var dd = document.getElementById('pg-dot-' + dii);
        if (dd) { dd.setAttribute('opacity', '1'); }
      }
    }, 100);

    // 渲染图例
    _renderLegend();
  }

  function _createSvgEl(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  function _renderLegend() {
    if (!$.radarLegend) return;
    $.radarLegend.innerHTML = '';
    for (var i = 0; i < _knowledgePoints.length; i++) {
      var item = document.createElement('span');
      item.className = 'pg-legend-item';
      item.innerHTML = '<span class="pg-legend-dot"></span>' +
                       '<span>' + _escHtml(_knowledgePoints[i].name) + '</span>';
      $.radarLegend.appendChild(item);
    }
  }


  /* ════════════════════════════════════
     ③ 知识点进度列表（右侧）
     ════════════════════════════════════ */

  function _renderKpList() {
    if (!$.kpList) return;
    $.kpList.innerHTML = '';

    for (var i = 0; i < _knowledgePoints.length; i++) {
      var kp = _knowledgePoints[i];
      var lv = _getLevel(kp.score);
      var row = document.createElement('div');
      row.className = 'pg-kp-row';

      row.innerHTML =
        '<div class="pg-kp-name" title="' + _escHtml(kp.name) + '">' +
          _escHtml(kp.name) +
        '</div>' +
        '<div class="pg-kp-bar-wrap">' +
          '<div class="pg-kp-bar-fill lv-' + lv.key + '" style="width:' + kp.score + '%"></div>' +
        '</div>' +
        '<div class="pg-kp-level lv-' + lv.key + '">' + lv.label + '</div>';

      $.kpList.appendChild(row);
    }
  }

  // 根据分数返回等级
  function _getLevel(score) {
    if (score >= 80) return { key: 'excellent', label: '优秀' };
    if (score >= 65) return { key: 'good',      label: '良好' };
    if (score >= 45) return { key: 'average',   label: '及格' };
    return               { key: 'weak',      label: '薄弱' };
  }


  /* ════════════════════════════════════
     ④ 资料详情 + 笔记区（防抖自动保存）
     ════════════════════════════════════ */

  function _renderMaterials() {
    if (!$.matList) return;
    $.matList.innerHTML = '';

    var typeIcons = {
      pdf: '<span style="color:#f87171">📕</span>',
      md:  '<span style="color:#4ade80">📝</span>',
      ppt: '<span style="color:#fbbf24">📊</span>',
      word: '<span style="color:#60a5fa">📘</span>'
    };

    for (var i = 0; i < _materials.length; i++) {
      var m = _materials[i];
      var icon = typeIcons[m.type] || '📄';
      var lv = _getLevel(m.mastery);
      var matLvLabel = lv.label;
      var matLvKey = lv.key;

      var card = document.createElement('div');
      card.className = 'pg-mat-card';
      card.id = 'pg-mat-' + m.id;

      card.innerHTML =
        '<div class="pg-mat-header">' +
          '<div class="pg-mat-info">' +
            '<div class="pg-mat-icon">' + icon + '</div>' +
            '<div>' +
              '<div class="pg-mat-name">' + _escHtml(m.name) + '</div>' +
              '<div class="pg-mat-meta">' + m.type.toUpperCase() + ' · ' + m.pages + '页 · 学习于 ' + m.studiedAt + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="pg-mat-stats">' +
            '<div class="pg-mat-stat">' +
              '<div class="pg-mat-stat-val" style="color:' + _levelColor(matLvKey) + '">' + m.mastery + '%</div>' +
              '<div class="pg-mat-stat-lbl">掌握度</div>' +
            '</div>' +
            '<div class="pg-mat-stat">' +
              '<div class="pg-mat-stat-val">' + m.studyCount + '</div>' +
              <div class="pg-mat-stat-lbl">次数</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="pg-mat-body">' +
          '<div class="pg-note-area" data-mat-id="' + m.id + '">' +
            '<textarea placeholder="记录学习笔记、心得体会...（输入后自动保存）"' +
                      data-note-id="' + m.id + '">' + _escHtml(m.note || '') + '</textarea>' +
            '<span class="pg-save-hint" id="hint-' + m.id + '">已保存</span>' +
          '</div>' +
        '</div>';

      $.matList.appendChild(card);
    }

    // 绑定笔记输入事件（防抖自动保存）
    _bindNoteEvents();
  }

  function _levelColor(key) {
    switch (key) {
      case 'excellent': return '#4ade80';
      case 'good':      return 'var(--gold)';
      case 'average':   return '#f59e0b';
      case 'weak':      return '#f87171';
      default:          return 'var(--text-muted)';
    }
  }

  function _bindNoteEvents() {
    var textareas = document.querySelectorAll('.pg-note-area textarea');
    for (var i = 0; i < textareas.length; i++) {
      (function(ta) {
        ta.addEventListener('input', function() {
          var matId = this.getAttribute('data-note-id');
          _showSaveHint(matId, 'saving');

          // 防抖：800ms 后自动保存
          if (_saveTimers[matId]) clearTimeout(_saveTimers[matId]);
          _saveTimers[matId] = setTimeout(function() {
            _saveNote(matId, ta.value);
          }, 800);
        });
      })(textareas[i]);
    }
  }

  function _showSaveHint(matId, state) {
    var hint = document.getElementById('hint-' + matId);
    if (!hint) return;
    hint.className = 'pg-save-hint ' + state;
    hint.textContent = state === 'saving' ? '保存中...' : '已保存 ✓';
    if (state === 'saved') {
      setTimeout(function() {
        hint.className = 'pg-save-hint';
      }, 2000);
    }
  }

  // 模拟保存（实际应调 API）
  function _saveNote(matId, content) {
    // 更新本地数据
    for (var i = 0; i < _materials.length; i++) {
      if (_materials[i].id === matId) {
        _materials[i].note = content;
        break;
      }
    }
    // 模拟 API 延迟后标记已保存
    setTimeout(function() {
      _showSaveHint(matId, 'saved');
    }, 300);
  }


  /* ════════════════════════════════════
     ⑤ 薄弱点区块
     ════════════════════════════════════ */

  function _getWeakPoints() {
    return _knowledgePoints.filter(function(kp) {
      return kp.score < 65;
    });
  }

  function _renderWeakPoints() {
    if (!$.weakSection) return;
    var weaks = _getWeakPoints();

    if (weaks.length === 0) {
      $.weakSection.style.display = 'none';
      return;
    }

    $.weakSection.style.display = 'block';
    $.weakHint.textContent = '(' + weaks.length + '个知识点低于 65 分)';
    $.weakList.innerHTML = '';

    for (var i = 0; i < weaks.length; i++) {
      var w = weaks[i];
      var tag = document.createElement('div');
      tag.className = 'pg-weak-tag';
      tag.innerHTML =
        '<span class="pg-weak-tag-icon">🎯</span>' +
        '<span class="pg-weak-tag-name">' + _escHtml(w.name) + '</span>' +
        '<span class="pg-weak-tag-score">' + w.score + '分</span>';
      $.weakList.appendChild(tag);
    }
  }


  /* ==================== 工具函数 ==================== */

  function _escHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }


  /* ==================== 公共接口 ==================== */

  return {
    init: init,
    refresh: refresh
  };

})();
