import { getSql } from './db.mjs';
import { HttpError } from './http.mjs';
import { shanghaiDate } from './time.mjs';

export async function getLeaderboard({ mode, gridSize = null, timeframe = 'today', userId = null }) {
  if (!['daily', 'easy', 'classic', 'fifty'].includes(mode)) throw new HttpError(400, 'INVALID_MODE', '排行榜玩法无效');
  if (!['today', 'all'].includes(timeframe)) throw new HttpError(400, 'INVALID_TIMEFRAME', '排行榜时间范围无效');
  const size = mode === 'daily' ? null : mode === 'fifty' ? 5 : Number(gridSize);
  if ((mode === 'easy' || mode === 'classic') && ![3, 4, 5, 6].includes(size)) {
    throw new HttpError(400, 'INVALID_SIZE', '排行榜方格规格无效');
  }
  const today = shanghaiDate();
  const sql = getSql();
  const [entries, benchmarks, dailyStatus, participantCount] = await Promise.all([
    mode === 'daily' ? dailyEntries(sql, today, userId) : infiniteEntries(sql, mode, size, timeframe, today, userId),
    loadBenchmarks(sql, mode, size, today),
    mode === 'daily' && userId ? loadDailyStatus(sql, today, userId) : null,
    loadParticipantCount(sql, mode, size, timeframe, today)
  ]);
  return {
    mode,
    gridSize: size,
    timeframe: mode === 'daily' ? 'today' : timeframe,
    date: today,
    entries: entries.map((entry) => serializeEntry(entry, benchmarks, userId)),
    benchmarks,
    dailyStatus,
    participantCount
  };
}

async function loadParticipantCount(sql, mode, size, timeframe, date) {
  if (mode === 'daily') {
    const [row] = await sql`SELECT count(*)::int AS total FROM scores WHERE mode = 'daily' AND score_date = ${date}`;
    return Number(row?.total || 0);
  }
  if (timeframe === 'today') {
    const [row] = await sql`
      SELECT count(DISTINCT user_id)::int AS total FROM scores
      WHERE mode = ${mode} AND grid_size = ${size} AND score_date = ${date}
    `;
    return Number(row?.total || 0);
  }
  const [row] = await sql`
    SELECT count(DISTINCT user_id)::int AS total FROM scores
    WHERE mode = ${mode} AND grid_size = ${size}
  `;
  return Number(row?.total || 0);
}

async function loadDailyStatus(sql, date, userId) {
  const rows = await sql`
    SELECT started_at, finished_at FROM game_runs
    WHERE mode = 'daily' AND run_date = ${date} AND user_id = ${userId}
    LIMIT 1
  `;
  if (!rows.length) return { attempted: false, completed: false, startedAt: null };
  return { attempted: true, completed: Boolean(rows[0].finished_at), startedAt: rows[0].started_at };
}

async function dailyEntries(sql, date, userId) {
  return sql`
    WITH ordered AS (
      SELECT s.id, s.user_id, u.display_name AS username, s.total_ms, s.total_errors, s.stages, s.completed_at,
        row_number() OVER (ORDER BY s.total_ms, s.total_errors, s.completed_at) AS rank
      FROM scores s
      JOIN users u ON u.id = s.user_id
      WHERE s.mode = 'daily' AND s.score_date = ${date}
    )
    SELECT * FROM ordered
    WHERE rank <= 50 OR user_id = ${userId}
    ORDER BY rank
  `;
}

async function infiniteEntries(sql, mode, size, timeframe, date, userId) {
  if (timeframe === 'today') {
    return sql`
      WITH personal_best AS (
        SELECT DISTINCT ON (s.user_id)
          s.id, s.user_id, u.display_name AS username, s.total_ms, s.total_errors, s.stages, s.completed_at
        FROM scores s
        JOIN users u ON u.id = s.user_id
        WHERE s.mode = ${mode} AND s.grid_size = ${size} AND s.score_date = ${date}
        ORDER BY s.user_id, s.total_ms, s.total_errors, s.completed_at
      ), ordered AS (
        SELECT *, row_number() OVER (ORDER BY total_ms, total_errors, completed_at) AS rank
        FROM personal_best
      )
      SELECT * FROM ordered
      WHERE rank <= 50 OR user_id = ${userId}
      ORDER BY rank
    `;
  }
  return sql`
    WITH personal_best AS (
      SELECT DISTINCT ON (s.user_id)
        s.id, s.user_id, u.display_name AS username, s.total_ms, s.total_errors, s.stages, s.completed_at
      FROM scores s
      JOIN users u ON u.id = s.user_id
      WHERE s.mode = ${mode} AND s.grid_size = ${size}
      ORDER BY s.user_id, s.total_ms, s.total_errors, s.completed_at
    ), ordered AS (
      SELECT *, row_number() OVER (ORDER BY total_ms, total_errors, completed_at) AS rank
      FROM personal_best
    )
    SELECT * FROM ordered
    WHERE rank <= 50 OR user_id = ${userId}
    ORDER BY rank
  `;
}

