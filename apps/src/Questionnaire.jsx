// src/pages/Questionnaire.jsx
import { useEffect, useState, useCallback } from 'react';

export default function Questionnaire() {
  const [session, setSession] = useState(null);
  const [state, setState] = useState({
    question: null,
    progress: { current: 0, total: 35 },
    responses: [],
  });
  const [answer, setAnswer] = useState('');

  /* -------------------- utils -------------------- */
  const getCookie = (name) => {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[-.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  };
  const delCookie = (name) => {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  };

  // Best-effort client reset (clears likely local keys; safe even if unused)
  const hardResetClientState = useCallback(() => {
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (/a4m|proust|question|qstate|progress|qsession/i.test(k)) {
          localStorage.removeItem(k);
        }
      }
      // If you ever used IndexedDB, you can nuke it as well:
      // indexedDB.deleteDatabase('a4m_q_db');
    } catch {}
  }, []);

  // Try server-side reset if available; otherwise fall back to client-only
  const resetRun = useCallback(
    async (sessId) => {
      // 1) try server reset endpoint (ignore errors if not implemented)
      if (sessId) {
        try {
          const rr = await fetch(`/api/questionnaire/${sessId}/reset`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'email_login' }),
          });
          if (!rr.ok) {
            // ignore; we’ll still do a client reset below
          }
        } catch {
          // ignore network/server issues
        }
      }
      // 2) always clear client state
      hardResetClientState();

      // 3) clear the one-time cookie flag so we don’t loop
      delCookie('a4m_q_reset');

      // 4) optional: adjust URL to hint “first step”
      const url = new URL(window.location.href);
      url.searchParams.set('step', '1');
      window.history.replaceState(null, '', url.toString());
    },
    [hardResetClientState]
  );

  /* -------------------- session bootstrap -------------------- */
  // Create/get session
  useEffect(() => {
    (async () => {
      const r = await fetch('/api/questionnaire/session', { credentials: 'include' });
      if (!r.ok) return;
      setSession(await r.json());
    })();
  }, []);

  // If verify set a one-time reset cookie, enforce a fresh run
  useEffect(() => {
    if (!session?.id) return;
    const needsReset = getCookie('a4m_q_reset') === '1';
    if (needsReset) {
      (async () => {
        await resetRun(session.id);
        // after resetting, immediately refresh current state
        const cur = await fetch(`/api/questionnaire/${session.id}/current`, { credentials: 'include' });
        if (cur.ok) {
          const data = await cur.json();
          setState(data);
          setAnswer(data.responses.find(x => x.questionId === data.question?.id)?.answer ?? '');
        }
      })();
    }
  }, [session?.id, resetRun]);

  // Fetch current question + progress
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
      body: JSON.stringify({ questionId: state.question.id, answer }),
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

  // Start over button action
  const startOver = async () => {
    await resetRun(session?.id);
    if (session?.id) {
      const cur = await fetch(`/api/questionnaire/${session.id}/current`, { credentials: 'include' });
      if (cur.ok) {
        const data = await cur.json();
        setState(data);
        setAnswer(data.responses.find(x => x.questionId === data.question?.id)?.answer ?? '');
      }
    }
  };

  const { question, progress } = state;

  return (
    <div className="q-wrap">
      {/* === INTRO / TOOLBAR === */}
      <section id="intro" className="intro">
        {/* keep your existing intro content here */}
        <div className="q-toolbar" style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginTop: '.75rem' }}>
          <button onClick={startOver} className="q-button q-secondary" type="button" title="Start this questionnaire from the beginning">
            Start over
          </button>
        </div>
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
