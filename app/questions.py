"""Question definitions for the questionnaire."""

from dataclasses import dataclass


@dataclass
class Question:
    """A questionnaire question."""
    id: str
    text: str
    type: str = "text"


# Gate questions (asked first, in order)
GATE_QUESTIONS = [
    Question(
        id="gate_consent",
        text="Do you consent to participate in this questionnaire?",
        type="boolean"
    ),
    Question(
        id="gate_age",
        text="Are you 18 years of age or older?",
        type="boolean"
    ),
]

# Main questions (shuffled per session)
MAIN_QUESTIONS = [
    Question(id=f"q{i}", text=f"Question {i}")
    for i in range(1, 34)
]

QUESTIONS = GATE_QUESTIONS + MAIN_QUESTIONS
TOTAL_QUESTIONS = len(QUESTIONS)