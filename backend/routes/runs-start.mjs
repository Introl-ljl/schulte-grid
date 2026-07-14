import { randomUUID } from 'node:crypto';
import { requireUser } from '../lib/auth.mjs';
import { getSql } from '../lib/db.mjs';
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from '../lib/http.mjs';
import { validateRunStart } from '../lib/scores.mjs';
import { shanghaiDate } from '../lib/time.mjs';

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const date = shanghaiDate();
    const run = validateRunStart(await readJson(request), date);
    const sql = getSql();
    if (run.mode === 'daily') {
      const existing = await sql`
        SELECT id, finished_at FROM game_runs
        WHERE user_id = ${user.id} AND mode = 'daily' AND run_date = ${date}
        LIMIT 1
      `;
      if (existing.length) {
        if (existing[0].finished_at) throw new HttpError(409, 'DAILY_COMPLETE', '你今天的正式每日挑战已经完成');
        throw new HttpError(409, 'DAILY_USED', '你今天的正式每日挑战已经开始，不能重新计时');
      }
    }
    const id = randomUUID();
    try {
      await sql`
        INSERT INTO game_runs (id, user_id, mode, grid_size, run_date, level_id, rules_version)
        VALUES (${id}, ${user.id}, ${run.mode}, ${run.gridSize}, ${date}, ${run.levelId}, ${run.rulesVersion})
      `;
    } catch (error) {
      if (error?.code === '23505' && run.mode === 'daily') throw new HttpError(409, 'DAILY_USED', '你今天的正式每日挑战机会已经使用');
      throw error;
    }
    return json({ runId: id, date }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

