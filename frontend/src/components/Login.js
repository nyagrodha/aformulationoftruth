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
    <form onSubmit={handleSubmit} className="login-form">
      <h2>Sign in with your apotropaic link</h2>
      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
      />
      <button type="submit">Send Link 🔑</button>
      {message && <p>{message}</p>}
    </form>
  );
}
