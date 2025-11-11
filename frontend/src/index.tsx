import { StrictMode, FormEvent, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Magic } from 'magic-sdk';

import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

function LoginGate(): JSX.Element {
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    fetch('/api/user/me')
      .then(response => {
        if (isMounted) {
          setLoggedIn(response.ok);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoggedIn(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const publishableKey = process.env.REACT_APP_MAGIC_PUBLISHABLE_KEY;
    if (!publishableKey) {
      console.error('Missing REACT_APP_MAGIC_PUBLISHABLE_KEY');
      return;
    }

    const magic = new Magic(publishableKey);
    const didToken = await magic.auth.loginWithEmailOTP({ email });
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ didToken }),
    });

    if (response.ok) {
      setLoggedIn(true);
    }
  };

  if (!loggedIn) {
    return (
      <div style={{ maxWidth: 400, margin: '10vh auto', fontFamily: 'sans-serif' }}>
        <h2>Sign in</h2>
        <form onSubmit={login}>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={event => setEmail(event.target.value)}
            required
            style={{ width: '100%', padding: 8, marginBottom: 12 }}
          />
          <button type="submit">Send magic link</button>
        </form>
      </div>
    );
  }

  return <App />;
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <StrictMode>
    <LoginGate />
  </StrictMode>,
);
