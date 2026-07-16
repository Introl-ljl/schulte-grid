import assert from 'node:assert/strict';
import { normalizeUsername, usernameKey, validatePin } from '../backend/lib/auth.mjs';
import { LEADERBOARD_LIMIT, tierFor } from '../backend/lib/leaderboard.mjs';
import { validateRunStart, validateScore } from '../backend/lib/scores.mjs';

assert.equal(normalizeUsername('  小明_07  '), '小明_07');
assert.equal(usernameKey('PlayerOne'), 'playerone');
assert.throws(() => normalizeUsername('小 明'), /用户名/);
assert.equal(validatePin('0427'), '0427');
assert.throws(() => validatePin('12345'), /4 位数字/);

const daily = validateRunStart({ mode: 'daily', levelId: '20260714', rulesVersion: 3 }, '2026-07-14');
assert.deepEqual(daily, { mode: 'daily', gridSize: null, levelId: '20260714', rulesVersion: 3 });

// replay is now a scored competitive mode (mirrors daily's 4-stage structure).
const replay = validateRunStart({ mode: 'replay', levelId: '20260714-replay-abc', rulesVersion: 3 }, '2026-07-14');
assert.deepEqual(replay, { mode: 'replay', gridSize: null, levelId: '20260714-replay-abc', rulesVersion: 3 });

// Unknown modes are still rejected.
assert.throws(() => validateRunStart({ mode: 'disc', levelId: 'x', rulesVersion: 3 }, '2026-07-14'), /不能进入排行榜/);
assert.throws(() => validateRunStart({ mode: 'daily', levelId: '20260713', rulesVersion: 3 }, '2026-07-14'), /不是今天/);

const dailyRun = { mode: 'daily', grid_size: null, started_at: new Date(Date.now() - 60000).toISOString() };
const stages = [
  { type: 'classic', size: 3, durationMs: 1500, errors: 0 },
  { type: 'classic', size: 4, durationMs: 3500, errors: 1 },
  { type: 'classic', size: 5, durationMs: 6500, errors: 2 },
  { type: 'fifty', size: 5, durationMs: 12000, errors: 0 }
];
assert.deepEqual(validateScore({ totalMs: 23500, totalErrors: 3, stages }, dailyRun), { totalMs: 23500, totalErrors: 3, stages });
assert.throws(() => validateScore({ totalMs: 1, totalErrors: 3, stages }, dailyRun), /总成绩/);

// replay shares daily's 4-stage structure.
const replayRun = { mode: 'replay', grid_size: null, started_at: new Date(Date.now() - 60000).toISOString() };
assert.deepEqual(validateScore({ totalMs: 23500, totalErrors: 3, stages }, replayRun), { totalMs: 23500, totalErrors: 3, stages });

const benchmark = { todayFastestMs: 11000, todayMedianMs: 15000, overallFastestMs: 9000 };
assert.equal(tierFor(9000, benchmark), 'overall-fastest');
assert.equal(tierFor(11000, benchmark), 'today-fastest');
assert.equal(tierFor(15000, benchmark), 'normal');
assert.equal(tierFor(17000, benchmark), 'slower');
assert.equal(LEADERBOARD_LIMIT, 20);

console.log('API validation and ranking tier tests passed.');
