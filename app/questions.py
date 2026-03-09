"""Question definitions."""

from typing import NamedTuple


class Question(NamedTuple):
    """Question structure."""

    id: str
    text: str = ""


GATE_QUESTIONS = [
    Question(id="gate1", text="Gate question 1"),
    Question(id="gate2", text="Gate question 2"),
]

MAIN_QUESTIONS = [
    Question(id=f"q{i}", text=f"Question {i}") for i in range(1, 34)
]

QUESTIONS = MAIN_QUESTIONS

TOTAL_QUESTIONS = len(GATE_QUESTIONS) + len(MAIN_QUESTIONS)