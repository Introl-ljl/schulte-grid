import { currentUser } from '../lib/auth.mjs';
import { errorResponse, json } from '../lib/http.mjs';
import { getLeaderboard } from '../lib/leaderboard.mjs';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const user = await currentUser(request);
    const leaderboard = await getLeaderboard({
      mode: url.searchParams.get('mode') || 'daily',
      gridSize: url.searchParams.get('size'),
      timeframe: url.searchParams.get('timeframe') || 'today',
      userId: user?.id || null
    });
    return json(leaderboard);
  } catch (error) {
    return errorResponse(error);
  }
}

