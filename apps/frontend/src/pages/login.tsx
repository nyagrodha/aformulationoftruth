import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const styles: { [key: string]: React.CSSProperties } = {
  container: { display: 'grid', placeItems: 'center', minHeight: '100vh', color: '#eee', fontFamily: "'EB Garamond', serif" },
  form: { padding: '2rem', border: '1px solid #00ffff', borderRadius: '10px', backgroundColor: 'rgba(10, 0, 30, 0.7)', backdropFilter: 'blur(10px)', width: '320px', textAlign: 'center' },
  input: { width: '100%', padding: '0.5rem', marginBottom: '1rem', backgroundColor: '#333', border: '1px solid #555', borderRadius: '4px', color: 'white' },
  button: { width: '100%', padding: '0.75rem', border: '1px solid #00ffff', borderRadius: '4px', backgroundColor: 'rgba(0, 255, 255, 0.2)', color: '#00ffff', cursor: 'pointer' },
  note: { marginTop: '0.75rem', fontSize: '0.95rem' }
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<'idle'|'sending'|'sent'|'error'>('idle');
  const [error, setError] = useState<string>('');
  const location = useLocation();
  const { startLogin } = useAuth();

  const from = (location.state as any)?.from?.pathname || '/questionnaire';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || phase === 'sending') return;

    setPhase('sending');
    setError('');

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const send = async (extras: Record<string, unknown>) => {
      try {
        await startLogin(email, extras);
        setPhase('sent');
      } catch (e) {
        console.error(e);
        setError('Could not send the magic link. Please try again.');
        setPhase('error');
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void send({ timezone, latitude: pos.coords.latitude, longitude: pos.coords.longitude, from });
        },
        () => {
          void send({ timezone, from });
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
      );
    } else {
      void send({ timezone, from });
    }
  };

  return (
    <div style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <h2>Sign in</h2>
        <p>Enter your email to receive a one-time link.</p>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your-email@example.com"
          style={styles.input}
          required
          disabled={phase === 'sending' || phase === 'sent'}
        />

        <button type="submit" style={styles.button} disabled={phase === 'sending' || phase === 'sent'}>
          {phase === 'sending' ? 'Sending…' : phase === 'sent' ? 'Link sent ✅' : 'Send magic link'}
        </button>

        {phase === 'sent' && (
          <div style={styles.note}>Check your inbox for the sign-in link. You’ll return here once you click it.</div>
        )}
        {phase === 'error' && <div style={{ ...styles.note, color: '#ff7b7b' }}>{error}</div>}
      </form>
    </div>
  );
}
