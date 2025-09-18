import React, { useState } from 'react';
import api from '../api/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      await api.post('/user/magic-link', { email });
      setMessage('✅ Check your inbox for the apotropaic link!');
    } catch {
      setMessage('❌ Something went wrong. Try again.');
    }
  };

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <form onSubmit={handleSubmit} className="login-form">
        <h2>Sign in with your apotropaic link</h2>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ padding: '0.5rem', fontSize: '1rem' }}
        />
        <br /><br />
        <button type="submit" style={{
          padding: '0.5rem 1.5rem',
          background: '#00ffff',
          border: 'none',
          borderRadius: '8px',
          fontWeight: 'bold',
          cursor: 'pointer'
        }}>
          Send Link 🔑
        </button>
        {message && <p>{message}</p>}
      </form>

      {/* 🌸 Optional Link to Kavya 
      <div style={{ marginTop: '2rem' }}>
        <a
          href="/mangala_kavya_animated.html"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            padding: '0.6rem 1.2rem',
            background: '#ff00ff',
            color: '#000',
            textDecoration: 'none',
            borderRadius: '6px',
            boxShadow: '0 0 10px #ff00ff',
            fontWeight: 'bold'
          }}
        >
          🌺 View Animated Kavya
        </a>
      </div>
      */}

      {/* 🌌 Optional Iframe Embed */}
      <div style={{ marginTop: '2rem' }}>
        <iframe
          src="/mangala_kavya_animated.html"
          width="100%"
          height="500"
          style={{ border: 'none' }}
          title="Mangala Kavya"
        />
      </div>
    </div>
  );
}
