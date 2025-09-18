import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { Magic } from 'magic-sdk';

// Minimal Magic gate: if no session cookie, show login to request DID
function LoginGate() {
  const [loggedIn, setLoggedIn] = React.useState(false);
  const [email, setEmail] = React.useState('');

  React.useEffect(() => {
    // check session via /api/user/me
    fetch('/api/user/me').then(async (r) => {
      setLoggedIn(r.ok);
    }).catch(() => setLoggedIn(false));
  }, []);

  async function login(e) {
    e.preventDefault();
    const magic = new Magic(process.env.REACT_APP_MAGIC_PUBLISHABLE_KEY);
    const didToken = await magic.auth.loginWithEmailOTP({ email });
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ didToken })
    });
    if (res.ok) setLoggedIn(true);
  }

  if (!loggedIn) {
    return (
      <div style={{ maxWidth: 400, margin: '10vh auto', fontFamily: 'sans-serif' }}>
        <h2>Sign in</h2>
        <form onSubmit={login}>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: 8, marginBottom: 12 }}
          />
          <button type="submit">Send magic link</button>
        </form>
      </div>
    );
  }
  return <LoginGate />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <LoginGate />
  </React.StrictMode>
);
