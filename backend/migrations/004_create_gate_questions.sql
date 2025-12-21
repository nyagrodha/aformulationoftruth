-- Migration: Create gate questions tables
-- Purpose: Add introductory "gate" questions before main Proust questionnaire
-- Date: 2025-12-21

-- Gate questions table
CREATE TABLE IF NOT EXISTS gate_questions (
    id INTEGER PRIMARY KEY,
    question_text TEXT NOT NULL,
    question_order INTEGER NOT NULL UNIQUE,
    required BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Gate answers table
CREATE TABLE IF NOT EXISTS gate_answers (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES gate_questions(id),
    answer TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, question_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_gate_answers_user_id ON gate_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_gate_answers_question_id ON gate_answers(question_id);

-- Insert the four gate questions from production
INSERT INTO gate_questions (id, question_text, question_order, required) VALUES
(1, 'What pattern have you been chasing that might not exist?', 1, true),
(2, 'Where in your personal life do you feel the second law of thermodynamics most? Where do you feel it in your professional life?', 2, true),
(3, 'Which lie do you tell most convincingly?', 3, true),
(4, 'How old were you when you first suspected that coincidence might not be coincidental? (describe the moment.)', 4, false)
ON CONFLICT (id) DO NOTHING;

-- Add updated_at trigger for gate_answers
CREATE OR REPLACE FUNCTION update_gate_answers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gate_answers_updated_at
    BEFORE UPDATE ON gate_answers
    FOR EACH ROW
    EXECUTE FUNCTION update_gate_answers_updated_at();
