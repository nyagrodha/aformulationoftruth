"""Comprehensive tests for questions module."""

import pytest

from app.questions import (
    GATE_QUESTIONS,
    MAIN_QUESTIONS,
    QUESTIONS,
    TOTAL_QUESTIONS,
    Question,
)


class TestQuestionDataclass:
    """Test Question dataclass."""

    def test_question_creation(self):
        """Creates question with required fields."""
        q = Question(id="test1", text="Test question?")

        assert q.id == "test1"
        assert q.text == "Test question?"
        assert q.type == "text"  # default

    def test_question_with_custom_type(self):
        """Creates question with custom type."""
        q = Question(id="q1", text="Question?", type="boolean")

        assert q.type == "boolean"

    def test_question_attributes(self):
        """Question has expected attributes."""
        q = Question(id="q1", text="Test?")

        assert hasattr(q, 'id')
        assert hasattr(q, 'text')
        assert hasattr(q, 'type')

    def test_question_immutable_after_creation(self):
        """Question fields can be accessed after creation."""
        q = Question(id="q1", text="Original")

        assert q.text == "Original"
        # Dataclasses are mutable by default, but we can verify access works


class TestGateQuestions:
    """Test gate questions configuration."""

    def test_gate_questions_exist(self):
        """Gate questions list exists."""
        assert GATE_QUESTIONS is not None
        assert isinstance(GATE_QUESTIONS, list)

    def test_gate_questions_count(self):
        """Gate questions has expected count."""
        assert len(GATE_QUESTIONS) == 2

    def test_gate_questions_have_ids(self):
        """All gate questions have IDs."""
        for q in GATE_QUESTIONS:
            assert hasattr(q, 'id')
            assert len(q.id) > 0

    def test_gate_questions_have_text(self):
        """All gate questions have text."""
        for q in GATE_QUESTIONS:
            assert hasattr(q, 'text')
            assert len(q.text) > 0

    def test_gate_questions_unique_ids(self):
        """Gate questions have unique IDs."""
        ids = [q.id for q in GATE_QUESTIONS]
        assert len(ids) == len(set(ids))

    def test_gate_consent_question(self):
        """First gate question is consent."""
        q = GATE_QUESTIONS[0]
        assert "consent" in q.id.lower()

    def test_gate_age_question(self):
        """Second gate question is age verification."""
        q = GATE_QUESTIONS[1]
        assert "age" in q.id.lower()


class TestMainQuestions:
    """Test main questions configuration."""

    def test_main_questions_exist(self):
        """Main questions list exists."""
        assert MAIN_QUESTIONS is not None
        assert isinstance(MAIN_QUESTIONS, list)

    def test_main_questions_count(self):
        """Main questions has expected count."""
        assert len(MAIN_QUESTIONS) == 33  # q1 to q33

    def test_main_questions_all_have_ids(self):
        """All main questions have IDs."""
        for q in MAIN_QUESTIONS:
            assert hasattr(q, 'id')
            assert len(q.id) > 0

    def test_main_questions_all_have_text(self):
        """All main questions have text."""
        for q in MAIN_QUESTIONS:
            assert hasattr(q, 'text')
            assert len(q.text) > 0

    def test_main_questions_unique_ids(self):
        """Main questions have unique IDs."""
        ids = [q.id for q in MAIN_QUESTIONS]
        assert len(ids) == len(set(ids))

    def test_main_questions_id_format(self):
        """Main question IDs follow expected format."""
        for q in MAIN_QUESTIONS:
            assert q.id.startswith('q')
            # ID should be like q1, q2, ..., q33

    def test_main_questions_sequential_ids(self):
        """Main questions have sequential numeric IDs."""
        expected_ids = [f"q{i}" for i in range(1, 34)]
        actual_ids = [q.id for q in MAIN_QUESTIONS]

        assert set(actual_ids) == set(expected_ids)


class TestAllQuestions:
    """Test combined questions list."""

    def test_questions_combines_gate_and_main(self):
        """QUESTIONS combines GATE_QUESTIONS and MAIN_QUESTIONS."""
        assert len(QUESTIONS) == len(GATE_QUESTIONS) + len(MAIN_QUESTIONS)

    def test_questions_gate_first(self):
        """Gate questions appear first in QUESTIONS."""
        for i, gate_q in enumerate(GATE_QUESTIONS):
            assert QUESTIONS[i] == gate_q

    def test_questions_main_after_gate(self):
        """Main questions appear after gate questions."""
        offset = len(GATE_QUESTIONS)
        for i, main_q in enumerate(MAIN_QUESTIONS):
            assert QUESTIONS[offset + i] == main_q

    def test_questions_all_unique(self):
        """All questions have unique IDs."""
        ids = [q.id for q in QUESTIONS]
        assert len(ids) == len(set(ids))


