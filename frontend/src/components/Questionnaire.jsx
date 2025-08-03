import React, { useState, useEffect } from 'react';

export default function Questionnaire() {
  const [email, setEmail]       = useState('');
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer]     = useState('');
  const [done, setDone]         = useState(false);

  // Prompt for email on first render
  useEffect(() => {
    const user = prompt('Enter your email to begin:');
    if (user) setEmail(user);
  }, []);

  // Whenever email is set, fetch the first question
  useEffect(() => {
    if (!email) return;
    fetchNext();
  }, [email]);

  const fetchNext = async () => {
    const res  = await fetch(`/api/questions/next?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (data.completed) {
      setDone(true);
    } else {
      setQuestion(data);
      setAnswer('');
    }
  };

  const handleSubmit = async () => {
    if (!answer.trim()) return alert('Please enter an answer.');
    await fetch('/api/answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        questionId: question.id,
        answer: answer.trim()
      })
    });
    fetchNext();
  };

  if (!email) return <p>Please reload and enter your email to start.</p>;
  if (done)   return <h2>🎉 You’ve completed the questionnaire!</h2>;
  if (!question) return <p>Loading…</p>;

  return (
    <div style={{ margin: '2rem', textAlign: 'center' }}>
      <p style={{ fontSize: '1.2rem' }}>{question.text}</p>
      <textarea
        rows="4"
        style={{ width: '100%', maxWidth: '500px' }}
        value={answer}
        onChange={e => setAnswer(e.target.value)}
      />
      <br/>
      <button onClick={handleSubmit} style={{ marginTop: '1rem' }}>
        Next
      </button>
    </div>
  );
}
