-- Replay becomes a scored competitive mode with its own leaderboard.
-- Allow 'replay' in game_runs.mode and scores.mode CHECK constraints.
ALTER TABLE game_runs
  DROP CONSTRAINT IF EXISTS game_runs_mode_check;
ALTER TABLE game_runs
  ADD CONSTRAINT game_runs_mode_check CHECK (mode IN ('daily', 'replay', 'easy', 'classic', 'fifty'));

ALTER TABLE game_runs
  DROP CONSTRAINT IF EXISTS game_runs_check;
ALTER TABLE game_runs
  DROP CONSTRAINT IF EXISTS game_runs_grid_size_check;
ALTER TABLE game_runs
  ADD CONSTRAINT game_runs_grid_size_check CHECK (
    (mode IN ('daily', 'replay') AND grid_size IS NULL) OR
    (mode IN ('easy', 'classic') AND grid_size BETWEEN 3 AND 6) OR
    (mode = 'fifty' AND grid_size = 5)
  );

ALTER TABLE scores
  DROP CONSTRAINT IF EXISTS scores_mode_check;
ALTER TABLE scores
  ADD CONSTRAINT scores_mode_check CHECK (mode IN ('daily', 'replay', 'easy', 'classic', 'fifty'));

-- Replay shares daily's "today + overall benchmark, multi-entry per user" shape.
CREATE INDEX IF NOT EXISTS scores_replay_rank_idx
  ON scores(score_date, total_ms, total_errors, completed_at)
  WHERE mode = 'replay';
