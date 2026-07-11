const TIME_ZONE = 'Asia/Shanghai';
const STORAGE_KEY = 'schulte-daily-v1';
const INFINITE_MODES = {
  easy: { label: '简单模式' },
  classic: { label: '经典模式' },
  fifty: { label: '1-50 模式' }
};
const GRID_THEMES = ['海洋蓝', '薄荷青', '森林绿', '暖阳橙', '葡萄紫', '莓果红'];
const DEFAULT_SETTINGS = {
  dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  contrast: false,
  reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  sound: true,
  vibration: true,
  gridTheme: 0
};

const app = {
  levels: null,
  level: null,
  date: dateInTimeZone(),
  data: loadData(),
  active: null,
  selectedMode: 'easy',
  selectedSize: 3,
  activeMode: 'daily',
  timerFrame: null,
  lastTimerPaint: 0,
  stageAdvanceTimer: null,
  audio: null,
  storageAvailable: true,
  confirmAction: null,
  guideStartsGame: false
};

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  bindEvents();
  applySettings();
  detectStorageAvailability();
  await loadLevels();
  renderHome();
  checkDateChange();
  window.setInterval(checkDateChange, 30000);
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((registration) => registration.update()).catch((error) => {
    console.warn('Service Worker 注册失败，页面将继续使用网络资源。', error);
  });
}

function bindEvents() {
  $('startBtn').addEventListener('click', requestDailyStart);
  $('infiniteBtn').addEventListener('click', requestInfiniteStart);
  $('modeButtons').addEventListener('click', (event) => {
    const mode = event.target.closest('[data-mode]')?.dataset.mode;
    if (mode) selectMode(mode);
  });
  $('sizePicker').addEventListener('click', (event) => {
    const size = Number(event.target.closest('[data-size]')?.dataset.size);
    if (size) selectSize(size);
  });
  $('dailyResumeBtn').addEventListener('click', resumeChallenge);
  $('infiniteResumeBtn').addEventListener('click', resumeChallenge);
  $('dailyShareBtn').addEventListener('click', () => shareResult(app.data.records[app.date]));
  $('guideStartBtn').addEventListener('click', () => {
    app.data.seenGuide = true;
    saveData();
    closeModal('guideModal');
    if (app.guideStartsGame) beginCountdown();
    app.guideStartsGame = false;
  });
  $('continueBtn').addEventListener('click', advanceStage);
  $('abandonBtn').addEventListener('click', confirmAbandon);
  $('shareBtn').addEventListener('click', () => shareResult());
  $('replayBtn').addEventListener('click', showHome);
  $('reloadBtn').addEventListener('click', () => window.location.reload());
  $('showGuideBtn').addEventListener('click', () => {
    app.guideStartsGame = false;
    $('guideStartBtn').textContent = '我知道了';
    closeModal('settingsModal');
    openModal('guideModal');
  });
  $('exportBtn').addEventListener('click', exportHistory);
  $('clearBtn').addEventListener('click', confirmClearData);
  $('confirmCancel').addEventListener('click', () => closeModal('confirmModal'));
  $('confirmAccept').addEventListener('click', () => {
    const action = app.confirmAction;
    closeModal('confirmModal');
    app.confirmAction = null;
    if (action) action();
  });

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'home') showHome();
    if (action === 'history') showHistory();
    if (action === 'settings') showSettings();
    if (action === 'guide') showGuide();
    const closeTarget = event.target.closest('[data-close]')?.dataset.close;
    if (closeTarget) closeModal(closeTarget);
  });

  for (const [id, key] of [
    ['darkSetting', 'dark'],
    ['contrastSetting', 'contrast'],
    ['motionSetting', 'reduceMotion'],
    ['soundSetting', 'sound'],
    ['vibrationSetting', 'vibration']
  ]) {
    $(id).addEventListener('change', (event) => {
      app.data.settings[key] = event.target.checked;
      saveData();
      applySettings();
    });
  }

  for (const id of ['gridThemeSetting', 'guideGridTheme']) {
    $(id).addEventListener('input', (event) => setGridTheme(Number(event.target.value)));
  }

  window.addEventListener('pagehide', persistActive);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persistActive();
  });
}

