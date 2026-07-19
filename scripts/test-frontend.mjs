import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const storage = new Map();
const elements = {
  grid: {
    contains: (element) => Boolean(element?.inGrid)
  },
  leaderboardSize: { value: '3', disabled: false },
  leaderboardTimeframe: { value: 'today', disabled: false }
};
const localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};
const context = vm.createContext({
  console,
  document: {
    addEventListener() {},
    getElementById(id) { return elements[id] || null; },
    querySelectorAll() { return []; },
    hidden: false
  },
  localStorage,
  navigator: {},
  window: {
    matchMedia: () => ({ matches: false }),
    setInterval() {},
    clearTimeout() {},
    setTimeout() {}
  },
  setInterval() {},
  clearInterval() {},
  setTimeout() {},
  clearTimeout() {},
  requestAnimationFrame() { return 1; },
  cancelAnimationFrame() {},
  Blob,
  URL,
  Intl,
  Date,
  Math
});

const source = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
vm.runInContext(source, context);

const legacy = {
  seenGuide: true,
  records: { '2026-07-15': { date: '2026-07-15', totalMs: 50000, stages: [] } },
  bestRecords: { 'classic:5': { totalMs: 30000 } },
  settings: { sound: false }
};
localStorage.setItem('schulte-daily-v1:user:user-1', JSON.stringify(legacy));
const migrated = vm.runInContext("loadData('user-1')", context);
assert.equal(migrated.seenGuide, true);
assert.equal(migrated.records['2026-07-15'].totalMs, 50000);
assert.equal(migrated.bestRecords['classic:5'].totalMs, 30000);
assert.equal(migrated.settings.sound, false);
assert.ok(localStorage.getItem('schulte-daily-v2:user:user-1'));

const averages = vm.runInContext(`(() => {
  const classic5a = { mode: 'classic', totalMs: 30000, stages: [{ type: 'classic', size: 5, durationMs: 30000 }] };
  const classic5b = { mode: 'classic', totalMs: 50000, stages: [{ type: 'classic', size: 5, durationMs: 50000 }] };
  const classic3 = { mode: 'classic', totalMs: 7000, stages: [{ type: 'classic', size: 3, durationMs: 7000 }] };
  const easy5 = { mode: 'easy', totalMs: 9000, stages: [{ type: 'simple', size: 5, durationMs: 9000 }] };
  app.data.infiniteHistory = {
    'classic:5': [classic5a, classic5b],
    'classic:3': [classic3],
    'easy:5': [easy5]
  };
  return {
    key: infiniteHistoryKey(classic5a),
    stage: stageAverageMs(classic5a, 0),
    total: averageOfHistory(infiniteHistoryFor(classic5a))
  };
})()`, context);
assert.deepEqual({ ...averages }, { key: 'classic:5', stage: 40000, total: 40000 });

const dailyAverage = vm.runInContext(`(() => {
  app.date = '2026-07-16';
  app.data.records = {
    '2026-07-15': { date: '2026-07-15', mode: 'daily', stages: [{ type: 'classic', size: 3, durationMs: 10000 }] },
    '2026-07-16': { date: '2026-07-16', mode: 'daily', stages: [{ type: 'classic', size: 3, durationMs: 20000 }] }
  };
  return {
    average: stageAverageMs(app.data.records['2026-07-16'], 0),
    label: startButtonLabel()
  };
})()`, context);
assert.equal(dailyAverage.average, 15000);
assert.match(dailyAverage.label, /再次挑战/);

const leaderboardControls = vm.runInContext(`(() => {
  app.leaderboardMode = 'daily';
  app.leaderboardTimeframe = 'all';
  renderLeaderboardControls();
  const daily = {
    value: $('leaderboardTimeframe').value,
    disabled: $('leaderboardTimeframe').disabled
  };
  app.leaderboardMode = 'replay';
  renderLeaderboardControls();
  const replay = {
    value: $('leaderboardTimeframe').value,
    disabled: $('leaderboardTimeframe').disabled
  };
  return { daily, replay };
})()`, context);
assert.deepEqual(
  JSON.parse(JSON.stringify(leaderboardControls)),
  {
    daily: { value: 'all', disabled: false },
    replay: { value: 'today', disabled: true }
  }
);

const pointerInput = vm.runInContext(`(() => {
  const values = [];
  const originalHandleCell = handleCell;
  handleCell = (_button, value) => values.push(value);
  const makeButton = (value) => ({
    inGrid: true,
    disabled: false,
    dataset: { value: String(value) },
    closest: () => null
  });
  const first = makeButton(1);
  const second = makeButton(2);
  first.closest = () => first;
  second.closest = () => second;
  let prevented = 0;
  handleGridPointerDown({ pointerId: 11, pointerType: 'touch', button: 0, target: first, preventDefault: () => prevented += 1 });
  handleGridPointerDown({ pointerId: 12, pointerType: 'touch', button: 0, target: second, preventDefault: () => prevented += 1 });
  const disabled = makeButton(3);
  disabled.disabled = true;
  disabled.closest = () => disabled;
  handleGridPointerDown({ pointerId: 13, pointerType: 'touch', button: 0, target: disabled, preventDefault: () => prevented += 1 });
  window.PointerEvent = function PointerEvent() {};
  const keyboard = makeButton(4);
  keyboard.closest = () => keyboard;
  handleGridClick({ detail: 1, target: keyboard });
  handleGridClick({ detail: 0, target: keyboard });
  delete window.PointerEvent;
  handleCell = originalHandleCell;
  return { values, prevented };
})()`, context);
assert.deepEqual(JSON.parse(JSON.stringify(pointerInput)), { values: [1, 2, 4], prevented: 3 });

console.log('Frontend storage, score statistics, and multi-pointer input tests passed.');
