import { ChangeEvent, useState } from 'react';

export interface QuestionData {
  id: number;
  text: string;
}

interface QuestionProps {
  question: QuestionData;
  onSubmit: (answer: string) => void;
}

export default function Question({ question, onSubmit }: QuestionProps): JSX.Element {
  const [text, setText] = useState<string>('');

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
  };

  const handleSubmit = () => {
    if (text.trim().length === 0) {
      return;
    }
    onSubmit(text);
    setText('');
  };

  return (
    <div className="question">
      <p>{question.text}</p>
      <textarea
        value={text}
        onChange={handleChange}
        rows={4}
      />
      <button type="button" onClick={handleSubmit}>Submit</button>
    </div>
  );
}
