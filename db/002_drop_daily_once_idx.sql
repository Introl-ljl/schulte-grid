DROP INDEX IF EXISTS game_runs_daily_once_idx;
CREATE INDEX IF NOT EXISTS game_runs_daily_user_date_idx ON game_runs(user_id, run_date) WHERE mode = 'daily';
