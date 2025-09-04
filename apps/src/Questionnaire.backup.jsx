// src/pages/Questionnaire.jsx
import { useEffect, useState } from 'react';

export default function Questionnaire() {
  const [session, setSession] = useState(null);
  const [state, setState] = useState({
    question: null,
    progress: { current: 0, total: 35 },
    responses: []
  });
  const [answer, setAnswer] = useState('');

  // get/create session
  useEffect(() => {
    (async () => {
      const r = await fetch('/api/questionnaire/session', { credentials: 'include' });
      if (!r.ok) return;
      setSession(await r.json());
    })();
  }, []);

  // fetch current question + progress
  useEffect(() => {
    if (!session?.id) return;
    (async () => {
      const r = await fetch(`/api/questionnaire/${session.id}/current`, { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json();
      setState(data);
      setAnswer(data.responses.find(x => x.questionId === data.question?.id)?.answer ?? '');
    })();
  }, [session?.id]);

  async function submitAnswer() {
    if (!session?.id || !state.question) return;
    const r = await fetch(`/api/questionnaire/${session.id}/answer`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: state.question.id, answer })
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      alert(err?.message || 'Failed to submit');
      return;
    }
    const cur = await fetch(`/api/questionnaire/${session.id}/current`, { credentials: 'include' });
    const data = await cur.json();
    setState(data);
    setAnswer(data.responses.find(x => x.questionId === data.question?.id)?.answer ?? '');
  }

  const { question, progress } = state;

  return (
    <div className="q-wrap">
      {/* === KEEP YOUR EXISTING INTRO BLOCK HERE, unchanged === */}
      <section id="intro" className="intro">
        {/* paste your current intro HTML exactly here */}
      </section>

      {question && (
        <section className="q-body">
          <div className="q-progress">Question {progress.current} of {progress.total}</div>
          <h2 className="q-title">{question.text}</h2>
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            rows={6}
            className="q-textarea"
            placeholder="Type your reflection…"
          />
          <div className="q-actions">
            <button onClick={submitAnswer} className="q-button">Save & Next</button>
          </div>
        </section>
      )}
    </div>
  );
}
