/* ============================================
   report.js — 报告/周报生成模块（IIFE）
   功能：日期选择 / AI汇总报告 / 下载 / 历史记录
   ============================================ */

const Report = (() => {
  'use strict';

  /* ==================== 状态 ==================== */
  var _currentRange = 'week'; // week | month | all | custom
  var _isGenerating = false;
  var _historyReports = [];   // 已生成的报告列表

  /* Mock 数据源（复用 progress.js 同款数据风格） */
  var _mockData = {
    materials: [
      { name: 'Transformer 入门指南', type: 'PDF', pages: 42, studiedAt: '04-28', mastery: 82 },
      { name: '深度学习基础',           type: 'MD',  pages: 68, studiedAt: '04-29', mastery: 75 },
      { name: 'NLP 实战手册',            type: 'PPT', pages: 35, studiedAt: '05-01', mastery: 58 }
    ],
    quizzes: [
      { date: '05-01', material: 'Transformer 入门指南', score: 8, total: 10, accuracy: 80 },
      { date: '04-30', material: '深度学习基础',          score: 7, total: 10, accuracy: 70 },
      { date: '04-29', material: 'NLP 实战手册',          score: 5, total: 10, accuracy: 50 }
    ],
    knowledgePoints: [
      { name: 'Transformer 架构', score: 85 },
      { name: '注意力机制',       score: 72 },
      { name: '预训练与微调',     score: 60 },
      { name: '词向量表示',       score: 90 },
      { name: '序列模型',         score: 55 },
      { name: '模型评估方法',     score: 78 }
    ],
    studySessions: [
      { date: '05-01 14:30', duration: '45分钟', material: 'NLP 实战手册', topic: 'BERT 模型原理' },
      { date: '04-30 20:15', duration: '60分钟', material: '深度学习基础',   topic: '反向传播算法' },
      { date: '04-29 16:00', duration: '35分钟', material: 'Transformer 入门指南', topic: 'Self-Attention 计算' },
      { date: '04-28 19:30', duration: '50分钟', material: 'Transformer 入门指南', topic: 'Encoder-Decoder 架构' }
    ]
  };

  /* ==================== DOM 缓存 ==================== */
  var $ = {};

  function _cacheDom() {
    $.quickBtns       = document.querySelectorAll('.rp-quick-btn');
    $.startDate        = document.getElementById('rp-start-date');
    $.endDate          = document.getElementById('rp-end-date');
    $.btnGenerate      = document.getElementById('btn-generate-report');
    $.btnGenText       = document.getElementById('btn-gen-text');
    $.outputArea       = document.getElementById('rp-output-area');
    $.rpTitle          = document.getElementById('rp-title');
    $.rpDisplayRange   = document.getElementById('rp-display-range');
    $.rpCardBody       = document.getElementById('rp-card-body');
    $.btnDownload      = document.getElementById('btn-download-report');
    $.histList         = document.getElementById('rp-history-list');
    $.emptyHint        = document.getElementById('rp-empty-hint');
  }


  /* ==================== 初始化 & 绑定 ==================== */

  function init() {
    _cacheDom();
    if ($.btnGenerate) {
      _bindEvents();
      _setDateDefaults();
      _renderHistory();
    }
  }

  function refresh() {
    // 进入页面时刷新历史列表
    if ($.histList) _renderHistory();
  }

  function _bindEvents() {
    // 快捷日期按钮
    for (var i = 0; i < $.quickBtns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          _selectQuickBtn(this);
          _currentRange = this.getAttribute('data-range');
        });
      })($.quickBtns[i]);
    }

    // 自定义日期变化时切换到 custom
    $.startDate.addEventListener('change', function() {
      _switchToCustom();
    });
    $.endDate.addEventListener('change', function() {
      _switchToCustom();
    });

    // 生成按钮
    $.btnGenerate.addEventListener('click', _handleGenerate);

    // 下载按钮
    $.btnDownload.addEventListener('click', _downloadReport);
  }

  /* 设置默认日期（本周） */
  function _setDateDefaults() {
    var now = new Date();
    var day = now.getDay(); // 0=Sun
    var mondayOffset = day === 0 ? -6 : 1 - day; // 周一偏移
    var monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0,0,0,0);

    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    $.startDate.value = _formatDateForInput(monday);
    $.endDate.value   = _formatDateForInput(sunday);
  }

  function _formatDateForInput(d) {
    var m = String(d.getMonth() + 1).padStart(2,'0');
    var day = String(d.getDate()).padStart(2,'0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function _formatDisplayRange(startStr, endStr) {
    return startStr.replace(/-/g,'.') + ' ~ ' + endStr.replace(/-/g,'.');
  }


  /* ---- 快捷按钮切换 ---- */
  function _selectQuickBtn(target) {
    for (var i = 0; i < $.quickBtns.length; i++) {
      $.quickBtns[i].classList.remove('active');
    }
    target.classList.add('active');
  }

  function _switchToCustom() {
    _currentRange = 'custom';
    for (var i = 0; i < $.quickBtns.length; i++) {
      $.quickBtns[i].classList.remove('active');
    }
  }


  /* ════════════════════════════════════
     ① 生成报告（核心流程）
     ════════════════════════════════════ */

  function _handleGenerate() {
    if (_isGenerating) return;

    _isGenerating = true;
    $.btnGenerate.classList.add('loading');

    // 模拟 AI 生成延迟（1.2秒）
    setTimeout(function() {
      var reportData = _generateMockReportData();
      _renderReport(reportData);
      _saveToHistory(reportData);

      _isGenerating = false;
      $.btnGenerate.classList.remove('loading');
    }, 1200);
  }

  /* Mock 报告数据生成 */
  function _generateMockReportData() {
    var data = _mockData;
    var avgAccuracy = 0;
    for (var qi = 0; qi < data.quizzes.length; qi++) {
      avgAccuracy += data.quizzes[qi].accuracy;
    }
    avgAccuracy = Math.round(avgAccuracy / data.quizzes.length);

    // 薄弱点（score < 65）
    var weakKPs = data.knowledgePoints.filter(function(kp) { return kp.score < 65; });
    // 强项（score >= 80）
    var strongKPs = data.knowledgePoints.filter(function(kp) { return kp.score >= 80; });

    // 计算日期范围显示文本
    var rangeText = '';
    switch (_currentRange) {
      case 'week':  rangeText = '本周 (' + _formatDisplayRange($.startDate.value, $.endDate.value) + ')'; break;
      case 'month': rangeText = '本月'; break;
      case 'all':   rangeText = '全部时间'; break;
      default:      rangeText = '自定义 (' + _formatDisplayRange($.startDate.value, $.endDate.value) + ')';
    }

    return {
      id: 'rpt-' + Date.now(),
      title: '学习周报',
      range: rangeText,
      generatedAt: new Date().toLocaleString('zh-CN'),
      stats: {
        materials: data.materials.length,
        quizzes: data.quizzes.length,
        sessions: data.studySessions.length,
        avgAccuracy: avgAccuracy,
        totalMinutes: 190,
        strongKPs: strongKPs.length,
        weakKPs: weakKPs.length
      },
      content: {
        materials: data.materials,
        quizzes: data.quizzes,
        sessions: data.studySessions.slice().reverse(),
        strongKPs: strongKPs,
        weakKPs: weakKPs,
        allKPs: data.knowledgePoints.sort(function(a,b){return b.score-a.score})
      },
      recommendations: _generateRecommendations(weakKPs, strongKPs)
    };
  }

  function _generateRecommendations(weakKPs, strongKPs) {
    var recs = [];

    // 根据薄弱点动态生成建议
    if (weakKPs.length > 0) {
      recs.push({
        text: '重点复习「' + weakKPs[0].name + '」相关内容，当前掌握度仅 ' +
             weakKPs[0].score + '%，建议结合测评错题针对性练习。',
        priority: 'high'
      });
    }
    recs.push({
      text: '继续保持「' + (strongKPs[0] ? strongKPs[0].name : '词向量表示') + '」的学习势头，该维度已达到较高掌握水平，可尝试进阶题目巩固。',
      priority: 'normal'
    });
    recs.push({
      text: '建议每周至少完成 1-2 次完整测评，保持知识检测的连续性，及时发现遗忘的知识点。',
      priority: 'normal'
    });
    if (_mockData.materials.length > 1 && _mockData.materials[2] && _mockData.materials[2].mastery < 60) {
      recs.push({
        text: '「' + _mockData.materials[2].name + '」的掌握度较低（'+_mockData.materials[2].mastery+'%），建议优先安排复习时间。',
        priority: 'high'
      });
    } else {
      recs.push({
        text: '可适当增加新资料的学习广度，拓展知识面，避免长时间停留在同一资料上导致视野局限。',
        priority: 'low'
      });
    }

    return recs;
  }


  /* ════════════════════════════════════
     ② 渲染报告内容（排版核心）
     ════════════════════════════════════ */

  function _renderReport(report) {
    // 显示输出区
    $.outputArea.style.display = 'block';
    $.rpTitle.textContent = report.title;
    $.rpDisplayRange.textContent = report.range;

    var s = report.stats;
    var c = report.content;
    var r = report.recommendations;

    var html = '';

    // --- 数据摘要网格 ---
    html += '<div class="rp-summary-grid">';
    html += '<div class="rp-summary-item"><div class="rp-summary-val gold">' + s.materials + '</div><div class="rp-summary-lbl">学习资料</div></div>';
    html += '<div class="rp-summary-item"><div class="rp-summary-val gold">' + s.quizzes + '</div><div class="rp-summary-lbl">完成测评</div></div>';
    html += '<div class="rp-summary-item"><div class="rp-summary-val ' + (s.avgAccuracy >= 70 ? 'positive' : 'negative') + '">' + s.avgAccuracy + '%</div><div class="rp-summary-lbl">平均正确率</div></div>';
    html += '<div class="rp-summary-item"><div class="rp-summary-val gold">' + s.totalMinutes + 'min</div><div class="rp-summary-lbl">总学习时长</div></div>';
    html += '</div>';

    // --- 一、学习概览 ---
    html += '<div class="rp-section-block">';
    html += '<div class="rp-section-heading"><span class="heading-icon" style="background:rgba(59,130,246,0.12);color:#60a5fa;">📊</span> 学习概览</div>';
    html += '<p style="font-size:14px;margin-bottom:14px;">在本次统计周期内，你共学习了 <span class="rp-strong">' + s.materials + '</span> 份资料，完成了 <span class="rp-strong">' + s.quizzes + '</span> 次测评，累计学习 <span class="rp-strong">' + s.totalMinutes + '</span> 分钟。</p>';

    html += '<ul class="rp-content-list">';
    for (var mi = 0; mi < c.materials.length; mi++) {
      var m = c.materials[mi];
      var lv = m.mastery >= 75 ? '良好' : (m.mastery >= 60 ? '及格' : '需加强');
      var lvColor = m.mastery >= 75 ? '#4ade80' : (m.mastery >= 60 ? '#f59e0b' : '#f87171');
      html += '<li>学习了<span class="rp-strong">' + _escHtml(m.name) + '</span>（<span style="color:' + lvColor + ';font-weight:600">' + m.mastery + '%</span> / '+lv+'），共 <span class="rp-strong">' + m.pages + '</span> 页</li>';
    }
    html += '</ul>';

    // 学习会话时间线
    html += '<h4 style="font-size:13px;font-weight:600;color:var(--text-muted);margin:18px 0 10px;text-transform:uppercase;letter-spacing:0.03em;">学习时间线</h4>';
    html += '<ul class="rp-content-list">';
    for (var si = 0; si < c.sessions.length; si++) {
      var sess = c.sessions[si];
      html += '<li>' + _escHtml(sess.date) + ' · 学习了 <span class="rp-strong">' + _escHtml(sess.topic) + '</span> · 用时 ' + _escHtml(sess.duration) + '</li>';
    }
    html += '</ul>';
    html += '</div>'; // end section

    // --- 二、知识点分析 ---
    html += '<div class="rp-section-block">';
    html += '<div class="rp-section-heading"><span class="heading-icon" style="background:rgba(168,85,247,0.12);color:#c084fc;">🎯</span> 知识点分析</div>';

    // 强项
    if (c.strongKPs.length > 0) {
      html += '<p style="font-size:14px;margin-bottom:10px;"><span style="color:var(--success);font-weight:600">✓ 强项领域：</span></p>';
      html += '<ul class="rp-content-list">';
      for (var ski = 0; ski < c.strongKPs.length; ski++) {
        html += '<li><span class="rp-highlight">' + _escHtml(c.strongKPs[ski].name) + '</span> — 掌握度 <span class="rp-strong">' + c.strongKPs[ski].score + '%</span></li>';
      }
      html += '</ul>';
    }

    // 薄弱点
    if (c.weakKPs.length > 0) {
      html += '<div class="rp-analysis-box">';
      html += '<div class="rp-analysis-title">⚠ 需要关注的薄弱点（' + c.weakKPs.length + ' 个）</div>';
      html += '<ul class="rp-content-list">';
      for (var wki = 0; wki < c.weakKPs.length; wki++) {
        html += '<li><span class="rp-highlight" style="background:rgba(239,68,68,0.1);color:#f87171">' + _escHtml(c.weakKPs[wki].name) + '</span> — 掌握度仅 <span style="color:var(--error);font-weight:700">' + c.weakKPs[wki].score + '%</span>，低于及格线</li>';
      }
      html += '</ul></div>';
    }

    // 全部知识点排名表
    html += '<h4 style="font-size:13px;font-weight:600;color:var(--text-muted);margin:18px 0 10px;text-transform:uppercase;letter-spacing:0.03em;">知识点掌握排行</h4>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<tr style="background:var(--bg-base);"><th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border)">知识点</th><th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border)">分数</th><th style="width:100px;padding:8px 12px;border-bottom:1px solid var(--border)"></th></tr>';
    for (var ai = 0; ai < c.allKPs.length; ai++) {
      var kp = c.allKPs[ai];
      var barColor = kp.score >= 80 ? 'var(--success)' : (kp.score >= 65 ? 'var(--gold)' : 'var(--error)');
      var barW = kp.score + '%';
      html += '<tr>';
      html += '<td style="padding:9px 12px;color:var(--text-primary);font-weight:500">' + _escHtml(kp.name) + '</td>';
      html += '<td style="padding:9px 12px;text-align:right;font-weight:700;color:' + barColor + '">' + kp.score + '</td>';
      html += '<td style="padding:9px 6px"><div style="height:5px;background:var(--bg-base);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + barW + ';background:' + barColor + ';border-radius:3px"></div></div></td>';
      html += '</tr>';
    }
    html += '</table>';
    html += '</div>'; // end section

    // --- 三、下周建议 ---
    html += '<div class="rp-section-block">';
    html += '<div class="rp-section-heading"><span class="heading-icon" style="background:rgba(201,162,39,0.15);color:var(--gold);">💡</span> 下周学习建议</div>';
    html += '<ol class="rp-rec-list">';
    for (var ri = 0; ri < r.length; ri++) {
      html += '<li>' + r[ri].text + '</li>';
    }
    html += '</ol>';
    html += '</div>'; // end section

    // --- 结尾 ---
    html += '<div class="rp-footer-note">— 以上内容由 AI 基于你的学习数据自动生成 —</div>';

    // 写入 DOM
    $.rpCardBody.innerHTML = html;

    // 存当前报告到实例变量供下载使用
    _lastRenderedReport = report;
  }

  var _lastRenderedReport = null;


  /* ════════════════════════════════════
     ③ 下载功能
     ════════════════════════════════════ */

  function _downloadReport() {
    if (!_lastRenderedReport) return;

    var title = _lastRenderedReport.title || '学习报告';
    var range = _lastRenderedReport.range || '';

    // 构建完整的 HTML 文件
    var fullHtml = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n' +
      '<meta charset="UTF-8">\n' +
      '<title>' + title + ' - ' + range + '</title>\n' +
      '<style>\n' +
      '*{margin:0;padding:0;box-sizing:border-box}\n' +
      'body{font-family:-apple-system,"SF Pro Text","PingFang SC",sans-serif;' +
      'background:#0d1117;color:#c9d1d9;line-height:1.7;padding:48px;max-width:780px;margin:auto}' +
      'h1{font-size:26px;color:#e6edf3;margin-bottom:8px}' +
      '.meta{font-size:13px;color:#7d8590;margin-bottom:28px}' +
      '.section{margin:24px 0;padding:20px 24px;background:#161b22;border:1px solid #21262d;border-radius:8px}' +
      '.section h2{font-size:16px;color:#e6edf3;margin-bottom:14px;display:flex;align-items:center;gap:8px}' +
      '.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}' +
      '.grid-item{background:#21262d;border-radius:6px;padding:16px;text-align:center}' +
      '.grid-val{font-size:22px;font-weight:800;color:#C9A227}' +
      '.grid-label{font-size:11px;color:#7d8590;margin-top:4px;text-transform:uppercase}' +
      'ol{padding-left:24px} li{margin-bottom:10px} .dot-li{list-style:none;padding-left:20px;position:relative;margin-bottom:12px}' +
      '.dot-li::before{content:"";position:absolute;left:0;top:9px;width:8px;height:8px;border-radius:50%;background:#C9A227}' +
      '.strong{color:#e6edf3;font-weight:600}.hl{background:rgba(201,162,39,0.15);padding:1px 5px;border-radius:3px;color:#C9A227;font-weight:600}' +
      '.warn-box{background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:6px;padding:14px 18px;margin-top:12px}' +
      '.warn-title{font-size:13px;color:#f87171;font-weight:700;margin-bottom:8px}' +
      'table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}' +
      'th,td{padding:8px 12px;border-bottom:1px solid #21262d;text-align:left}' +
      'th{font-size:11px;color:#7d8590;text-transform:uppercase;background:#161b22}' +
      'td{text-align:right;font-weight:700}' +
      '.bar{height:5px;background:#21262d;border-radius:3px}' +
      '.bar-fill{height:100%;border-radius:3px}' +
      '.footer{margin-top:32px;padding-top:16px;border-top:1px dashed #21262d;text-align:center;font-size:12px;color:#7d8590;font-style:italic}' +
      '</style>\n</head>\n<body>\n';

    fullHtml += '<h1>' + title + '</h1>\n';
    fullHtml += '<p class="meta">' + range + ' · 生成于 ' + _lastRenderedReport.generatedAt + '</p>\n';

    // 复制报告正文内容（去掉动画类）
    fullHtml += $.rpCardBody.innerHTML.replace(/class="[^"]*"/g, '');

    fullHtml += '\n<div class="footer">— 由 AI 学习助手自动生成 —</div>\n';
    fullHtml += '\n</body>\n</html>';

    // 创建 Blob 并下载
    var blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = title.replace(/\s+/g, '_') + '_' + _dateStr() + '.html';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  function _dateStr() {
    var d = new Date();
    return d.getFullYear() + '' + String(d.getMonth()+1).padStart(2,'0') + '' + String(d.getDate()).padStart(2,'0');
  }


  /* ════════════════════════════════════
     ④ 历史报告管理
     ════════════════════════════════════ */

  function _saveToHistory(report) {
    // 防重复（简单判断）
    var exists = false;
    for (var i = 0; i < _historyReports.length; i++) {
      if (_historyReports[i].id === report.id) { exists = true; break; }
    }
    if (!exists) {
      _historyReports.unshift(report); // 最新的排前面
    }
    _renderHistory();
  }

  function _renderHistory() {
    if (!_historyReports || _historyReports.length === 0) {
      $.emptyHint.style.display = 'block';
      // 清除可能存在的旧卡片
      var cards = $.histList.querySelectorAll('.rp-hist-card');
      for (var ci = 0; ci < cards.length; ci++) {
        cards[ci].remove();
      }
      return;
    }

    $.emptyHint.style.display = 'none';

    // 清空旧卡片
    $.histList.innerHTML = '';

    for (var i = 0; i < _historyReports.length; i++) {
      var rpt = _historyReports[i];

      var card = document.createElement('div');
      card.className = 'rp-hist-card';
      card.id = 'hist-' + rpt.id;

      card.innerHTML =
        '<div class="rp-hist-header" onclick="Report.toggleHistCard(this)">' +
          '<div class="rp-hist-info">' +
            '<div class="rp-hist-icon">📋</div>' +
            '<div>' +
              '<div class="rp-hist-name">' + _escHtml(rpt.title) + ' - ' + _escHtml(rpt.range) + '</div>' +
              '<div class="rp-hist-date">生成于 ' + rpt.generatedAt + '</div>' +
            '</div>' +
          '</div>' +
          '<span class="rp-hist-arrow">▼</span>' +
        '</div>' +
        '<div class="rp-hist-body">' +
          '<div class="rp-summary-grid" style="grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">' +
            '<div class="rp-summary-item" style="padding:10px 8px"><div style="font-size:18px;font-weight:800;color:var(--gold)">' + rpt.stats.materials + '</div><div style="font-size:10px;color:var(--text-muted)">资料</div></div>' +
            '<div class="rp-summary-item" style="padding:10px 8px"><div style="font-size:18px;font-weight:800;color:var(--gold)">' + rpt.stats.quizzes + '</div><div style="font-size:10px;color:var(--text-muted)">测评</div></div>' +
            '<div class="rp-summary-item" style="padding:10px 8px"><div style="font-size:18px;font-weight:800;color:' + (rpt.stats.avgAccuracy>=70?'#4ade80':'#f87171') + '">' + rpt.stats.avgAccuracy + '%</div><div style="font-size:10px;color:var(--text-muted)">正确率</div></div>' +
            '<div class="rp-summary-item" style="padding:10px 8px"><div style="font-size:18px;font-weight:800;color:var(--gold)">' + rpt.stats.weakKPs + '</div><div style="font-size:10px;color:var(--text-muted)">薄弱</div></div>' +
          '</div>' +
          '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">' +
            '学习了 ' + rpt.stats.materials + ' 份资料，完成 ' + rpt.stats.quizzes + ' 次测评。' +
            (rpt.content.weakKPs.length > 0 ?
              '<br><span style="color:var(--error)">薄弱点：</span>' + rpt.content.weakKPs.map(function(w){return w.name}).join('、')
              : '各知识点掌握均衡') +
          '</div>' +
        '</div>';

      $.histList.appendChild(card);
    }
  }

  /** 展开/收起历史报告卡片（全局暴露供 onclick 内联调用） */
  function toggleHistCard(headerEl) {
    var card = headerEl.parentElement;
    var body = card.querySelector('.rp-hist-body');
    var isVisible = body.classList.contains('visible');

    if (isVisible) {
      body.classList.remove('visible');
      card.classList.remove('expanded');
    } else {
      body.classList.add('visible');
      card.classList.add('expanded');
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
    refresh: refresh,
    toggleHistCard: toggleHistCard
  };

})();
