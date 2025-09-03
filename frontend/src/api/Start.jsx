import React, { useState } from "react";

function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

  async function start(e) {
    e.preventDefault();
    setStatus("Sending…");
    const res = await fetch("/api/auth/start", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ email })
    });
    setStatus(res.ok ? "Check your inbox for the magic link." : "Failed to send.");
  }

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Login</h1>
      <form onSubmit={start} style={{ marginTop: "1rem" }}>
        <input
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          style={{ padding: ".6rem", width: "22rem", maxWidth: "100%" }}
        />
        <button type="submit" style={{ marginLeft: ".5rem" }}>Send magic link</button>
      </form>
      <p>{status}</p>
    </main>
  );
}

export default Login;
