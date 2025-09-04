import React from 'react';

// Define a basic type for the props to satisfy the import
interface Props {
  question: { id: number; text: string; };
  questionNumber: number;
  answer: string;
  onAnswerChange: (value: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  // Add other props as needed with placeholder types
  [key: string]: any; 
}

export default function QuestionCard({ question, questionNumber, answer, onAnswerChange, onNext, onPrevious }: Props) {
  return (
    <div style={{ padding: '2rem', border: '1px solid white', borderRadius: '8px', color: 'white' }}>
      <h3>Question {questionNumber}</h3>
      <p>{question.text}</p>
      <textarea
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        rows={5}
        style={{ width: '100%', color: 'black' }}
      />
      <div style={{ marginTop: '1rem' }}>
        <button onClick={onPrevious}>Previous</button>
        <button onClick={onNext} style={{ marginLeft: '1rem' }}>Next</button>
      </div>
    </div>
  );
}
