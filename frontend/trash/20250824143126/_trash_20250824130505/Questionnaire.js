import React, { useState, useEffect } from 'react';
import api from '../api/api';
import Question from './Question';

export default function Questionnaire() {
  const [q, setQ] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchNext();
  }, []);

  async function fetchNext() {
    const res = await api.get('/questions/next');
    if (res.data.completed) setDone(true);
    else setQ(res.data);
  }

  async function submit(ans) {
    await api.post('/answers', {
      email: '',         // optionally track user email in state
      questionId: q.id,
      answer: ans
    });
    fetchNext();
  }

  if (done) return <p>You’re all done—thank you! 🙏</p>;
  if (!q) return <p>Loading…</p>;
  return <Question question={q} onSubmit={submit} />;
}