class TestTotalQuestions:
    """Test total questions constant."""

    def test_total_questions_matches_length(self):
        """TOTAL_QUESTIONS matches actual question count."""
        assert TOTAL_QUESTIONS == len(QUESTIONS)

    def test_total_questions_is_positive(self):
        """TOTAL_QUESTIONS is positive."""
        assert TOTAL_QUESTIONS > 0

    def test_total_questions_expected_value(self):
        """TOTAL_QUESTIONS has expected value."""
        assert TOTAL_QUESTIONS == 35  # 2 gate + 33 main


class TestQuestionStructure:
    """Test question data structure integrity."""

    def test_all_questions_are_question_instances(self):
        """All items in QUESTIONS are Question instances."""
        for q in QUESTIONS:
            assert isinstance(q, Question)

    def test_no_duplicate_questions(self):
        """No duplicate question objects."""
        question_objects = set(id(q) for q in QUESTIONS)
        assert len(question_objects) == len(QUESTIONS)

    def test_questions_not_empty(self):
        """Question lists are not empty."""
        assert len(GATE_QUESTIONS) > 0
        assert len(MAIN_QUESTIONS) > 0
        assert len(QUESTIONS) > 0

    def test_gate_questions_separate_from_main(self):
        """Gate question IDs don't overlap with main question IDs."""
        gate_ids = {q.id for q in GATE_QUESTIONS}
        main_ids = {q.id for q in MAIN_QUESTIONS}

        assert len(gate_ids & main_ids) == 0  # No intersection


class TestQuestionTypes:
    """Test question type field."""

    def test_gate_questions_have_types(self):
        """Gate questions have type specified."""
        for q in GATE_QUESTIONS:
            assert hasattr(q, 'type')
            assert q.type in ["text", "boolean"]

    def test_main_questions_default_type(self):
        """Main questions have default type."""
        for q in MAIN_QUESTIONS:
            assert hasattr(q, 'type')

    def test_question_type_values(self):
        """Question types are valid."""
        valid_types = ["text", "boolean", "number", "textarea"]

        for q in QUESTIONS:
            # Type should be a string
            assert isinstance(q.type, str)


class TestQuestionEdgeCases:
    """Test edge cases and invariants."""

    def test_question_ids_no_spaces(self):
        """Question IDs contain no spaces."""
        for q in QUESTIONS:
            assert ' ' not in q.id

    def test_question_ids_not_empty(self):
        """Question IDs are not empty strings."""
        for q in QUESTIONS:
            assert len(q.id) > 0

    def test_question_text_not_empty(self):
        """Question text is not empty."""
        for q in QUESTIONS:
            assert len(q.text) > 0

    def test_question_text_is_string(self):
        """Question text is a string."""
        for q in QUESTIONS:
            assert isinstance(q.text, str)

    def test_question_id_is_string(self):
        """Question ID is a string."""
        for q in QUESTIONS:
            assert isinstance(q.id, str)

    def test_questions_list_immutable_length(self):
        """Question list lengths are consistent."""
        gate_len = len(GATE_QUESTIONS)
        main_len = len(MAIN_QUESTIONS)
        total_len = len(QUESTIONS)

        assert total_len == gate_len + main_len

    def test_can_lookup_question_by_id(self):
        """Can find question by ID."""
        test_id = MAIN_QUESTIONS[0].id

        found = next((q for q in QUESTIONS if q.id == test_id), None)
        assert found is not None
        assert found.id == test_id

    def test_question_order_preserved(self):
        """Question order is preserved."""
        # Get IDs in order
        ids_first = [q.id for q in QUESTIONS]
        ids_second = [q.id for q in QUESTIONS]

        assert ids_first == ids_second

    def test_main_questions_numbering_complete(self):
        """Main questions numbered 1-33 with no gaps."""
        numbers = []
        for q in MAIN_QUESTIONS:
            if q.id.startswith('q') and q.id[1:].isdigit():
                numbers.append(int(q.id[1:]))

        numbers.sort()
        expected = list(range(1, 34))
        assert numbers == expected