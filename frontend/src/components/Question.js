import React, { useState } from 'react';

export default function Question({ question, onSubmit }) {
  const [text, setText] = useState('');
  return (
    <div className="question">
      <p>{question.text}</p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={4}
      />
      <button onClick={() => onSubmit(text)}>Submit</button>
    </div>
  );
}
