-- Keep the per-question interaction path index-backed as response history grows.
CREATE INDEX IF NOT EXISTS idx_questionnaire_sessions_user_completed_at
  ON questionnaire_sessions (user_id, completed, completed_at);

CREATE INDEX IF NOT EXISTS idx_responses_session_question
  ON responses (session_id, question_id);