async function loadLevels() {
  try {
    const response = await fetch('data/daily-levels.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    app.levels = await response.json();
    app.level = app.levels.levels?.[app.date] || null;
    if (!app.level) {
      $('loadMessage').textContent = '今日静态关卡尚未发布，请稍后刷新。';
      $('startBtn').disabled = true;
      return;
    }
    const saved = app.data.active;
    const savedMode = saved?.mode || 'daily';
    const savedLevel = savedMode === 'daily' ? app.level : saved?.level;
    if (
      saved &&
      savedLevel &&
      saved.date === app.date &&
      saved.levelId === savedLevel.id &&
      saved.rulesVersion === savedLevel.rulesVersion &&
      saved.stageIndex < savedLevel.stages.length &&
      !saved.finished
    ) {
      app.active = saved;
      if (savedMode === 'daily') claimDailyAttempt(saved.createdAt);
    } else if (saved) {
      app.data.active = null;
      saveData();
    }
  } catch (error) {
    $('loadMessage').textContent = `关卡数据加载失败：${error.message}`;
    $('startBtn').disabled = true;
  }
}

function requestDailyStart() {
  if (!app.level) return;
  if (isDailyActive()) {
    resumeChallenge();
    return;
  }
  if (hasUsedDailyAttempt()) {
    toast('今日挑战机会已使用，请明天再来');
    renderHome();
    return;
  }
  requestStart('daily');
}

function requestInfiniteStart() {
  requestStart(app.selectedMode);
}

function requestStart(mode) {
  if (!app.level) return;
  if (app.active && !app.active.finished) {
    if (app.active.mode === mode) {
      resumeChallenge();
      return;
    }
    const dailyWarning = app.active.mode === 'daily' ? '放弃后，今天不能再次开始每日挑战。' : '当前无限模式进度将被清空。';
    showConfirm('切换到其他模式？', dailyWarning, '确认切换', () => {
      app.active = null;
      app.data.active = null;
      saveData();
      requestStart(mode);
    });
    return;
  }
  app.activeMode = mode;
  if (!app.data.seenGuide) {
    app.guideStartsGame = true;
    $('guideStartBtn').textContent = '开始挑战';
    openModal('guideModal');
    return;
  }
  beginCountdown();
}

function beginCountdown() {
  if (app.activeMode === 'daily') {
    if (hasUsedDailyAttempt()) {
      toast('今日挑战机会已使用，请明天再来');
      showHome();
      return;
    }
    claimDailyAttempt();
  }
  app.active = createActiveChallenge();
  app.data.active = app.active;
  saveData();
  showView('gameView');
  renderGame();
  const overlay = $('countdown');
  overlay.classList.remove('hidden');
  const sequence = ['3', '2', '1', '开始'];
  let index = 0;
  const tick = () => {
    overlay.innerHTML = `<strong>${sequence[index]}</strong>`;
    index += 1;
    if (index < sequence.length) {
      window.setTimeout(tick, app.data.settings.reduceMotion ? 180 : 700);
    } else {
      window.setTimeout(() => {
        overlay.classList.add('hidden');
        startStageClock();
      }, app.data.settings.reduceMotion ? 100 : 520);
    }
  };
  tick();
}

function createActiveChallenge() {
  const mode = app.activeMode || 'daily';
  const level = levelForMode(mode);
  return {
    date: app.date,
    levelId: level.id,
    rulesVersion: level.rulesVersion,
    mode,
    level: mode === 'daily' ? null : level,
    stageIndex: 0,
    target: stageStartValue(level.stages[0]),
    stageStartedAt: null,
    stageResults: [],
    currentErrors: 0,
    finished: false,
    createdAt: new Date().toISOString()
  };
}

function resumeChallenge() {
  if (!app.active || !app.level) return;
  app.activeMode = app.active.mode || 'daily';
  if (app.active.mode && app.active.mode !== 'daily') {
    app.selectedMode = app.active.mode;
    if (app.active.mode !== 'fifty') app.selectedSize = activeLevel().stages[0].size;
  }
  if (!app.active.stageStartedAt && app.active.stageResults.length > app.active.stageIndex) {
    app.active.stageIndex += 1;
    app.active.target = stageStartValue(currentStage());
    app.active.currentErrors = 0;
  }
  if (!app.active.stageStartedAt) app.active.stageStartedAt = Date.now();
  showView('gameView');
  renderGame();
  startTimer();
}

function startStageClock() {
  if (!app.active) return;
  app.active.stageStartedAt = Date.now();
  persistActive();
  renderGame();
  startTimer();
}

function renderGame() {
  if (!app.active || !app.level) return;
  const stage = currentStage();
  const start = stageStartValue(stage);
  const end = stageEndValue(stage);
  const level = activeLevel();
  $('stageLabel').textContent = `第 ${app.active.stageIndex + 1} / ${level.stages.length} 阶段`;
  $('gridSizeLabel').textContent = stage.type === 'fifty' ? '5×5 · 1-50' : `${stage.size}×${stage.size}`;
  $('targetLabel').textContent = Math.min(app.active.target, end);
  $('maxLabel').textContent = end;
  $('errorLabel').textContent = `错误 ${totalErrors()}`;
  $('gameModeBadge').textContent = modeLabel(app.active.mode);
  $('abandonBtn').textContent = app.active.mode === 'daily' ? '放弃今日挑战' : '退出无限模式';
  $('progressBar').style.width = `${((app.active.target - start) / (end - start + 1)) * 100}%`;
  $('stageDots').innerHTML = level.stages.map((_, index) => `<i class="${index < app.active.stageIndex ? 'done' : index === app.active.stageIndex ? 'active' : ''}"></i>`).join('');
  updateHudStars(app.active.stageIndex, level.stages.length);

  const grid = $('grid');
  grid.style.gridTemplateColumns = `repeat(${stage.size}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${stage.size}, minmax(0, 1fr))`;
  grid.style.setProperty('--size', stage.size);
  grid.innerHTML = '';
  for (const cell of visibleStageCells(stage, app.active.target)) {
    const button = document.createElement('button');
    button.className = `grid-cell${cell.highlighted ? ' done' : ''}${cell.revealed ? ' revealed' : ''}${cell.empty ? ' empty' : ''}`;
    button.textContent = cell.value ?? '';
    if (cell.value != null) button.dataset.value = cell.value;
    button.setAttribute('aria-label', cell.empty ? '已完成' : `数字 ${cell.value}${cell.highlighted ? '，已完成' : ''}`);
    button.disabled = cell.empty || cell.highlighted || !app.active.stageStartedAt;
    if (cell.value != null) button.addEventListener('click', () => handleCell(button, cell.value));
    grid.appendChild(button);
  }
  paintTimer(true);
}

function handleCell(button, value) {
  if (!app.active?.stageStartedAt) return;
  if (value !== app.active.target) {
    app.active.currentErrors += 1;
    button.classList.remove('wrong');
    void button.offsetWidth;
    button.classList.add('wrong');
    window.setTimeout(() => button.classList.remove('wrong'), 260);
    feedback('wrong');
    $('errorLabel').textContent = `错误 ${totalErrors()}`;
    persistActive();
    return;
  }

  feedback('correct');
  app.active.target += 1;
  persistActive();
  if (app.active.target > stageEndValue(currentStage())) {
    completeStage();
  } else {
    const stage = currentStage();
    if (stage.type === 'fifty') {
      renderGame();
      return;
    }
    if (stage.type === 'simple') {
      button.classList.add('done');
      button.disabled = true;
    } else {
      button.classList.add('correct');
      window.setTimeout(() => button.classList.remove('correct'), 180);
    }
    $('targetLabel').textContent = app.active.target;
    $('progressBar').style.width = `${((app.active.target - stageStartValue(stage)) / (stageEndValue(stage) - stageStartValue(stage) + 1)) * 100}%`;
  }
}

function visibleStageCells(stage, target) {
  if (stage.type !== 'fifty') {
    return stage.layout.map((value) => ({
      value,
      highlighted: stage.type === 'simple' && value < target,
      revealed: false,
      empty: false
    }));
  }
  return stage.layout.map((frontValue, index) => {
    const hiddenValue = stage.hiddenLayout[index];
    if (target <= 25) return { value: frontValue < target ? hiddenValue : frontValue, highlighted: false, revealed: frontValue < target, empty: false };
    return { value: hiddenValue < target ? null : hiddenValue, highlighted: false, revealed: true, empty: hiddenValue < target };
  });
}

function completeStage() {
  stopTimer();
  const stage = currentStage();
  const durationMs = Math.max(0, Date.now() - app.active.stageStartedAt);
  app.active.stageResults.push({ type: stage.type || 'classic', size: stage.size, durationMs, errors: app.active.currentErrors });
  app.active.stageStartedAt = null;
  persistActive();
  feedback('stage');

  if (app.active.stageIndex === activeLevel().stages.length - 1) {
    finishChallenge();
    return;
  }

  $('stageCompleteTitle').textContent = `${stageDisplayName(stage)} 完成`;
  $('stageTime').textContent = `${formatSeconds(durationMs)} 秒`;
  $('stageErrors').textContent = `${app.active.currentErrors} 次`;
  const next = activeLevel().stages[app.active.stageIndex + 1];
  $('nextStageLabel').textContent = `下一阶段：${stageDisplayName(next)}`;
  openModal('stageModal');
  window.clearTimeout(app.stageAdvanceTimer);
  app.stageAdvanceTimer = window.setTimeout(advanceStage, app.data.settings.reduceMotion ? 500 : 3000);
}

function advanceStage() {
  if (!app.active || app.active.stageStartedAt || app.active.finished) return;
  window.clearTimeout(app.stageAdvanceTimer);
  closeModal('stageModal');
  app.active.stageIndex += 1;
  app.active.target = stageStartValue(currentStage());
  app.active.currentErrors = 0;
  app.active.stageStartedAt = Date.now();
  persistActive();
  renderGame();
  startTimer();
}

function finishChallenge() {
  app.active.finished = true;
  const result = buildResult();
  const firstResult = saveFirstResult(result);
  const newBest = saveBestResult(result);
  app.data.active = null;
  saveData();
  app.active.result = result;
  feedback('finish');
  renderResult(result, firstResult, newBest);
  showView('resultView');
}

function buildResult() {
  const stageResults = app.active.stageResults.map((item) => ({ ...item }));
  return {
    date: app.active.date,
    levelId: app.active.levelId,
    mode: app.active.mode || 'daily',
    totalMs: stageResults.reduce((sum, item) => sum + item.durationMs, 0),
    totalErrors: stageResults.reduce((sum, item) => sum + item.errors, 0),
    stages: stageResults,
    completedAt: new Date().toISOString()
  };
}

function renderResult(result, savedAsFirst, newBest = false) {
  const isDaily = result.mode === 'daily';
  const infiniteLabel = INFINITE_MODES[result.mode]?.label || '无限模式';
  $('resultEyebrow').textContent = isDaily ? 'DAILY COMPLETE' : 'INFINITE COMPLETE';
  $('resultTitle').textContent = isDaily ? '今日挑战完成' : `${infiniteLabel}完成`;
  $('resultTotal').parentElement.classList.toggle('new-best', newBest);
  $('resultTotal').textContent = formatSeconds(result.totalMs);
  $('resultErrors').textContent = `${result.totalErrors} 次`;
  $('resultStreakLabel').textContent = isDaily ? '连续完成' : '游玩限制';
  $('resultStreak').textContent = isDaily ? `${calculateStreak()} 天` : '不限次数';
  $('resultStages').innerHTML = result.stages.map((stage) => `<div><span>${stageDisplayName(stage)}</span><strong>${formatSeconds(stage.durationMs)}</strong><small>错误 ${stage.errors}</small></div>`).join('');
  $('resultCompareLabel').textContent = isDaily ? '近期对比' : '最快记录';
  $('resultCompare').textContent = isDaily ? comparisonLabel(result) : `${formatSeconds(bestResultFor(result)?.totalMs || result.totalMs)} 秒`;
  $('resultNote').textContent = savedAsFirst
    ? '这是今天唯一一次每日挑战成绩，已保存在当前浏览器。'
    : newBest
      ? `新纪录！这是${infiniteResultName(result)}目前最快的成绩。`
      : `本次不会计入每日挑战记录，${infiniteResultName(result)}最快为 ${formatSeconds(bestResultFor(result)?.totalMs || result.totalMs)} 秒。`;
  updateHudStars(activeLevel().stages.length, activeLevel().stages.length);
}

function comparisonLabel(result) {
  const previous = sortedRecords().filter((record) => record.date < result.date).slice(0, 7);
  if (!previous.length) return '首次记录';
  const average = previous.reduce((sum, record) => sum + record.totalMs, 0) / previous.length;
  const difference = result.totalMs - average;
  if (Math.abs(difference) < 500) return '与近期持平';
  return difference < 0 ? `快 ${formatSeconds(Math.abs(difference))}s` : `慢 ${formatSeconds(difference)}s`;
}

function showHome() {
  stopTimer();
  closeAllModals();
  showView('homeView');
  renderHome();
}

function renderHome() {
  const date = app.date;
  $('todayLabel').textContent = `${formatChineseDate(date)} · 北京时间`;
  $('levelId').textContent = app.level ? `#${app.level.id}` : '#--------';
  const todayRecord = app.data.records[date];
  const dailyActive = isDailyActive();
  const dailyUsed = hasUsedDailyAttempt();
  $('challengeState').textContent = todayRecord ? '今日已完成' : dailyActive ? '今日挑战进行中' : dailyUsed ? '今日机会已使用' : '今日未开始';
  $('challengeState').classList.toggle('complete', Boolean(todayRecord));
  $('challengeState').classList.toggle('in-progress', dailyActive);
  $('challengeState').classList.toggle('used', dailyUsed && !todayRecord && !dailyActive);
  $('startBtn').innerHTML = startButtonLabel();
  $('startBtn').disabled = !app.level || dailyUsed;
  $('infiniteBtn').innerHTML = infiniteButtonLabel();
  $('infiniteBtn').disabled = !app.level;
  renderModeButtons();
  const infiniteActive = Boolean(app.active && !app.active.finished && app.active.mode !== 'daily');
  $('dailyResumeBtn').classList.toggle('hidden', !dailyActive);
  $('dailyShareBtn').classList.toggle('hidden', !todayRecord);
  $('infiniteResumeBtn').classList.toggle('hidden', !infiniteActive);
  if (infiniteActive) $('infiniteResumeBtn').textContent = `继续${INFINITE_MODES[app.active.mode]?.label || '无限模式'}`;
  const streak = calculateStreak();
  $('streakValue').textContent = streak;
  $('streakHint').textContent = streak ? (todayRecord ? '今天也完成了' : '完成今天以延续记录') : '完成今日挑战开始记录';
  const latest = sortedRecords()[0];
  $('lastScore').textContent = latest ? `${formatSeconds(latest.totalMs)} 秒` : '—';
  $('hudTimer').textContent = '00:00:00';
  updateHudStars(todayRecord ? app.level?.stages.length || 3 : 0, app.level?.stages.length || 3);
}

function selectMode(mode) {
  if (!INFINITE_MODES[mode]) return;
  app.selectedMode = mode;
  renderHome();
}

function selectSize(size) {
  if (![3, 4, 5, 6].includes(size)) return;
  app.selectedSize = size;
  renderHome();
}

function renderModeButtons() {
  for (const button of document.querySelectorAll('[data-mode]')) {
    const active = button.dataset.mode === app.selectedMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  for (const button of document.querySelectorAll('[data-size]')) {
    const active = Number(button.dataset.size) === app.selectedSize;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  $('sizePicker').classList.toggle('hidden', app.selectedMode === 'fifty');
}

function startButtonLabel() {
  if (playedDailyToday()) return '今日已完成';
  if (isDailyActive()) return '今日挑战进行中';
  if (hasUsedDailyAttempt()) return '今日机会已使用';
  return '开始今日挑战 <span>→</span>';
}

function infiniteButtonLabel() {
  const size = app.selectedMode === 'fifty' ? '' : ` ${app.selectedSize}×${app.selectedSize}`;
  return `开始${INFINITE_MODES[app.selectedMode].label}${size} <span>→</span>`;
}

function saveFirstResult(result) {
  const mode = result.mode || 'daily';
  if (mode !== 'daily') return false;
  if (playedDailyToday()) return false;
  app.data.records[app.date] = result;
  trimRecords();
  return true;
}

function saveBestResult(result) {
  if (result.mode === 'daily') return false;
  const key = bestRecordKey(result);
  const previous = app.data.bestRecords[key];
  if (previous && previous.totalMs <= result.totalMs) return false;
  app.data.bestRecords[key] = { ...result };
  return true;
}

function bestRecordKey(result) {
  const size = result.mode === 'fifty' ? 5 : result.stages?.[0]?.size || app.selectedSize;
  return `${result.mode}:${size}`;
}

function bestResultFor(result) {
  return app.data.bestRecords[bestRecordKey(result)] || null;
}

function infiniteResultName(result) {
  if (result.mode === 'fifty') return '1-50 模式';
  return `${INFINITE_MODES[result.mode]?.label || '无限模式'} ${result.stages?.[0]?.size || app.selectedSize}×${result.stages?.[0]?.size || app.selectedSize}`;
}

function playedDailyToday() {
  return Boolean(app.data.records[app.date]);
}

function hasUsedDailyAttempt() {
  return playedDailyToday() || Boolean(app.data.dailyAttempts[app.date]);
}

function isDailyActive() {
  return Boolean(app.active && !app.active.finished && app.active.mode === 'daily' && app.active.date === app.date);
}

function claimDailyAttempt(startedAt = new Date().toISOString()) {
  app.data.dailyAttempts[app.date] ||= { startedAt };
  trimDailyAttempts();
  saveData();
}

function activeLevel() {
  if (app.active?.mode && app.active.mode !== 'daily' && app.active.level) return app.active.level;
  return app.level;
}

function levelForMode(mode) {
  if (mode === 'easy' || mode === 'classic') return createSingleStageLevel(mode, app.selectedSize);
  if (mode === 'fifty') return createFiftyLevel();
  return app.level;
}

function createSingleStageLevel(mode, size) {
  const values = Array.from({ length: size * size }, (_, index) => index + 1);
  return {
    id: `${app.level.id}-${mode}-${size}-${createRunId()}`,
    rulesVersion: app.level.rulesVersion,
    stages: [{ type: mode === 'easy' ? 'simple' : 'classic', size, layout: randomShuffle(values) }]
  };
}

function createFiftyLevel() {
  return {
    id: `${app.level.id}-fifty-${createRunId()}`,
    rulesVersion: app.level.rulesVersion,
    stages: [{
      type: 'fifty',
      size: 5,
      layout: randomShuffle(Array.from({ length: 25 }, (_, index) => index + 1)),
      hiddenLayout: randomShuffle(Array.from({ length: 25 }, (_, index) => index + 26))
    }]
  };
}

function randomShuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function createRunId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function modeLabel(mode = 'daily') {
  if (mode === 'daily') return '今日挑战';
  return `无限 · ${INFINITE_MODES[mode]?.label || '自由玩法'}`;
}

function stageStartValue() { return 1; }
function stageEndValue(stage) { return stage.type === 'fifty' ? 50 : Math.max(...stage.layout); }
function stageDisplayName(stage) { return stage.type === 'fifty' ? '1-50' : `${stage.size}×${stage.size}`; }

function showHistory() {
  const records = sortedRecords().slice(0, 30);
  $('historyList').innerHTML = records.length
    ? records.map((record) => `<div class="history-row"><span>${formatChineseDate(record.date)}</span><strong>${formatSeconds(record.totalMs)} 秒</strong><small>错误 ${record.totalErrors}</small></div>`).join('')
    : '<div class="empty-state">完成第一次每日挑战后，记录会出现在这里。</div>';
  openModal('historyModal');
}

function showSettings() {
  for (const [id, key] of [
    ['darkSetting', 'dark'], ['contrastSetting', 'contrast'], ['motionSetting', 'reduceMotion'],
    ['soundSetting', 'sound'], ['vibrationSetting', 'vibration']
  ]) $(id).checked = Boolean(app.data.settings[key]);
  syncThemeControls();
  openModal('settingsModal');
}

function showGuide() {
  app.guideStartsGame = false;
  $('guideStartBtn').textContent = '我知道了';
  openModal('guideModal');
}

function confirmAbandon() {
  const isDaily = app.active?.mode === 'daily';
  const title = isDaily ? '放弃今日挑战？' : '退出当前无限模式？';
  const message = isDaily
    ? '未完成的进度将被清空，且今天不能再次开始每日挑战。'
    : '未完成的进度将被清空，你可以随时重新开始任意无限玩法。';
  showConfirm(title, message, isDaily ? '确认放弃' : '确认退出', () => {
    stopTimer();
    app.active = null;
    app.data.active = null;
    saveData();
    showHome();
  });
}

function confirmClearData() {
  showConfirm('清除全部本地记录？', '过往成绩、连续天数、今天的挑战状态、未完成进度和偏好设置都会被删除。清除后可以重新开始今日挑战，此操作无法撤销。', '确认清除', () => {
    app.data = defaultData();
    app.active = null;
    saveData();
    applySettings();
    closeModal('settingsModal');
    renderHome();
    toast('全部本地记录已清除，可以重新挑战');
  });
}

function showConfirm(title, text, acceptLabel, action) {
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = text;
  $('confirmAccept').textContent = acceptLabel;
  app.confirmAction = action;
  openModal('confirmModal');
}

async function shareResult(resultOverride = null) {
  const result = resultOverride || app.active?.result || app.data.records[app.date];
  if (!result) return;
  const isDaily = result.mode === 'daily';
  const [, month, day] = result.date.split('-').map(Number);
  const heading = isDaily
    ? `${month}月 ${day} - 每日方格 #${result.levelId}`
    : `${month}月 ${day} - 每日方格 · ${INFINITE_MODES[result.mode]?.label || '无限模式'}`;
  const lines = ['https://playlinkr.net', heading];
  result.stages.forEach((stage, index) => {
    const average = stageAverageMs(result, index);
    const errorText = stage.errors === 0 ? '零错误' : `${stage.errors} 次错误`;
    lines.push(`舒尔特方格 ${index + 1} (${stageDisplayName(stage)}): ⭐ ${errorText} ⏱️ ${formatShareClock(stage.durationMs)} (平均 ${formatShareClock(average)})`);
  });
  lines.push(`总计: ⏱️ ${formatShareClock(result.totalMs)} · 错误 ${result.totalErrors} 次${isDaily ? ` · 连续 ${calculateStreak()} 天` : ''}`);
  if (!isDaily) {
    const best = bestResultFor(result) || result;
    lines.push(`最快记录 (${infiniteResultName(result)}): 🏆 ${formatShareClock(best.totalMs)}`);
  }
  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('今日成绩已复制');
  } catch {
    fallbackCopy(text);
  }
}

function stageAverageMs(result, stageIndex) {
  const samples = sortedRecords()
    .filter((record) => record.stages?.[stageIndex])
    .map((record) => record.stages[stageIndex].durationMs);
  if (!samples.includes(result.stages[stageIndex].durationMs)) samples.push(result.stages[stageIndex].durationMs);
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
  toast('成绩已复制');
}

function exportHistory() {
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), timeZone: TIME_ZONE, records: app.data.records, bestRecords: app.data.bestRecords }, null, 2);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  link.download = `schulte-daily-${app.date}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function startTimer() {
  stopTimer();
  const loop = (timestamp) => {
    if (timestamp - app.lastTimerPaint >= 40) {
      paintTimer();
      app.lastTimerPaint = timestamp;
    }
    app.timerFrame = requestAnimationFrame(loop);
  };
  app.timerFrame = requestAnimationFrame(loop);
}

function stopTimer() {
  if (app.timerFrame) cancelAnimationFrame(app.timerFrame);
  app.timerFrame = null;
}

function paintTimer(force = false) {
  if (!app.active) return;
  const completed = app.active.stageResults.reduce((sum, item) => sum + item.durationMs, 0);
  const current = app.active.stageStartedAt ? Date.now() - app.active.stageStartedAt : 0;
  const elapsed = completed + current;
  if (force || $('timerLabel')) $('timerLabel').textContent = formatSeconds(elapsed);
  $('hudTimer').textContent = formatClock(elapsed);
}

function currentStage() { return activeLevel().stages[app.active.stageIndex]; }
function totalErrors() { return app.active.stageResults.reduce((sum, item) => sum + item.errors, 0) + app.active.currentErrors; }

function calculateStreak() {
  const completed = new Set(Object.keys(app.data.records));
  let cursor = completed.has(app.date) ? app.date : addDays(app.date, -1);
  let streak = 0;
  while (completed.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function sortedRecords() {
  return Object.values(app.data.records).sort((first, second) => second.date.localeCompare(first.date));
}

function trimRecords() {
  const keep = sortedRecords().slice(0, 30);
  app.data.records = Object.fromEntries(keep.map((record) => [record.date, record]));
}

function trimDailyAttempts() {
  const dates = Object.keys(app.data.dailyAttempts).sort((first, second) => second.localeCompare(first)).slice(0, 60);
  app.data.dailyAttempts = Object.fromEntries(dates.map((date) => [date, app.data.dailyAttempts[date]]));
}

function persistActive() {
  if (!app.active || app.active.finished) return;
  app.data.active = app.active;
  saveData();
}

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return normalizeData(parsed);
  } catch {
    return defaultData();
  }
}

function normalizeData(data) {
  const fresh = defaultData();
  if (!data || typeof data !== 'object') return fresh;
  const normalized = {
    seenGuide: Boolean(data.seenGuide),
    records: data.records && typeof data.records === 'object' ? data.records : {},
    bestRecords: data.bestRecords && typeof data.bestRecords === 'object' ? data.bestRecords : {},
    dailyAttempts: data.dailyAttempts && typeof data.dailyAttempts === 'object' ? data.dailyAttempts : {},
    active: data.active && typeof data.active === 'object' ? data.active : null,
    settings: { ...fresh.settings, ...(data.settings || {}) }
  };
  for (const [date, record] of Object.entries(normalized.records)) {
    normalized.dailyAttempts[date] ||= { startedAt: record.completedAt || `${date}T00:00:00.000Z` };
  }
  if (normalized.active?.mode === 'daily' && normalized.active.date) {
    normalized.dailyAttempts[normalized.active.date] ||= { startedAt: normalized.active.createdAt || new Date().toISOString() };
  }
  return normalized;
}

function defaultData() {
  return { seenGuide: false, records: {}, bestRecords: {}, dailyAttempts: {}, active: null, settings: { ...DEFAULT_SETTINGS } };
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(app.data));
    app.storageAvailable = true;
  } catch {
    app.storageAvailable = false;
  }
}

function detectStorageAvailability() {
  try {
    const probe = '__schulte_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  } catch {
    app.storageAvailable = false;
    $('loadMessage').textContent = '浏览器禁止本地存储：可以游玩，但成绩和连续记录无法长期保存。';
  }
}

function applySettings() {
  const settings = app.data.settings;
  document.documentElement.dataset.theme = settings.dark ? 'dark' : 'light';
  document.documentElement.dataset.contrast = settings.contrast ? 'high' : 'normal';
  document.documentElement.dataset.reduceMotion = String(Boolean(settings.reduceMotion));
  document.documentElement.dataset.gridTheme = String(normalizeGridTheme(settings.gridTheme));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.dark ? '#171b18' : '#f3f0e8');
  syncThemeControls();
}

function setGridTheme(value) {
  app.data.settings.gridTheme = normalizeGridTheme(value);
  saveData();
  applySettings();
}

function normalizeGridTheme(value) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < GRID_THEMES.length ? index : 0;
}

function syncThemeControls() {
  const index = normalizeGridTheme(app.data.settings.gridTheme);
  for (const id of ['gridThemeSetting', 'guideGridTheme']) {
    if ($(id)) $(id).value = String(index);
  }
  if ($('settingsThemeName')) $('settingsThemeName').textContent = GRID_THEMES[index];
  if ($('guideThemeName')) $('guideThemeName').textContent = GRID_THEMES[index];
}

function feedback(type) {
  if (app.data.settings.vibration && navigator.vibrate) {
    navigator.vibrate(type === 'wrong' ? [25, 30, 25] : type === 'finish' ? [30, 45, 70] : 12);
  }
  if (!app.data.settings.sound) return;
  try {
    app.audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = app.audio.createOscillator();
    const gain = app.audio.createGain();
    oscillator.frequency.value = type === 'wrong' ? 180 : type === 'finish' ? 660 : type === 'stage' ? 520 : 410;
    gain.gain.setValueAtTime(.035, app.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, app.audio.currentTime + .09);
    oscillator.connect(gain).connect(app.audio.destination);
    oscillator.start();
    oscillator.stop(app.audio.currentTime + .1);
  } catch { /* Browsers may block audio feedback. */ }
}

function checkDateChange() {
  const current = dateInTimeZone();
  if (current !== app.date) $('dateNotice').classList.remove('hidden');
}

function showView(id) {
  for (const view of document.querySelectorAll('.view')) view.classList.toggle('hidden', view.id !== id);
}

function openModal(id) {
  const modal = $(id);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(id) {
  if (id === 'stageModal') window.clearTimeout(app.stageAdvanceTimer);
  const modal = $(id);
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function closeAllModals() {
  for (const modal of document.querySelectorAll('.modal')) closeModal(modal.id);
}

function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.classList.remove('hidden');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => element.classList.add('hidden'), 2200);
}

function dateInTimeZone(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatChineseDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'long', timeZone: TIME_ZONE }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  return `${year}年${month}月${day}日 · ${weekday}`;
}

function addDays(date, offset) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

function formatSeconds(milliseconds) { return (milliseconds / 1000).toFixed(2); }

function formatClock(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatShareClock(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function updateHudStars(completedStages, totalStages = activeLevel()?.stages.length || app.level?.stages.length || 3) {
  const count = totalStages;
  $('hudStars').textContent = Array.from({ length: count }, (_, index) => index < completedStages ? '★' : '☆').join(' ');
}
