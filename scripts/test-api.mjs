import assert from 'node:assert/strict';
import { normalizeUsername, usernameKey, validatePin } from '../backend/lib/auth.mjs';
import { tierFor } from '../backend/lib/leaderboard.mjs';
import { validateRunStart, validateScore } from '../backend/lib/scores.mjs';

assert.equal(normalizeUsername('  小明_07  '), '小明_07');
assert.equal(usernameKey('PlayerOne'), 'playerone');
assert.throws(() => normalizeUsername('小 明'), /用户名/);
assert.equal(validatePin('0427'), '0427');
assert.throws(() => validatePin('12345'), /4 位数字/);

const daily = validateRunStart({ mode: 'daily', levelId: '20260714', rulesVersion: 3 }, '2026-07-14');
assert.deepEqual(daily, { mode: 'daily', gridSize: null, levelId: '20260714', rulesVersion: 3 });
assert.throws(() => validateRunStart({ mode: 'replay', levelId: 'x', rulesVersion: 3 }, '2026-07-14'), /不能进入排行榜/);
assert.throws(() => validateRunStart({ mode: 'daily', levelId: '20260713', rulesVersion: 3 }, '2026-07-14'), /不是今天/);

const run = { mode: 'daily', grid_size: null, started_at: new Date(Date.now() - 60000).toISOString() };
const stages = [
  { type: 'classic', size: 3, durationMs: 1500, errors: 0 },
  { type: 'classic', size: 4, durationMs: 3500, errors: 1 },
  { type: 'classic', size: 5, durationMs: 6500, errors: 2 },
  { type: 'fifty', size: 5, durationMs: 12000, errors: 0 }
];
assert.deepEqual(validateScore({ totalMs: 23500, totalErrors: 3, stages }, run), { totalMs: 23500, totalErrors: 3, stages });
assert.throws(() => validateScore({ totalMs: 1, totalErrors: 3, stages }, run), /总成绩/);

const benchmark = { todayFastestMs: 11000, todayMedianMs: 15000, overallFastestMs: 9000 };
assert.equal(tierFor(9000, benchmark), 'overall-fastest');
assert.equal(tierFor(11000, benchmark), 'today-fastest');
assert.equal(tierFor(15000, benchmark), 'normal');
assert.equal(tierFor(17000, benchmark), 'slower');

console.log('API validation and ranking tier tests passed.');
