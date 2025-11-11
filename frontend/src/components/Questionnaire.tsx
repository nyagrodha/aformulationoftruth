import { useState, useEffect } from 'react';
import api from '../api/api';
import Question, { QuestionData } from './Question';

interface NextQuestionResponse extends QuestionData {
  completed?: boolean;
}

interface AnswerPayload {
  email: string;
  questionId: number;
  answer: string;
}

export default function Questionnaire(): JSX.Element {
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [done, setDone] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    // Extract auth parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const email = urlParams.get('email');

    if (token && email) {
      setUserEmail(email);
      // Store in localStorage for persistence
      localStorage.setItem('token', token);
      localStorage.setItem('userEmail', email);
    } else {
      // Try to get from localStorage
      const storedToken = localStorage.getItem('token');
      const storedEmail = localStorage.getItem('userEmail');
      if (storedToken && storedEmail) {
        setUserEmail(storedEmail);
      }
    }

    void fetchNext();
  }, []);

  const fetchNext = async (): Promise<void> => {
    const response = await api.get<NextQuestionResponse>('/questions/next');
    if (response.data.completed) {
      setDone(true);
    } else {
      const { id, text } = response.data;
      setQuestion({ id, text });
    }
  };

  const submit = async (answer: string): Promise<void> => {
    if (!question) {
      return;
    }

    if (!userEmail) {
      console.warn('Attempted to submit answer without authenticated email');
      return;
    }

    const payload: AnswerPayload = {
      email: userEmail,
      questionId: question.id,
      answer,
    };

    await api.post('/answers', payload);
    await fetchNext();
  };

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h2>You're all done—thank you! 🙏</h2>
        <p>Your responses have been saved for {userEmail}</p>
      </div>
    );
  }

  if (!question) {
    return <p>Loading questionnaire…</p>;
  }

  return (
    <div>
      {userEmail && (
        <div style={{ textAlign: 'center', marginBottom: '2rem', padding: '1rem' }}>
          <h2>Welcome to the Questionnaire</h2>
          <p>Authenticated as: {userEmail}</p>
          <p>Answer each question thoughtfully. Your responses will be saved automatically.</p>
        </div>
      )}
      <Question question={question} onSubmit={submit} />
    </div>
  );
}
