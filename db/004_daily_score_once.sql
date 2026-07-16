-- Daily challenge records every completed run; retain a non-unique lookup index.
DROP INDEX IF EXISTS scores_daily_user_date_once_idx;
CREATE INDEX IF NOT EXISTS scores_daily_user_date_idx
  ON scores(user_id, score_date)
  WHERE mode = 'daily';
