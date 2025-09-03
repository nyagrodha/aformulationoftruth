import React, { useEffect, useState } from "react";

export default function Questionnaire() {
  const [user, setUser] = useState(undefined); // undefined=loading, null=anon, {...}=authed
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(null);
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => setUser(d.user ?? null)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/questions").then(r => r.json()).then(d => {
      const list = d.questions || [];
      setQuestions(list);
      setCurrent(list[0] || null);
    });
  }, [user]);

  if (user === undefined) return <main style={{padding:"2rem"}}>Loading your session…</main>;
  if (user === null) { window.location.href = "/login"; return null; }

  async function submit() {
    if (!current) return;
    const res = await fetch("/api/questions/answer", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ id: current.id, answer })
    });
    if (res.ok) {
      const idx = questions.findIndex(q => q.id === current.id);
      const next = questions[idx + 1];
      setAnswer("");
      setCurrent(next || null);
    } else {
      alert("Failed to submit answer.");
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>Questionnaire</h1>
      <p>Welcome, <strong>{user.email}</strong>.</p>

      {!current ? (
        <div style={{marginTop:"1rem"}}>All done. Thank you.</div>
      ) : (
        <section style={{marginTop:"1rem"}}>
          <h3>Question {current.id}</h3>
          <p style={{opacity:.9}}>{current.text || current.prompt || current.title || "(no text)"}</p>
          <textarea
            value={answer}
            onChange={(e)=>setAnswer(e.target.value)}
            rows={6}
            style={{width:"100%",background:"#0b0b0b",color:"#eee",border:"1px solid #333",borderRadius:8,padding:"0.75rem"}}
          />
          <div style={{marginTop:"0.5rem"}}>
            <button onClick={submit} disabled={!answer.trim()}
              style={{border:"1px solid #0f0",background:"#111",color:"#0f0",borderRadius:8,padding:"0.5rem 0.9rem"}}>
              Save & Next
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