async function loadBenchmarks(sql, mode, size, date) {
  const [todayTotal, overallTotal, todayStages, overallStages] = await Promise.all([
    mode === 'daily'
      ? sql`
        SELECT min(total_ms)::int AS fastest, percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms)::int AS median
        FROM scores WHERE mode = 'daily' AND score_date = ${date}
      `
      : sql`
        SELECT min(total_ms)::int AS fastest, percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms)::int AS median
        FROM scores WHERE mode = ${mode} AND grid_size = ${size} AND score_date = ${date}
      `,
    mode === 'daily'
      ? sql`SELECT min(total_ms)::int AS fastest FROM scores WHERE mode = 'daily'`
      : sql`SELECT min(total_ms)::int AS fastest FROM scores WHERE mode = ${mode} AND grid_size = ${size}`,
    mode === 'daily'
      ? sql`
        SELECT ordinality::int - 1 AS stage_index,
          min((stage->>'durationMs')::int)::int AS fastest,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY (stage->>'durationMs')::int)::int AS median
        FROM scores s CROSS JOIN LATERAL jsonb_array_elements(s.stages) WITH ORDINALITY AS item(stage, ordinality)
        WHERE s.mode = 'daily' AND s.score_date = ${date}
        GROUP BY ordinality ORDER BY ordinality
      `
      : sql`
        SELECT ordinality::int - 1 AS stage_index,
          min((stage->>'durationMs')::int)::int AS fastest,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY (stage->>'durationMs')::int)::int AS median
        FROM scores s CROSS JOIN LATERAL jsonb_array_elements(s.stages) WITH ORDINALITY AS item(stage, ordinality)
        WHERE s.mode = ${mode} AND s.grid_size = ${size} AND s.score_date = ${date}
        GROUP BY ordinality ORDER BY ordinality
      `,
    mode === 'daily'
      ? sql`
        SELECT ordinality::int - 1 AS stage_index, min((stage->>'durationMs')::int)::int AS fastest
        FROM scores s CROSS JOIN LATERAL jsonb_array_elements(s.stages) WITH ORDINALITY AS item(stage, ordinality)
        WHERE s.mode = 'daily' GROUP BY ordinality ORDER BY ordinality
      `
      : sql`
        SELECT ordinality::int - 1 AS stage_index, min((stage->>'durationMs')::int)::int AS fastest
        FROM scores s CROSS JOIN LATERAL jsonb_array_elements(s.stages) WITH ORDINALITY AS item(stage, ordinality)
        WHERE s.mode = ${mode} AND s.grid_size = ${size} GROUP BY ordinality ORDER BY ordinality
      `
  ]);
  const stageIndexes = [...new Set([...todayStages, ...overallStages].map((row) => Number(row.stage_index)))].sort((a, b) => a - b);
  const stages = stageIndexes.map((stageIndex) => {
    const todayStage = todayStages.find((item) => Number(item.stage_index) === stageIndex);
    const overallStage = overallStages.find((item) => Number(item.stage_index) === stageIndex);
    return {
      todayFastestMs: numberOrNull(todayStage?.fastest),
      todayMedianMs: numberOrNull(todayStage?.median),
      overallFastestMs: numberOrNull(overallStage?.fastest)
    };
  });
  return {
    total: {
      todayFastestMs: numberOrNull(todayTotal[0]?.fastest),
      todayMedianMs: numberOrNull(todayTotal[0]?.median),
      overallFastestMs: numberOrNull(overallTotal[0]?.fastest)
    },
    stages
  };
}

function serializeEntry(entry, benchmarks, userId) {
  const stages = Array.isArray(entry.stages) ? entry.stages : JSON.parse(entry.stages || '[]');
  return {
    id: entry.id,
    rank: Number(entry.rank),
    username: entry.username,
    totalMs: Number(entry.total_ms),
    totalErrors: Number(entry.total_errors),
    completedAt: entry.completed_at,
    isMe: Boolean(userId && entry.user_id === userId),
    tier: tierFor(Number(entry.total_ms), benchmarks.total),
    stages: stages.map((stage, index) => ({ ...stage, tier: tierFor(Number(stage.durationMs), benchmarks.stages[index]) }))
  };
}

export function tierFor(value, benchmark) {
  if (!benchmark) return 'normal';
  if (benchmark.overallFastestMs != null && value <= benchmark.overallFastestMs) return 'overall-fastest';
  if (benchmark.todayFastestMs != null && value <= benchmark.todayFastestMs) return 'today-fastest';
  if (benchmark.todayMedianMs != null && value > benchmark.todayMedianMs * 1.1) return 'slower';
  return 'normal';
}

function numberOrNull(value) {
  return value == null ? null : Number(value);
}
