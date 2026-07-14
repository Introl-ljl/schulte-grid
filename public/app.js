const TIME_ZONE = 'Asia/Shanghai';
const STORAGE_KEY = 'schulte-daily-v1';
const UPDATE_LOG_KEY = 'schulte-update-user-login-v4';
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
  guideStartsGame: false,
  currentUser: null,
  apiAvailable: true,
  pendingStartMode: null,
  dailyLeaderboard: null,
  leaderboardMode: 'daily',
  leaderboardSize: 3,
  leaderboardTimeframe: 'today'
};

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  bindEvents();
  applySettings();
  detectStorageAvailability();
  await loadAccount();
  await loadLevels();
  await refreshDailyLeaderboard();
  renderHome();
  if (app.currentUser) showUpdateLogOnce();
  else showUser();
  checkDateChange();
  window.setInterval(checkDateChange, 30000);
  window.setInterval(refreshDynamicRankings, 60000);
  registerServiceWorker();
}

async function loadAccount() {
  try {
    const payload = await SchulteApi.session();
    app.apiAvailable = true;
    app.currentUser = payload.user || null;
    app.data = loadData(app.currentUser?.id || null);
    app.active = app.data.active || null;
    applySettings();
  } catch (error) {
    app.apiAvailable = false;
    app.currentUser = null;
    $('loadMessage').textContent = `排行榜服务暂不可用：${error.message}`;
  }
  renderUser();
}

function showUser() {
  renderUser();
  openModal('userModal');
}

function renderUser() {
  $('userLabel').textContent = app.currentUser?.username || (app.apiAvailable ? '登录' : '登录不可用');
  $('userButton').classList.toggle('signed-in', Boolean(app.currentUser));
  $('signedInPanel').classList.toggle('hidden', !app.currentUser);
  $('userForms').classList.toggle('hidden', Boolean(app.currentUser));
  $('userModalClose').classList.toggle('hidden', !app.currentUser);
  if (app.currentUser) $('signedInUsername').textContent = app.currentUser.username;
  $('userMessage').textContent = app.apiAvailable ? '' : '登录服务暂不可用，请稍后重试。';
  if (!app.currentUser) showLoginPanel();
}

function showLoginPanel() {
  $('loginPanel').classList.remove('hidden');
  $('registerPanel').classList.add('hidden');
  $('userTitle').textContent = '登录每日方格';
}

function showRegisterPanel() {
  $('loginPanel').classList.add('hidden');
  $('registerPanel').classList.remove('hidden');
  $('userTitle').textContent = '注册新用户';
}

async function loginUser(event) {
  event.preventDefault();
  const username = $('loginUsername').value;
  const pin = $('loginPin').value;
  await runUserAction(event.submitter, async () => {
    const payload = await SchulteApi.login(username, pin);
    await acceptUser(payload.user);
  });
}

async function registerUser(event) {
  event.preventDefault();
  const username = $('registerUsername').value;
  const pin = $('registerPin').value;
  await runUserAction(event.submitter, async () => {
    const payload = await SchulteApi.register(username, pin);
    await acceptUser(payload.user);
  });
}

