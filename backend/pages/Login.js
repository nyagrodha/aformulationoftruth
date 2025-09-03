//Login.js

import React, { useState } from 'react';
import api from '../api/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
   
   const handleSubmit = async e => {
  e.preventDefault();
  
  // Get the user's timezone from their browser
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Ask for geolocation and send all data to the backend
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      // Success: We have coordinates
      const { latitude, longitude } = position.coords;
      await sendLoginRequest({ latitude, longitude, timezone });
    },
    async (error) => {
      // Error or Permission Denied: Send timezone only
      console.warn("Geolocation permission denied.", error.message);
      await sendLoginRequest({ timezone });
    }
  );
};
  const sendLoginRequest = async (locationData) => {
  try {
    const payload = {
      email, // from your component's state
      ...locationData
    };
      await api.post('/user/magic-link', { email });
      setMessage('✅ Check your inbox for the link!');
    } catch (err) {
      console.error(err);
      setMessage('❌ Unfortunately, something went wrong. Kindly try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <h2>Sign in with your apotropaic link</h2>
      <input
        type="email"
        placeholder="email address you receive @"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
      />
      <button type="submit">Send Link 🔑</button>
      {message && <p>{message}</p>}
    </form>
  );
}
