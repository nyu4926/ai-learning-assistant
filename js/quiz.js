/* ============================================
   quiz.js — 测评模块（IIFE）
   三阶段：设置 → 答题 → 结果
   ============================================ */

const Quiz = (() => {
  'use strict';

  /* ==================== 状态 ==================== */
  let _phase = 'setup';          // setup | answering | result
  let _materials = [];           // 资料列表
  let _questions = [];           // 当前试卷题目数组
  let _answers = {};             // { qId: userAnswer }
  let _currentIndex = 0;         // 当前题号（0-based）
  let _totalCount = 10;          // 总题数（用户选择）
  let _selectedTypes = ['choice', 'judge'];
  let _selectedMaterialId = '';
  let _timerInterval = null;
  let _elapsedSeconds = 0;

  /* ==================== DOM 缓存 ==================== */
  let $ = {};

  function _cacheDom() {
    $.phaseSetup      = document.getElementById('quiz-phase-setup');
    $.phaseAnswering  = document.getElementById('quiz-phase-answering');
    $.phaseResult     = document.getElementById('quiz-phase-result');
    $.materialSelect   = document.getElementById('quiz-material-select');
    $.countBtns        = document.getElementById('quiz-count-btns');
    $.typeChecks       = document.getElementById('quiz-type-checks');
    $.btnStart         = document.getElementById('btn-start-quiz');
    $.qCurrent         = document.getElementById('q-current');
    $.qTotal           = document.getElementById('q-total');
    $.qProgressFill    = document.getElementById('q-progress-fill');
    $.qTimer           = document.getElementById('q-timer');
    $.questionCard     = document.getElementById('quiz-question-card');
    $.btnPrev          = document.getElementById('btn-q-prev');
    $.btnNext          = document.getElementById('btn-q-next');
    $.btnSubmit        = document.getElementById('btn-q-submit');
    $.btnAbandon       = document.getElementById('btn-quiz-abandon');
    $.ringFill         = document.getElementById('result-ring-fill');
    $.ringScoreNum     = document.getElementById('ring-score-num');
    $.rsCorrect        = document.getElementById('rs-correct');
    $.rsWrong          = document.getElementById('rs-wrong');
    $.rsTime           = document.getElementById('rs-time');
    $.rsRate           = document.getElementById('rs-rate');
    $.rdsList          = document.getElementById('rds-list');
    $.qhTbody          = document.getElementById('qh-tbody');
    $.qhEmpty          = document.getElementById('qh-empty');
    $.btnRetry         = document.getElementById('btn-retry-quiz');
  }

  /* ==================== 初始化 ==================== */

  function init() {
    _cacheDom();
    _bindEvents();
    _loadMaterials();
  }

  function _loadMaterials() {
    API.materials.list().then(data => {
      _materials = Array.isArray(data) ? data : (data.data || []);
      _populateMaterialSelect();
    }).catch(() => {
      _materials = [];
      _populateMaterialSelect();
    });
  }

  function _populateMaterialSelect() {
    const sel = $.materialSelect;
    sel.innerHTML = '';
    if (_materials.length === 0) {
      sel.innerHTML = '<option value="">请先上传资料</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    var optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = '全部资料';
    sel.appendChild(optAll);
    _materials.forEach(function(m) {
      if (m.status !== 'done' && m.status !== 'ready') return;
      var o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.title || m.name || m.filename || '未命名资料';
      sel.appendChild(o);
    });
    _updateStartBtnState();
  }

  function refresh() {
    _loadMaterials();
  }


  /* ==================== 事件绑定 ==================== */

  function _bindEvents() {
    $.countBtns.addEventListener('click', function(e) {
      var btn = e.target.closest('.count-btn');
      if (!btn) return;
      var allBtns = $.countBtns.querySelectorAll('.count-btn');
      for (var i = 0; i < allBtns.length; i++) allBtns[i].classList.remove('active');
      btn.classList.add('active');
      _totalCount = parseInt(btn.dataset.count, 10);
    });

    $.materialSelect.addEventListener('change', function() {
      _selectedMaterialId = $.materialSelect.value;
      _updateStartBtnState();
    });

    $.btnStart.addEventListener('click', function() { _startQuiz(); });
    $.btnPrev.addEventListener('click', function() { _goTo(_currentIndex - 1); });
    $.btnNext.addEventListener('click', function() { _goTo(_currentIndex + 1); });
    $.btnSubmit.addEventListener('click', function() { _submitQuiz(); });
    $.btnAbandon.addEventListener('click', function() { _abandonQuiz(); });
    $.btnRetry.addEventListener('click', function() { _resetToSetup(); });
  }

  function _getSelectedTypes() {
    var cbs = $.typeChecks.querySelectorAll('input[type="checkbox"]');
    var types = [];
    for (var i = 0; i < cbs.length; i++) {
      if (cbs[i].checked) types.push(cbs[i].value);
    }
    return types;
  }

  function _updateStartBtnState() {
    var hasMaterials = _materials.some(function(m) { return m.status === 'done' || m.status === 'ready'; });
    var hasTypes = _getSelectedTypes().length > 0;
    $.btnStart.disabled = !hasMaterials || !hasTypes;
  }

  /* ==================== 阶段切换 ==================== */
  function _switchPhase(phase) {
    _phase = phase;
    $.phaseSetup.style.display      = phase === 'setup'     ? '' : 'none';
    $.phaseAnswering.style.display  = phase === 'answering' ? '' : 'none';
    $.phaseResult.style.display     = phase === 'result'    ? '' : 'none';
  }


  /* ==================== 阶段1→2：开始答题 ==================== */

  function _startQuiz() {
    _selectedTypes = _getSelectedTypes();

    API.quiz.generate(
      _selectedMaterialId ? [_selectedMaterialId] : [],
      _selectedTypes,
      { choice: _selectedTypes.includes('choice') ? Math.ceil(_totalCount * 0.5) : 0,
        judge:  _selectedTypes.includes('judge')  ? Math.ceil(_totalCount * 0.35) : 0,
        essay:  _selectedTypes.includes('essay')  ? Math.floor(_totalCount * 0.15) : 0 }
    ).then(function(data) {
      var qs = data.questions || (data.data && data.data.questions) || [];
      if (qs.length > 0) { _questions = qs; _enterAnswering(); return; }
      throw new Error('no questions');
    }).catch(function() {
      _questions = _generateMockQuestions();
      _enterAnswering();
    });
  }

  function _enterAnswering() {
    _answers = {};
    _currentIndex = 0;
    _elapsedSeconds = 0;
    if (_questions.length === 0) _questions = _generateMockQuestions();
    $.qTotal.textContent = _questions.length;
    _switchPhase('answering');
    _startTimer();
    _renderCurrentQuestion();
  }

  /* 计时器 */
  function _startTimer() {
    _stopTimer();
    _elapsedSeconds = 0;
    _updateTimerDisplay();
    _timerInterval = setInterval(function() {
      _elapsedSeconds++;
      _updateTimerDisplay();
    }, 1000);
  }

  function _stopTimer() {
    if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  }

  function _updateTimerDisplay() {
    var m = String(Math.floor(_elapsedSeconds / 60)).padStart(2, '0');
    var s = String(_elapsedSeconds % 60).padStart(2, '0');
    $.qTimer.textContent = m + ':' + s;
  }

  function _formatTime(seconds) {
    var m = String(Math.floor(seconds / 60)).padStart(2, '0');
    var s = String(seconds % 60).padStart(2, '0');
    return m + ':' + s;
  }


  /* ==================== Mock 题目生成 ==================== */

  var _mockChoicePool = [
    { q: 'Transformer 模型中，自注意力机制的核心作用是什么？', opts: ['捕获序列中任意位置之间的依赖关系','降低模型参数量','加速训练收敛','减少过拟合风险'], ans: 'A', exp: '自注意力（Self-Attention）允许每个位置关注序列中的所有其他位置，从而有效捕获长距离依赖关系。这是 Transformer 相比 RNN/LSTM 的核心优势。' },
    { q: '以下关于 Batch Normalization 的描述，哪项是正确的？', opts: ['它只在推理时使用，训练时不需要','它可以加速训练并起到正则化作用','它只能用于全连接层，不能用于卷积层','它会增加模型的推断时间'], ans: 'B', exp: 'BatchNorm 通过标准化每层的输入分布来加速训练收敛，同时由于引入了 mini-batch 统计噪声，还起到了类似 Dropout 的正则化效果。' },
    { q: '在梯度下降优化中，学习率（Learning Rate）过大可能导致什么问题？', opts: ['模型欠拟合','梯度爆炸或无法收敛','训练速度过快导致内存溢出','权重更新过于保守'], ans: 'B', exp: '学习率过大会导致参数在最优解附近震荡甚至发散。过小则收敛极慢。实际中常用学习率衰减策略来平衡这个问题。' },
    { q: 'GPT 系列模型采用的是哪种注意力模式？', opts: ['双向编码器（Encoder-only）','编码器-解码器结构（Encoder-Decoder）','单向解码器（Decoder-only）','稀疏注意力机制'], ans: 'C', exp: 'GPT 采用 Decoder-only 架构，使用因果掩码（Causal Masking）确保每个位置只能看到之前的位置，适合自回归生成任务。' },
    { q: '词向量（Word Embedding）的主要目的是什么？', opts: ['减少词汇表的大小','将离散的词语映射为低维稠密向量表示','提高文本分类的准确率','实现多语言翻译'], ans: 'B', exp: '词向量通过将高维 one-hot 表示压缩到低维连续空间，使语义相近的词在向量空间中的距离也更近，为下游 NLP 任务提供更好的特征表示。' },
    { q: '以下哪个是预训练+微调（Pre-training + Fine-tuning）范式的典型代表？', opts: ['K-Means 聚类算法','BERT / GPT 系列大语言模型','支持向量机（SVM）','随机森林'], ans: 'B', exp: 'BERT 和 GPT 都遵循「在大规模语料上预训练 → 在具体任务上微调」的范式。预训练阶段学习通用语言知识，微调阶段适配特定任务。' },
    { q: 'Dropout 在神经网络训练中的作用是什么？', opts: ['加快前向传播速度','防止过拟合的正则化手段','增加模型的参数量','提升模型在测试集上的容量'], ans: 'B', exp: 'Dropout 在训练时随机"丢弃"一部分神经元，迫使网络学习更鲁棒的特征，防止对特定神经元的过度依赖，是一种有效的正则化技术。' },
    { q: 'RNN（循环神经网络）相比 Transformer 的主要劣势是什么？', opts: ['参数量更大','难以并行化且存在长距离依赖问题','只能处理固定长度序列','不支持变长输入'], ans: 'B', exp: 'RNN 的顺序计算特性导致难以 GPU 并行化，且梯度消失/膨胀问题使得捕获长距离依赖困难。Transformer 用自注意力彻底解决了这两个瓶颈。' }
  ];

  var _mockJudgePool = [
    { q: 'Attention 机制只用于 Transformer 的 Encoder 部分，Decoder 不使用 Attention。', ans: false, exp: '错误。Decoder 中同样大量使用 Attention：交叉注意力（Cross-Attention）让 Decoder 关注 Encoder 的输出；自注意力（Masked Self-Attention）则用于生成时的上下文建模。' },
    { q: 'BERT 模型是基于 Transformer 的 Encoder-only 架构。', ans: true, exp: '正确。BERT 使用完整的双向 Transformer 编码器堆叠而成，通过掩码语言模型（MLM）和下一句预测（NSP）进行预训练。' },
    { q: '学习率 Warmup 是指训练开始时先使用很大的学习率再逐渐减小。', ans: false, exp: '错误。Warmup 正好相反——训练初期使用很小的学习率，逐步增大到目标值，目的是避免训练早期因参数随机初始化导致的梯度不稳定。' },
    { q: 'Softmax 函数的输出值之和恒等于 1。', ans: true, exp: '正确。Softmax 将任意实数向量归一化为概率分布，所有输出值的和严格等于 1，因此广泛用于多分类任务的输出层。' },
    { q: 'CNN（卷积神经网络）只能处理图像数据，不能用于自然语言处理。', ans: false, exp: '错误。CNN 同样可以用于 NLP 任务，例如 TextCNN 用于文本分类、1D 卷积提取 n-gram 特征等。虽然 Transformer 已成为主流，但 CNN 在某些轻量级场景仍有应用价值。' },
    { q: '梯度消失问题在深层网络中更容易出现。', ans: true, exp: '正确。链式法则下，梯度需要逐层相乘。如果每层梯度小于1，层数越深乘积就越趋近于0。ReLU、残差连接等技术都是为缓解此问题而设计的。' }
  ];

  var _mockEssayPool = [
    { q: '请简述 Transformer 模型相对于 RNN 的核心优势和原理。', ans: '核心优势：(1) 并行计算能力强——自注意力可同时处理所有位置；(2) 长距离依赖捕获能力优——任意两位置直接交互；(3) 训练效率高——无序列依赖。核心原理是自注意力机制通过 Q/K/V 矩阵运算计算位置间的相关性权重。', exp: '回答应包含：并行性、长距离依赖、自注意力机制三个关键点。' },
    { q: '请解释什么是"预训练语言模型"，以及它为什么能提升下游任务性能？', ans: '预训练语言模型是在大规模无标注文本上训练得到的通用语言表示模型。它能提升下游任务的原因：(1) 学习到了丰富的语言学知识和世界知识；(2) 提供了高质量的初始化参数；(3) 微调时只需要少量标注数据即可达到好的效果。', exp: '应提到大规模预训练、通用知识迁移、数据效率三个方面。' },
    { q: '请简要对比 BERT 和 GPT 在架构和使用方式上的主要区别。', ans: '(1) 架构：BERT 是 Encoder-only（双向），GPT 是 Decoder-only（单向）；(2) 注意力：BERT 双向可见，GPT 只看上文；(3) 适用场景：BERT 更适合理解类任务（NLU），GPT 更适合生成类任务（NLG）。', exp: '需涵盖架构差异、注意力方向差异、适用场景差异三点。' }
  ];

  var _mockIdx = 0;

  /** 根据用户选择的题型和数量生成 Mock 题目 */
  function _generateMockQuestions() {
    var types = _selectedTypes;
    var total = _totalCount;
    var questions = [];
    var ci = _mockIdx % _mockChoicePool.length;
    var ji = _mockIdx % _mockJudgePool.length;
    var ei = _mockIdx % _mockEssayPool.length;

    // 分配各题型数量
    var counts = { choice: 0, judge: 0, essay: 0 };
    if (types.length === 1) {
      counts[types[0]] = total;
    } else if (types.length === 2) {
      if (types.includes('choice') && types.includes('judge')) {
        counts.choice = Math.ceil(total * 0.55);
        counts.judge = total - counts.choice;
      } else if (types.includes('choice') && types.includes('essay')) {
        counts.choice = Math.ceil(total * 0.6);
        counts.essay = total - counts.choice;
      } else {
        counts.judge = Math.ceil(total * 0.6);
        counts.essay = total - counts.judge;
      }
    } else {
      counts.choice = Math.ceil(total * 0.5);
      counts.judge = Math.ceil(total * 0.3);
      counts.essay = total - counts.choice - counts.judge;
    }

    // 选择题
    for (var i = 0; i < counts.choice; i++) {
      var mc = _mockChoicePool[(ci + i) % _mockChoicePool.length];
      questions.push({
        id: 'Q' + (questions.length + 1),
        type: 'choice',
        question: mc.q,
        options: mc.opts,
        answer: mc.ans,
        explanation: mc.exp,
        difficulty: i % 3 === 0 ? '简单' : (i % 3 === 1 ? '中等' : '较难')
      });
    }

    // 判断题
    for (var j = 0; j < counts.judge; j++) {
      var mj = _mockJudgePool[(ji + j) % _mockJudgePool.length];
      questions.push({
        id: 'Q' + (questions.length + 1),
        type: 'judge',
        question: mj.q,
        answer: mj.ans ? 'true' : 'false',
        explanation: mj.exp,
        difficulty: j % 2 === 0 ? '中等' : '简单'
      });
    }

    // 简答题
    for (var k = 0; k < counts.essay; k++) {
      var me = _mockEssayPool[(ei + k) % _mockEssayPool.length];
      questions.push({
        id: 'Q' + (questions.length + 1),
        type: 'essay',
        question: me.q,
        answer: me.ans,
        explanation: me.exp,
        difficulty: '较难'
      });
    }

    _mockIdx++;
    return questions;
  }


  /* ==================== 渲染当前题目 ==================== */

  function _renderCurrentQuestion() {
    var q = _questions[_currentIndex];
    if (!q) return;

    $.qCurrent.textContent = _currentIndex + 1;

    // 进度条
    var pct = ((_currentIndex + 1) / _questions.length) * 100;
    $.qProgressFill.style.width = pct + '%';

    // 导航按钮状态
    $.btnPrev.disabled = _currentIndex === 0;
    var isLast = _currentIndex === _questions.length - 1;
    $.btnNext.style.display = isLast ? 'none' : '';
    $.btnSubmit.style.display = isLast ? '' : 'none';

    // 构建 HTML
    var html = '';

    // 题头：类型标签 + 难度标签
    html += '<div class="qq-header">';
    html += '<span class="qq-badge ' + q.type + '">' + _getTypeLabel(q.type) + '</span>';
    if (q.difficulty) {
      html += '<span class="qq-difficulty">' + _escHtml(q.difficulty) + '</span>';
    }
    html += '</div>';

    // 题目内容
    html += '<div class="qq-text">' + _escHtml(q.question) + '</div>';

    // 根据题型渲染不同选项区域
    if (q.type === 'choice') {
      html += _renderChoiceOptions(q);
    } else if (q.type === 'judge') {
      html += _renderJudgeOptions(q);
    } else if (q.type === 'essay') {
      html += _renderEssayInput(q);
    }

    $.questionCard.innerHTML = html;

    // 触发卡片动画（重新触发）
    $.questionCard.style.animation = 'none';
    $.questionCard.offsetHeight; // 强制 reflow
    $.questionCard.style.animation = '';

    // 绑定答题事件
    _bindQuestionEvents(q);
  }

  function _getTypeLabel(type) {
    return { choice: '选择题', judge: '判断题', essay: '简答题' }[type] || type;
  }

  /* ---- 选择题选项渲染 ---- */
  function _renderChoiceOptions(q) {
    var labels = ['A', 'B', 'C', 'D'];
    var html = '<div class="qq-options">';
    for (var i = 0; i < q.options.length; i++) {
      var selected = (_answers[q.id] === labels[i]) ? ' selected' : '';
      html += '<div class="qq-option' + selected + '" data-value="' + labels[i] + '">';
      html += '<span class="qq-option-marker">' + labels[i] + '</span>';
      html += '<span>' + _escHtml(q.options[i]) + '</span>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  /* ---- 判断题选项渲染 ---- */
  function _renderJudgeOptions(q) {
    var val = _answers[q.id] || '';
    var tClass = val === 'true' ? ' active-true' : '';
    var fClass = val === 'false' ? ' active-false' : '';
    return '<div class="qq-judge-options">'
      + '<div class="qq-judge-btn' + tClass + '" data-value="true">✓ 正确</div>'
      + '<div class="qq-judge-btn' + fClass + '" data-value="false">✗ 错误</div>'
      + '</div>';
  }

  /* ---- 简答题输入框渲染 ---- */
  function _renderEssayInput(q) {
    var val = _answers[q.id] || '';
    return '<div class="qq-essay-area">'
      + '<textarea placeholder="请输入你的回答..."' + ' data-qid="' + q.id + '">' + _escHtml(val) + '</textarea>'
      + '<div class="essay-hint">简要作答即可，列出关键要点</div>'
      + '</div>';
  }


  /* ==================== 答题事件绑定 ==================== */

  function _bindQuestionEvents(q) {
    if (q.type === 'choice') {
      var opts = $.questionCard.querySelectorAll('.qq-option');
      for (var i = 0; i < opts.length; i++) {
        (function(opt) {
          opt.addEventListener('click', function() {
            // 取消其他选中
            var all = $.questionCard.querySelectorAll('.qq-option');
            for (var a = 0; a < all.length; a++) all[a].classList.remove('selected');
            // 选中当前
            opt.classList.add('selected');
            _answers[q.id] = opt.dataset.value;
          });
        })(opts[i]);
      }
    } else if (q.type === 'judge') {
      var btns = $.questionCard.querySelectorAll('.qq-judge-btn');
      for (var j = 0; j < btns.length; j++) {
        (function(btn) {
          btn.addEventListener('click', function() {
            // 取消两个按钮的 active 态
            var allBtns = $.questionCard.querySelectorAll('.qq-judge-btn');
            for (var b = 0; b < allBtns.length; b++) {
              allBtns[b].classList.remove('active-true', 'active-false');
            }
            // 设当前选中态
            if (btn.dataset.value === 'true') {
              btn.classList.add('active-true');
            } else {
              btn.classList.add('active-false');
            }
            _answers[q.id] = btn.dataset.value;
          });
        })(btns[j]);
      }
    } else if (q.type === 'essay') {
      var ta = $.questionCard.querySelector('textarea');
      if (ta) {
        ta.addEventListener('input', function() {
          _answers[q.id] = ta.value.trim();
        });
      }
    }
  }


  /* ==================== 导航控制 ==================== */

  function _goTo(index) {
    if (index < 0 || index >= _questions.length) return;
    _currentIndex = index;
    _renderCurrentQuestion();
  }

  function _abandonQuiz() {
    _stopTimer();
    // 弹确认后回到设置页
    if (confirm('确定要放弃本次测试吗？已答进度将不会保存。')) {
      _resetToSetup();
    } else {
      // 用户取消放弃，恢复计时
      _timerInterval = setInterval(function() {
        _elapsedSeconds++;
        _updateTimerDisplay();
      }, 1000);
    }
  }

  function _resetToSetup() {
    _stopTimer();
    _questions = [];
    _answers = {};
    _currentIndex = 0;
    _switchPhase('setup');
  }


  /* ==================== 阶段2→3：提交批改 & 结果展示 ==================== */

  function _submitQuiz() {
    _stopTimer();

    // 先尝试调 API 提交
    var answersArray = [];
    _questions.forEach(function(q) {
      answersArray.push({ question_id: q.id, user_answer: _answers[q.id] || '' });
    });

    API.quiz.submit('quiz-mock-' + Date.now(), answersArray)
      .then(function(data) {
        var result = data.data || data;
        if (result && typeof result.score !== 'undefined') {
          _showResult(result);
          return;
        }
        throw new Error('no result');
      })
      .catch(function() {
        // Mock 批改
        var mockResult = _mockGrade(answersArray);
        _showResult(mockResult);
      });
  }

  /** 本地 Mock 批改 */
  function _mockGrade(userAnswers) {
    var correctCount = 0;
    var wrongCount = 0;
    var details = [];

    _questions.forEach(function(q, idx) {
      var ua = userAnswers[idx] ? userAnswers[idx].user_answer : '';
      var correctAnswer = String(q.answer);
      var isCorrect = false;
      var score = 0;
      var comment = '';

      if (q.type === 'choice') {
        isCorrect = (ua.toUpperCase() === correctAnswer.toUpperCase());
        score = isCorrect ? 1 : 0;
        comment = isCorrect ? '✅ 回答正确！' : '❌ 回答错误。正确答案是 ' + correctAnswer + '。';
      } else if (q.type === 'judge') {
        isCorrect = (ua.toLowerCase() === correctAnswer.toLowerCase());
        score = isCorrect ? 1 : 0;
        comment = isCorrect ? '✅ 判断正确！' : '❌ 判断错误。正确答案是 ' + (correctAnswer === 'true' ? '正确' : '错误') + '。';
      } else if (q.type === 'essay') {
        // 简答题模拟评分：根据长度和关键词粗略判断
        if (ua && ua.length > 10) {
          score = 1; isCorrect = true; comment = '✅ 要点基本完整，表述清晰。';
        } else if (ua && ua.length > 3) {
          score = 0.5; isCorrect = false; comment = '📝 回答了一部分，但遗漏了一些关键要点。';
        } else {
          score = 0; isCorrect = false; comment = '❌ 未作答或答案过于简略。';
        }
      }

      if (isCorrect || score >= 1) correctCount++;
      else wrongCount++;

      details.push({
        qId: q.id,
        type: q.type,
        question: q.question,
        userAnswer: ua,
        correctAnswer: q.answer,
        isCorrect: isCorrect,
        score: score,
        comment: comment,
        explanation: q.explanation
      });
    });

    var totalScore = details.reduce(function(s, d) { return s + d.score; }, 0);
    var maxScore = _questions.length;

    return {
      score: totalScore,
      total: maxScore,
      correct: correctCount,
      wrong: wrongCount,
      timeSeconds: _elapsedSeconds,
      accuracy: maxScore > 0 ? Math.round((correctCount / maxScore) * 100) : 0,
      details: details
    };
  }

  /* ==================== 结果展示 ==================== */

  function _showResult(result) {
    _switchPhase('result');

    var score = Math.round(result.score);
    var total = result.total;
    var pct = total > 0 ? (score / total) : 0;

    // 1. 圆环图动画
    _animateRing(pct);

    // 2. 统计数字
    _animateNumber($.rsCorrect, result.correct);
    _animateNumber($.rsWrong, result.wrong);
    $.rsTime.textContent = _formatTime(result.timeSeconds);
    setTimeout(function() {
      $.rsRate.textContent = result.accuracy + '%';
    }, 400);

    // 3. 题目展开详情
    _renderResultDetails(result.details);

    // 4. 历史记录
    _renderHistory(score, total, result.timeSeconds, result.accuracy);
  }

  /** 圆环 SVG 动画：从 0% 画到目标百分比 */
  function _animateRing(percent) {
    // 圆周长 C = 2πr = 2 × 3.14159 × 52 ≈ 326.73
    var circumference = 2 * Math.PI * 52;
    var offset = circumference * (1 - percent);

    // 先重置
    $.ringFill.style.strokeDashoffset = String(circumference);

    // 强制重绘后启动动画
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        $.ringFill.style.strokeDashoffset = String(offset);
      });
    });

    // 数字动画
    _animateNumber($.ringScoreNum, percent * 100, true);
  }

  /** 数字递增动画 */
  function _animateNumber(el, target, isFloat) {
    if (!el) return;
    var duration = 1200;
    var start = 0;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      // easeOutExpo
      var eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      var current = start + (target - start) * eased;
      el.textContent = isFloat ? current.toFixed(0) : Math.round(current);
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  /** 渲染每道题的展开详情 */
  function _renderResultDetails(details) {
    var html = '';
    for (var i = 0; i < details.length; i++) {
      var d = details[i];
      var ok = d.isCorrect;
      var cls = ok ? 'correct' : 'wrong';
      var statusText = ok ? '正确' : '错误';
      var statusTagCls = ok ? 'correct' : 'wrong';

      html += '<div class="rds-item">';
      html += '<div class="rds-header" onclick="Quiz.toggleRdsItem(this)">';
      html += '<div class="rds-h-left">';
      html += '<span class="rds-qnum ' + cls + '">' + (i + 1) + '</span>';
      html += '<span class="rds-qtext">' + _escHtml(d.question.substring(0, 50)) + (d.question.length > 50 ? '...' : '') + '</span>';
      html += '</div>';
      html += '<div class="rds-h-right">';
      html += '<span class="rds-status-tag ' + statusTagCls + '">' + statusText + '</span>';
      html += '<span class="rds-arrow">▼</span>';
      html += '</div>';
      html += '</div>';

      // 展开内容
      html += '<div class="rds-body">';
      html += '<div class="rds-row"><span class="rds-rlabel">正确答案</span><span class="rds-rvalue answer-correct">' + _escHtml(String(d.correctAnswer)) + '</span></div>';
      html += '<div class="rds-row"><span class="rds-rlabel">我的答案</span><span class="rds-rvalue ' + (ok ? 'answer-correct' : 'answer-wrong') + '">' + (d.userAnswer ? _escHtml(d.userAnswer) : '<em style="color:var(--text-muted)">未作答</em>') + '</span></div>';
      if (d.comment) {
        html += '<div class="rds-comment">' + _escHtml(d.comment) + '</div>';
      }
      if (d.explanation) {
        html += '<div class="rds-row" style="margin-top:8px;margin-bottom:0;"><span class="rds-rlabel">解析</span><span class="rds-rvalue">' + _escHtml(d.explanation) + '</span></div>';
      }
      html += '</div>'; // .rds-body
      html += '</div>'; // .rds-item
    }

    $.rdsList.innerHTML = html;
  }

  /** 展开/收起详情项（全局 onclick 调用） */
  function toggleRdsItem(headerEl) {
    var item = headerEl.parentElement;
    var body = item.querySelector('.rds-body');
    var isVisible = body.classList.contains('visible');

    item.classList.toggle('expanded', !isVisible);
    body.classList.toggle('visible', !isVisible);
  }

  /** 渲染历史记录表格 */
  function _renderHistory(score, total, timeSecs, accuracy) {
    // 生成 Mock 历史
    var histories = _getMockHistories(score, total, timeSecs, accuracy);

    if (histories.length === 0) {
      $.qhTbody.innerHTML = '';
      $.qhEmpty.style.display = '';
      return;
    }

    $.qhEmpty.style.display = 'none';
    var html = '';
    for (var i = 0; i < histories.length; i++) {
      var h = histories[i];
      html += '<tr>';
      html += '<td>' + _escHtml(h.date) + '</td>';
      html += '<td>' + _escHtml(h.material) + '</td>';
      html += '<td>' + h.count + ' 道</td>';
      html += '<td style="font-weight:600;color:' + (h.rate >= 80 ? 'var(--success)' : (h.rate >= 60 ? 'var(--warning)' : 'var(--error)')) + '">' + h.score + '/' + h.total + '</td>';
      html += '<td>' + h.rate + '%</td>';
      html += '<td>' + _formatTime(h.timeSecs) + '</td>';
      html += '</tr>';
    }
    $.qhTbody.innerHTML = html;
  }

  function _getMockHistories(currScore, currTotal, currTimeSecs, currAccuracy) {
    var now = new Date();
    var records = [];

    // 本次记录排第一
    records.push({
      date: _fmtDate(now),
      material: _selectedMaterialId ? (_materials.find(function(m){return m.id === _selectedMaterialId})?.title || '指定资料') : '全部资料',
      count: _questions.length,
      score: Math.round(currScore),
      total: currTotal,
      rate: currAccuracy,
      timeSecs: currTimeSecs
    });

    // 之前的 Mock 记录
    var pastScores = [7, 8, 5]; // 循环
    var pastAccs = [70, 80, 50];
    var materials = ['Transformer 入门指南', '深度学习基础', 'NLP 实战手册'];
    for (var i = 0; i < 3; i++) {
      var d = new Date(now);
      d.setDate(d.getDate() - (i + 1) * 2);
      records.push({
        date: _fmtDate(d),
        material: materials[i],
        count: 10,
        score: pastScores[i],
        total: 10,
        rate: pastAccs[i],
        timeSecs: 300 + i * 120
      });
    }

    return records;
  }

  function _fmtDate(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return m + '-' + day;
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
    toggleRdsItem: toggleRdsItem
  };

})();