async function runUserAction(button, action) {
  button.disabled = true;
  $('userMessage').textContent = '正在验证…';
  try {
    await action();
    $('userMessage').textContent = '';
  } catch (error) {
    $('userMessage').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function acceptUser(user) {
  app.currentUser = user;
  app.data = loadData(user.id);
  app.active = app.data.active || null;
  $('loginUsername').value = '';
  $('loginPin').value = '';
  $('registerUsername').value = '';
  $('registerPin').value = '';
  renderUser();
  applySettings();
  closeModal('userModal');
  await refreshDailyLeaderboard();
  renderHome();
  app.pendingStartMode = null;
  showUpdateLogOnce();
}

async function logoutUser() {
  try {
    await SchulteApi.logout();
  } catch (error) {
    $('userMessage').textContent = error.message;
    return;
  }
  app.currentUser = null;
  app.data = loadData(null);
  app.active = app.data.active || null;
  app.dailyLeaderboard = null;
  renderUser();
  applySettings();
  showHome();
  showUser();
  toast('已退出登录');
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
  $('dailyShareBtn').addEventListener('click', () => shareResult(app.data.records[app.date]));
  $('dailyReplayBtn').addEventListener('click', requestReplayStart);
  $('guideStartBtn').addEventListener('click', async () => {
    app.data.seenGuide = true;
    saveData();
    closeModal('guideModal');
    if (app.guideStartsGame) await prepareChallenge();
    app.guideStartsGame = false;
  });
  $('continueBtn').addEventListener('click', advanceStage);
  $('abandonBtn').addEventListener('click', confirmAbandon);
  $('resetBtn').addEventListener('click', resetInfiniteChallenge);
  $('gameStartBtn').addEventListener('click', startPreparedChallenge);
  $('shareBtn').addEventListener('click', () => shareResult());
  $('replayBtn').addEventListener('click', showHome);
  $('restartBtn').addEventListener('click', restartChallenge);
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
  $('loginForm').addEventListener('submit', loginUser);
  $('registerForm').addEventListener('submit', registerUser);
  $('toRegisterBtn').addEventListener('click', showRegisterPanel);
  $('toLoginBtn').addEventListener('click', showLoginPanel);
  $('logoutBtn').addEventListener('click', logoutUser);
  $('leaderboardModes').addEventListener('click', (event) => {
    const mode = event.target.closest('[data-board-mode]')?.dataset.boardMode;
    if (!mode) return;
    app.leaderboardMode = mode;
    if (mode === 'fifty') app.leaderboardSize = 5;
    renderLeaderboardControls();
    loadLeaderboard();
  });
  $('leaderboardSize').addEventListener('change', (event) => {
    app.leaderboardSize = Number(event.target.value);
    loadLeaderboard();
  });
  $('leaderboardTimeframe').addEventListener('change', (event) => {
    app.leaderboardTimeframe = event.target.value;
    loadLeaderboard();
  });

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'home') showHome();
    if (action === 'history') showHistory();
    if (action === 'user') showUser();
    if (action === 'leaderboard') showLeaderboard();
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
    else refreshDynamicRankings();
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
    if (saved && saved.mode === 'daily' && saved.date === app.date && !saved.finished) app.active = saved;
  } catch (error) {
    $('loadMessage').textContent = `关卡数据加载失败：${error.message}`;
    $('startBtn').disabled = true;
  }
}

function requestDailyStart() {
  if (!app.level) return;
  if (hasUsedDailyAttempt()) {
    toast(playedDailyToday() ? '今日挑战已完成，可复战或明天再来' : '今日正式挑战机会已经使用，请明天再来');
    renderHome();
    return;
  }
  requestStart('daily');
}

function requestReplayStart() {
  if (!app.level || !playedDailyToday()) return;
  requestStart('replay');
}

function requestInfiniteStart() {
  requestStart(app.selectedMode);
}

