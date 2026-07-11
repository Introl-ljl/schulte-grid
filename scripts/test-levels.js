const assert = require('assert');
const { SIZES, addDays, createLevel, passesQuality } = require('./daily-levels');

const dates = Array.from({ length: 30 }, (_, offset) => addDays('2026-07-10', offset));
for (const date of dates) {
  const level = createLevel(date);
  assert.deepStrictEqual(level, createLevel(date));
  assert.strictEqual(level.stages.length, SIZES.length + 1);
  for (const stage of level.stages.slice(0, SIZES.length)) {
    assert.strictEqual(stage.type, 'classic');
    const expected = Array.from({ length: stage.size ** 2 }, (_, index) => index + 1);
    assert.deepStrictEqual([...stage.layout].sort((a, b) => a - b), expected);
    assert.ok(passesQuality(stage.layout, stage.size));
  }
  const fifty = level.stages.at(-1);
  assert.strictEqual(fifty.type, 'fifty');
  assert.strictEqual(fifty.size, 5);
  assert.deepStrictEqual([...fifty.layout].sort((a, b) => a - b), Array.from({ length: 25 }, (_, index) => index + 1));
  assert.deepStrictEqual([...fifty.hiddenLayout].sort((a, b) => a - b), Array.from({ length: 25 }, (_, index) => index + 26));
  assert.ok(passesQuality(fifty.layout, fifty.size));
  assert.ok(passesQuality(fifty.hiddenLayout.map((value) => value - 25), fifty.size));
}
assert.notDeepStrictEqual(createLevel(dates[0]), createLevel(dates[1]));
console.log('Daily level generator tests passed');
