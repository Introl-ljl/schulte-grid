-- Daily challenge may be replayed, but only the first completion is recorded.
CREATE UNIQUE INDEX IF NOT EXISTS scores_daily_user_date_once_idx
  ON scores(user_id, score_date)
  WHERE mode = 'daily';