function requestStart(mode) {
  if (!app.level) return;
  if (mode !== 'replay' && !app.currentUser) {
    app.pendingStartMode = mode;
    showUser();
    toast(app.apiAvailable ? '请先登录或注册用户' : '登录服务暂时不可用');
    return;
  }
  if (app.active && !app.active.finished && app.active.mode !== 'daily') {
    if (app.active.mode === mode) {
      resumeChallenge();
      return;
    }
    showConfirm('切换到其他玩法？', '当前进度将被清空，确认切换到其他玩法？', '确认切换', () => {
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
  prepareChallenge();
}

async function prepareChallenge() {
  if (app.activeMode === 'daily') {
    if (hasUsedDailyAttempt()) {
      toast(playedDailyToday() ? '今日挑战已完成，可复战或明天再来' : '今日正式挑战机会已经使用，请明天再来');
      showHome();
      return;
    }
  }
  app.active = createActiveChallenge();
  app.data.active = null;
  saveData();
  showView('gameView');
  renderGame();
  stopTimer();
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
    serverRunId: null,
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
  if (!app.active.stageStartedAt && app.active.stageResults.length > 0) app.active.stageStartedAt = Date.now();
  showView('gameView');
  renderGame();
  if (app.active.stageStartedAt) startTimer();
  else stopTimer();
}

async function startPreparedChallenge() {
  if (!isAwaitingInitialStart()) return;
  const isCompetitive = app.active.mode !== 'replay';
  if (isCompetitive && !app.currentUser) {
    app.pendingStartMode = app.active.mode;
    showUser();
    return;
  }
  if (isCompetitive && !app.active.serverRunId) {
    const button = $('gameStartBtn');
    button.disabled = true;
    button.textContent = '正在登记正式成绩…';
    try {
      const level = activeLevel();
      const response = await SchulteApi.startRun({
        mode: app.active.mode,
        gridSize: app.active.mode === 'fifty' ? 5 : level.stages[0]?.size,
        levelId: app.active.levelId,
        rulesVersion: app.active.rulesVersion
      });
      app.active.serverRunId = response.runId;
      app.active.date = response.date;
    } catch (error) {
      button.disabled = false;
      button.textContent = '开始游戏';
      toast(error.message);
      if (error.code === 'AUTH_REQUIRED') {
        app.currentUser = null;
        renderUser();
        showUser();
      }
      if (error.code === 'STALE_DAILY_LEVEL') $('dateNotice').classList.remove('hidden');
      return;
    }
    button.disabled = false;
    button.textContent = '开始游戏';
  }
  if (app.active.mode === 'daily') {
    const savedAttempt = app.data.active?.createdAt === app.active.createdAt;
    if (hasUsedDailyAttempt() && !savedAttempt) {
      toast('今日挑战机会已使用，请明天再来');
      app.active = null;
      showHome();
      return;
    }
    claimDailyAttempt(app.active.createdAt);
  }
  app.active.stageStartedAt = Date.now();
  persistActive();
  renderGame();
  startTimer();
}

function resetInfiniteChallenge() {
  if (!app.active || app.active.finished || app.active.mode === 'daily') return;
  const mode = app.active.mode;
  const level = activeLevel();
  stopTimer();
  window.clearTimeout(app.stageAdvanceTimer);
  closeModal('stageModal');
  app.activeMode = mode;
  app.selectedMode = mode;
  if (mode !== 'fifty') app.selectedSize = level.stages[0].size;
  app.active = createActiveChallenge();
  app.data.active = null;
  saveData();
  showView('gameView');
  renderGame();
  toast('游戏已重置，准备好后点击开始游戏');
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
  $('abandonBtn').textContent = app.active.mode === 'daily' ? '放弃今日挑战' : app.active.mode === 'replay' ? '退出复战' : '退出无限模式';
  $('resetBtn').classList.toggle('hidden', app.active.mode === 'daily');
  const awaitingStart = isAwaitingInitialStart();
  $('gameBoard').classList.toggle('ready', awaitingStart);
  $('gameStartPanel').setAttribute('aria-hidden', String(!awaitingStart));
  if (awaitingStart) {
    const startBtn = $('gameStartBtn');
    startBtn.disabled = false;
    startBtn.textContent = '开始游戏';
  }
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
  $('stageTime').textContent = formatDuration(durationMs);
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

async function finishChallenge() {
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
  if (result.mode !== 'replay') await submitCompetitiveResult(result, firstResult, newBest);
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
  const isReplay = result.mode === 'replay';
  const infiniteLabel = INFINITE_MODES[result.mode]?.label || '无限模式';
  $('resultEyebrow').textContent = isDaily ? 'DAILY COMPLETE' : isReplay ? 'REPLAY COMPLETE' : 'INFINITE COMPLETE';
  $('resultTitle').textContent = isDaily ? '今日挑战完成' : isReplay ? '复战完成' : `${infiniteLabel}完成`;
  const tier = recordTier(result);
  const totalEl = $('resultTotal').parentElement;
  totalEl.classList.remove('tier-fastest', 'tier-today-fastest', 'tier-overall-fastest', 'tier-normal', 'tier-slower');
  totalEl.classList.add(`tier-${tier}`);
  $('resultTotal').textContent = formatDuration(result.totalMs);
  $('resultErrors').textContent = `${result.totalErrors} 次`;
  $('resultStreakLabel').textContent = isDaily ? '连续完成' : isReplay ? '复战模式' : '游玩限制';
  $('resultStreak').textContent = isDaily ? `${calculateStreak()} 天` : isReplay ? '随机布局' : '不限次数';
  const stagesEl = $('resultStages');
  if (result.stages.length > 1) {
    stagesEl.classList.remove('hidden');
    stagesEl.innerHTML = result.stages.map((stage, index) => `<div class="sector tier-${stageTier(result, index)}"><span>${stageDisplayName(stage)}</span><b>${formatDuration(stage.durationMs)}</b></div>`).join('');
  } else {
    stagesEl.classList.add('hidden');
    stagesEl.innerHTML = '';
  }
  if (isReplay) {
    $('resultCompareLabel').textContent = '复战说明';
    $('resultCompare').textContent = '随机布局 · 可多次挑战';
  } else {
    $('resultCompareLabel').textContent = result.globalRank ? (result.globalRankIsBest ? '用户最佳排名' : '全局排名') : isDaily ? '近期对比' : '本地最快';
    $('resultCompare').textContent = result.globalRank ? `第 ${result.globalRank} 名` : isDaily ? comparisonLabel(result) : formatDuration(bestResultFor(result)?.totalMs || result.totalMs);
  }
  $('resultNote').textContent = isDaily
    ? (savedAsFirst
        ? (result.syncError ? `本地成绩已保存，但未进入全局榜：${result.syncError}` : result.globalRank ? `正式成绩已进入今日全局榜，目前排名第 ${result.globalRank}。` : '成绩已保存，正在同步到今日全局榜。')
        : `本次不会计入每日挑战记录，${infiniteResultName(result)}最快为 ${formatDuration(bestResultFor(result)?.totalMs || result.totalMs)}。`)
    : isReplay
      ? '复战使用随机布局，成绩不计入每日记录，可在完成每日挑战后反复游玩。'
      : result.syncError
        ? `本地成绩已保存，但未进入全局榜：${result.syncError}`
        : result.globalRank
          ? `成绩已进入${infiniteResultName(result)}今日全局榜，目前排名第 ${result.globalRank}。`
          : newBest
            ? `本地新纪录！正在同步${infiniteResultName(result)}全局榜。`
            : `成绩正在同步，当前本地最快为 ${formatDuration(bestResultFor(result)?.totalMs || result.totalMs)}。`;
  updateHudStars(activeLevel().stages.length, activeLevel().stages.length);
}

async function submitCompetitiveResult(result, savedAsFirst, newBest) {
  if (!app.active?.serverRunId) {
    result.syncError = '缺少正式运行编号';
    renderResult(result, savedAsFirst, newBest);
    return;
  }
  try {
    const response = await SchulteApi.finishRun({
      runId: app.active.serverRunId,
      totalMs: result.totalMs,
      totalErrors: result.totalErrors,
      stages: result.stages
    });
    if (response.ranking) {
      result.globalRank = response.ranking.rank;
      result.globalRankIsBest = result.mode !== 'daily';
      result.globalTiers = {
        total: response.ranking.totalTier,
        stages: response.ranking.stageTiers
      };
    }
    if (result.mode === 'daily') app.dailyLeaderboard = response.leaderboard;
    renderResult(result, savedAsFirst, newBest);
    if (result.mode === 'daily') renderHomeDynamicRanking();
  } catch (error) {
    result.syncError = error.message;
    renderResult(result, savedAsFirst, newBest);
  }
}

function comparisonLabel(result) {
  const previous = sortedRecords().filter((record) => record.date < result.date).slice(0, 7);
  if (!previous.length) return '首次记录';
  const average = previous.reduce((sum, record) => sum + record.totalMs, 0) / previous.length;
  const difference = result.totalMs - average;
  if (Math.abs(difference) < 500) return '与近期持平';
  return difference < 0 ? `快 ${formatDuration(Math.abs(difference))}` : `慢 ${formatDuration(difference)}`;
}

function recordTier(result) {
  if (result.mode === 'replay') return 'normal';
  if (result.globalTiers?.total) return result.globalTiers.total;
  if (result.mode === 'daily') {
    const entry = currentDailyEntry();
    if (entry && entry.totalMs === result.totalMs) return entry.tier;
    return tierFromBenchmark(result.totalMs, app.dailyLeaderboard?.benchmarks?.total);
  }
  return 'normal';
}

function stageTier(record, index) {
  if (record.mode === 'replay') return 'normal';
  if (record.globalTiers?.stages?.[index]) return record.globalTiers.stages[index];
  if (record.mode === 'daily') {
    const entry = currentDailyEntry();
    if (entry?.stages?.[index]?.durationMs === record.stages[index].durationMs) return entry.stages[index].tier;
    return tierFromBenchmark(record.stages[index].durationMs, app.dailyLeaderboard?.benchmarks?.stages?.[index]);
  }
  return 'normal';
}

function renderDailyLap(record) {
  const board = $('lapBoard');
  const total = $('lapTotal');
  const sectors = $('lapSectors').children;
  board.classList.remove('has-time', 'tier-fastest', 'tier-today-fastest', 'tier-overall-fastest', 'tier-normal', 'tier-slower');
  if (!record) {
    total.textContent = '--:--.---';
    for (const sector of sectors) sector.querySelector('b').textContent = '--:--.---';
    return;
  }
  board.classList.add('has-time', `tier-${recordTier(record)}`);
  total.textContent = formatDuration(record.totalMs);
  record.stages.forEach((stage, index) => {
    const sector = sectors[index];
    if (!sector) return;
    sector.querySelector('b').textContent = formatDuration(stage.durationMs);
    sector.classList.remove('tier-fastest', 'tier-today-fastest', 'tier-overall-fastest', 'tier-normal', 'tier-slower');
    sector.classList.add(`tier-${stageTier(record, index)}`);
  });
}

function showHome() {
  stopTimer();
  closeAllModals();
  if (app.active && !app.active.finished && app.active.mode !== 'daily') terminateInfiniteChallenge();
  if (isAwaitingInitialStart() && app.active.mode === 'daily' && !hasUsedDailyAttempt()) {
    app.active = null;
    app.data.active = null;
    saveData();
  }
  showView('homeView');
  renderHome();
}

function terminateInfiniteChallenge() {
  if (!app.active || app.active.mode === 'daily') return;
  app.active = null;
  app.data.active = null;
  saveData();
}

function restartChallenge() {
  const result = app.active?.result;
  if (!result) { showHome(); return; }
  const mode = result.mode || 'daily';
  app.active = null;
  app.data.active = null;
  saveData();
  if (mode === 'daily') { showHome(); return; }
  app.activeMode = mode;
  app.selectedMode = mode;
  if (mode !== 'fifty' && result.stages?.[0]) app.selectedSize = result.stages[0].size;
  requestStart(mode);
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
  const dailyTier = $('dailyTier');
  if (todayRecord) {
    const tier = recordTier(todayRecord);
    dailyTier.textContent = tierLabel(tier);
    dailyTier.className = `status-tag tier-tag tier-${tier}`;
  } else {
    dailyTier.className = 'status-tag tier-tag hidden';
  }
  renderDailyLap(todayRecord);
  $('startBtn').innerHTML = startButtonLabel();
  $('startBtn').disabled = !app.level || dailyUsed;
  $('infiniteBtn').innerHTML = infiniteButtonLabel();
  $('infiniteBtn').disabled = !app.level;
  renderModeButtons();
  $('dailyResumeBtn').classList.toggle('hidden', !dailyActive);
  $('dailyShareBtn').classList.toggle('hidden', !todayRecord);
  $('dailyReplayBtn').classList.toggle('hidden', !todayRecord);
  const streak = calculateStreak();
  $('streakValue').textContent = streak;
  $('streakHint').textContent = streak ? (todayRecord ? '今天也完成了' : '完成今天以延续记录') : '完成今日挑战开始记录';
  const latest = sortedRecords()[0];
  $('lastScore').textContent = latest ? formatDuration(latest.totalMs) : '—';
  $('hudTimer').textContent = '00:00.000';
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
  if (result.mode === 'daily' || result.mode === 'replay') return false;
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

function isAwaitingInitialStart() {
  return Boolean(app.active && !app.active.finished && app.active.stageIndex === 0 && app.active.stageResults.length === 0 && !app.active.stageStartedAt);
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
  if (mode === 'replay') return createReplayLevel();
  return app.level;
}

function createReplayLevel() {
  const classicStage = (size) => ({ type: 'classic', size, layout: randomShuffle(Array.from({ length: size * size }, (_, index) => index + 1)) });
  return {
    id: `${app.level.id}-replay-${createRunId()}`,
    rulesVersion: app.level.rulesVersion,
    stages: [
      classicStage(3),
      classicStage(4),
      classicStage(5),
      {
        type: 'fifty',
        size: 5,
        layout: randomShuffle(Array.from({ length: 25 }, (_, index) => index + 1)),
        hiddenLayout: randomShuffle(Array.from({ length: 25 }, (_, index) => index + 26))
      }
    ]
  };
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
  if (mode === 'replay') return '每日复战';
  return `无限 · ${INFINITE_MODES[mode]?.label || '自由玩法'}`;
}

function stageStartValue() { return 1; }
function stageEndValue(stage) { return stage.type === 'fifty' ? 50 : Math.max(...stage.layout); }
function stageDisplayName(stage) { return stage.type === 'fifty' ? '1-50' : `${stage.size}×${stage.size}`; }

function showHistory() {
  const records = sortedRecords().slice(0, 30);
  $('historyList').innerHTML = records.length
    ? records.map((record) => `<div class="history-row"><span>${formatChineseDate(record.date)}</span><strong>${formatDuration(record.totalMs)}</strong><small>错误 ${record.totalErrors}</small></div>`).join('')
    : '<div class="empty-state">完成第一次每日挑战后，记录会出现在这里。</div>';
  openModal('historyModal');
}

function showLeaderboard() {
  renderLeaderboardControls();
  showView('leaderboardView');
  loadLeaderboard();
}

function renderLeaderboardControls() {
  for (const button of document.querySelectorAll('[data-board-mode]')) {
    button.classList.toggle('active', button.dataset.boardMode === app.leaderboardMode);
  }
  const daily = app.leaderboardMode === 'daily';
  const fifty = app.leaderboardMode === 'fifty';
  $('leaderboardSize').value = String(fifty ? 5 : app.leaderboardSize);
  $('leaderboardSize').disabled = daily || fifty;
  $('leaderboardTimeframe').value = daily ? 'today' : app.leaderboardTimeframe;
  $('leaderboardTimeframe').disabled = daily;
}

async function loadLeaderboard() {
  if (!app.apiAvailable) {
    $('leaderboardList').innerHTML = '<div class="empty-state">排行榜服务暂不可用。</div>';
    return;
  }
  $('leaderboardList').innerHTML = '<div class="empty-state">正在加载排行榜…</div>';
  try {
    const board = await SchulteApi.leaderboard({
      mode: app.leaderboardMode,
      size: app.leaderboardMode === 'daily' ? null : app.leaderboardMode === 'fifty' ? 5 : app.leaderboardSize,
      timeframe: app.leaderboardMode === 'daily' ? 'today' : app.leaderboardTimeframe
    });
    if (board.mode === 'daily') app.dailyLeaderboard = board;
    renderLeaderboard(board);
    if (board.mode === 'daily') renderHomeDynamicRanking();
  } catch (error) {
    $('leaderboardList').innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

const DAILY_STAGE_LABELS = ['3×3', '4×4', '5×5', '1-50'];

function benchmarkTierOf(value, benchmark) {
  if (value == null) return 'normal';
  if (benchmark?.overallFastestMs != null && value <= benchmark.overallFastestMs) return 'overall-fastest';
  if (benchmark?.todayFastestMs != null && value <= benchmark.todayFastestMs) return 'today-fastest';
  return 'normal';
}

function renderLeaderboard(board) {
  const benchmarks = board.benchmarks || {};
  const totalBench = benchmarks.total || {};
  const stageBenches = benchmarks.stages || [];
  const isDaily = board.mode === 'daily';
  const isToday = (board.timeframe || 'today') === 'today';
  const primaryMs = isToday ? totalBench.todayFastestMs : totalBench.overallFastestMs;
  const secondaryMs = isToday ? totalBench.overallFastestMs : totalBench.todayFastestMs;
  const primaryLabel = isToday ? 'TODAY FASTEST · 今日最快' : 'ALL-TIME BEST · 整体最速';
  const secondaryLabel = isToday ? '整体最速' : '今日最快';
  const participants = board.participantCount ?? board.entries.length;

  const sectorsHtml = (stages, fallbackLabels) => stages && stages.length > 1
    ? `<div class="lb-sectors">${stages.map((stage, i) => {
        const label = fallbackLabels ? (fallbackLabels[i] ?? stageDisplayName(stage)) : escapeHtml(stageDisplayName(stage));
        return `<div class="sector tier-${stage.tier || 'normal'}"><span>${label}</span><b>${formatDuration(stage.durationMs)}</b></div>`;
      }).join('')}</div>`
    : '';

  const benchmarkEl = $('lbBenchmark');
  if (primaryMs != null) {
    const benchTier = benchmarkTierOf(primaryMs, totalBench);
    const benchSectors = isDaily && stageBenches.length
      ? `<div class="lb-sectors">${stageBenches.map((sb, i) => {
          const stageVal = isToday ? sb.todayFastestMs : sb.overallFastestMs;
          const stageTier = benchmarkTierOf(stageVal, sb);
          const label = DAILY_STAGE_LABELS[i] ?? `#${i + 1}`;
          return `<div class="sector tier-${stageTier}"><span>${label}</span><b>${stageVal != null ? formatDuration(stageVal) : '--:--.---'}</b></div>`;
        }).join('')}</div>`
      : '';
    benchmarkEl.innerHTML = `
      <div class="lb-bench tier-${benchTier}">
        <div class="lb-bench-top">
          <span class="lb-bench-tag">${primaryLabel}</span>
          <span class="lb-bench-count">参与 <b>${participants}</b></span>
        </div>
        <strong class="lb-bench-time">${formatDuration(primaryMs)}</strong>
        ${benchSectors}
        <div class="lb-bench-foot">${secondaryLabel} <b>${secondaryMs != null ? formatDuration(secondaryMs) : '—'}</b></div>
      </div>`;
  } else {
    benchmarkEl.innerHTML = `
      <div class="lb-bench">
        <div class="lb-bench-top">
          <span class="lb-bench-tag">${primaryLabel}</span>
          <span class="lb-bench-count">参与 <b>${participants}</b></span>
        </div>
        <strong class="lb-bench-time">--:--.---</strong>
      </div>`;
  }

  if (!board.entries.length) {
    $('leaderboardList').innerHTML = '<div class="empty-state">还没有正式成绩，等你成为第一个。</div>';
    return;
  }
  $('leaderboardList').innerHTML = board.entries.map((entry) => {
    const rankBadge = entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`;
    const entrySectors = sectorsHtml(entry.stages);
    return `
    <article class="lb-row tier-${entry.tier}${entry.isMe ? ' is-me' : ''}">
      <div class="lb-rank"><b>${rankBadge}</b></div>
      <div class="lb-body">
        <div class="lb-line">
          <strong class="lb-name">${escapeHtml(entry.username)}${entry.isMe ? '<em class="lb-you">你</em>' : ''}</strong>
          <time class="lb-time tier-${entry.tier}">${formatDuration(entry.totalMs)}</time>
        </div>
        ${entrySectors}
        <div class="lb-meta">错误 ${entry.totalErrors}</div>
      </div>
    </article>`;
  }).join('');
}

async function refreshDailyLeaderboard() {
  if (!app.apiAvailable) return;
  try {
    app.dailyLeaderboard = await SchulteApi.leaderboard({ mode: 'daily', timeframe: 'today' });
    syncDailyStateFromServer();
    renderHomeDynamicRanking();
  } catch (error) {
    console.warn('每日排行榜刷新失败', error);
  }
}

function syncDailyStateFromServer() {
  const status = app.dailyLeaderboard?.dailyStatus;
  if (status?.attempted) {
    app.data.dailyAttempts[app.date] ||= { startedAt: status.startedAt || new Date().toISOString() };
  }
  const entry = currentDailyEntry();
  if (entry && !app.data.records[app.date]) {
    app.data.records[app.date] = {
      date: app.date,
      levelId: app.level?.id || app.date.replaceAll('-', ''),
      mode: 'daily',
      totalMs: entry.totalMs,
      totalErrors: entry.totalErrors,
      stages: entry.stages.map(({ tier, ...stage }) => stage),
      completedAt: entry.completedAt
    };
    trimRecords();
  }
  if (status?.attempted || entry) saveData();
}

async function refreshDynamicRankings() {
  if (document.hidden || !app.apiAvailable) return;
  await refreshDailyLeaderboard();
  if (!$('leaderboardView').classList.contains('hidden')) await loadLeaderboard();
  const result = app.active?.result;
  if (result && result.mode !== 'replay') await refreshResultRanking(result);
}

async function refreshResultRanking(result) {
  try {
    const board = result.mode === 'daily'
      ? app.dailyLeaderboard
      : await SchulteApi.leaderboard({ mode: result.mode, size: result.mode === 'fifty' ? 5 : result.stages[0].size, timeframe: 'today' });
    if (!board) return;
    result.globalTiers = {
      total: tierFromBenchmark(result.totalMs, board.benchmarks.total),
      stages: result.stages.map((stage, index) => tierFromBenchmark(stage.durationMs, board.benchmarks.stages[index]))
    };
    const me = board.entries.find((entry) => entry.isMe);
    if (me) {
      result.globalRank = me.rank;
      result.globalRankIsBest = result.mode !== 'daily';
    }
    renderResult(result, result.mode === 'daily', false);
  } catch (error) {
    console.warn('成绩颜色刷新失败', error);
  }
}

function currentDailyEntry() {
  return app.dailyLeaderboard?.entries?.find((entry) => entry.isMe) || null;
}

function tierFromBenchmark(value, benchmark) {
  if (!benchmark) return 'normal';
  if (benchmark.overallFastestMs != null && value <= benchmark.overallFastestMs) return 'overall-fastest';
  if (benchmark.todayFastestMs != null && value <= benchmark.todayFastestMs) return 'today-fastest';
  if (benchmark.todayMedianMs != null && value > benchmark.todayMedianMs * 1.1) return 'slower';
  return 'normal';
}

function tierLabel(tier) {
  if (tier === 'overall-fastest') return '整体最速 · RECORD';
  if (tier === 'today-fastest' || tier === 'fastest') return '今日最快 · FASTEST';
  if (tier === 'slower') return '偏慢 · OFF PACE';
  return '正常 · SOLID';
}

function renderHomeDynamicRanking() {
  if (!$('homeView').classList.contains('hidden')) {
    renderHome();
    return;
  }
  const record = app.data.records[app.date];
  if (!record) return;
  const tier = recordTier(record);
  $('dailyTier').textContent = tierLabel(tier);
  $('dailyTier').className = `status-tag tier-tag tier-${tier}`;
  renderDailyLap(record);
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
  showConfirm('清除当前用户的本地记录？', '本地历史、连续天数、未完成进度和偏好设置都会被删除。服务器上的用户、今日挑战机会和排行榜成绩不会被删除。', '确认清除', () => {
    app.data = defaultData();
    app.active = null;
    saveData();
    applySettings();
    closeModal('settingsModal');
    renderHome();
    toast('当前用户的本地记录已清除');
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
  const isReplay = result.mode === 'replay';
  const [, month, day] = result.date.split('-').map(Number);
  const heading = isDaily
    ? `${month}月 ${day} - 每日方格 #${result.levelId}`
    : isReplay
      ? `${month}月 ${day} - 每日方格 · 复战`
      : `${month}月 ${day} - 每日方格 · ${INFINITE_MODES[result.mode]?.label || '无限模式'}`;
  const lines = ['https://game.introl.me', heading];
  result.stages.forEach((stage, index) => {
    const average = stageAverageMs(result, index);
    const errorText = stage.errors === 0 ? '零错误' : `${stage.errors} 次错误`;
    const shareStageName = stageDisplayName(stage).replace('×', 'x');
    const marker = isReplay ? ' *' : '';
    const averageText = isReplay ? '' : ` (平均 ${formatDuration(average)})`;
    lines.push(`${shareStageName}: ⭐ ${errorText} ⏱️ ${formatDuration(stage.durationMs)}${averageText}${marker}`);
  });
  lines.push(`总计: ⏱️ ${formatDuration(result.totalMs)} · 错误 ${result.totalErrors} 次${isDaily ? ` · 连续 ${calculateStreak()} 天` : ''}`);
  if (!isDaily && !isReplay) {
    const best = bestResultFor(result) || result;
    lines.push(`最快记录 (${infiniteResultName(result)}): 🏆 ${formatDuration(best.totalMs)}`);
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
  if (force || $('timerLabel')) $('timerLabel').textContent = formatDuration(elapsed);
  $('hudTimer').textContent = formatDuration(elapsed);
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
  if (app.active.mode !== 'daily') {
    app.data.active = null;
    saveData();
    return;
  }
  app.data.active = app.active;
  saveData();
}

function showUpdateLogOnce() {
  try {
    if (localStorage.getItem(UPDATE_LOG_KEY)) return;
    localStorage.setItem(UPDATE_LOG_KEY, new Date().toISOString());
  } catch { /* Storage-disabled browsers may see the notice again after reload. */ }
  openModal('updateModal');
}

function loadData(userId = null) {
  try {
    const parsed = JSON.parse(localStorage.getItem(dataStorageKey(userId)) || 'null');
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
    localStorage.setItem(dataStorageKey(app.currentUser?.id || null), JSON.stringify(app.data));
    app.storageAvailable = true;
  } catch {
    app.storageAvailable = false;
  }
}

function dataStorageKey(userId) {
  return userId ? `${STORAGE_KEY}:user:${userId}` : STORAGE_KEY;
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
  document.documentElement.classList.toggle('scroll-locked', id === 'gameView');
}

function openModal(id) {
  const modal = $(id);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(id) {
  if (id === 'userModal' && !app.currentUser) return;
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

function formatDuration(milliseconds) {
  const totalMilliseconds = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(totalMilliseconds / 60000);
  const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
  const millisecondsPart = totalMilliseconds % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millisecondsPart).padStart(3, '0')}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function updateHudStars(completedStages, totalStages = activeLevel()?.stages.length || app.level?.stages.length || 3) {
  const count = totalStages;
  $('hudStars').innerHTML = Array.from({ length: count }, (_, index) =>
    index < completedStages ? '<span class="lit">★</span>' : '<span>☆</span>'
  ).join(' ');
}
