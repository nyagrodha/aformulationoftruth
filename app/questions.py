"""Questions module stub for testing."""

from typing import NamedTuple


class Question(NamedTuple):
    """Question data structure."""
    id: str
    tamil: str = ''
    translit: str = ''
    english: str = ''
    ref: str = ''


# Gate questions (consent/preliminary)
GATE_QUESTIONS = [
    Question(id='gate1', english='Do you consent to participate?'),
    Question(id='gate2', english='Are you over 18?'),
]

# Main questionnaire questions
MAIN_QUESTIONS = [Question(id=f'q{i}', english=f'Question {i}') for i in range(1, 34)]

# All questions
QUESTIONS = MAIN_QUESTIONS

# Total question count
TOTAL_QUESTIONS = len(GATE_QUESTIONS) + len(MAIN_QUESTIONS)