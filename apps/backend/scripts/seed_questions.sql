BEGIN TRANSACTION;

-- 1) Create the questions table if it doesn't exist
CREATE TABLE IF NOT EXISTS questions (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT    NOT NULL
);

-- 2) (Optional) Clear out any old data
DELETE FROM questions;

-- 3) Insert the 35 Proust questions
INSERT INTO questions (text) VALUES
('What is your idea of perfect happiness?'),
('What is your greatest fear?'),
('What is your greatest extravagance?'),
('What is your current state of mind?'),
('What do you consider the most overrated virtue?'),
('On what occasion do you lie?'),
('What do you most dislike about your appearance?'),
('Which living person do you most admire?'),
('What is your greatest regret?'),
('What or who is the greatest love of your life?'),
('When and where were you happiest?'),
('Which talent would you most like to have?'),
('If you could change one thing about yourself, what would it be?'),
('What do you consider your greatest achievement?'),
('If you were to die and come back as a person or a thing, what would it be?'),
('Where would you most like to live?'),
('What is your most treasured possession?'),
('What do you regard as the lowest depth of misery?'),
('What is your favorite occupation?'),
('What is your most marked characteristic?'),
('What do you most value in your friends?'),
('Who are your favorite writers?'),
('Which historical figure do you most identify with?'),
('Who is your hero of fiction?'),
('Which woman do you most admire?'),
('What is your greatest fear?'),
('What is the quality you most like in a man?'),
('What is the quality you most like in a woman?'),
('Which words or phrases do you most overuse?'),
('What or who is the greatest love of your life?'),
('When and where were you happiest?'),
('Which talent would you most like to have?'),
('If you could change one thing about yourself, what would it be?'),
('What do you consider your greatest achievement?'),
('Where would you most like to live?');
  
COMMIT;
