import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// (Your styles object can remain here as it was)
const styles: { [key: string]: React.CSSProperties } = {
  container: { display: 'grid', placeItems: 'center', minHeight: '100vh', color: '#eee', fontFamily: "'EB Garamond', serif" },
  form: { padding: '2rem', border: '1px solid #00ffff', borderRadius: '10px', backgroundColor: 'rgba(10, 0, 30, 0.7)', backdropFilter: 'blur(10px)', width: '320px', textAlign: 'center' },
  input: { width: '100%', padding: '0.5rem', marginBottom: '1rem', backgroundColor: '#333', border: '1px solid #555', borderRadius: '4px', color: 'white' },
  button: { width: '100%', padding: '0.75rem', border: '1px solid #00ffff', borderRadius: '4px', backgroundColor: 'rgba(0, 255, 255, 0.2)', color: '#00ffff', cursor: 'pointer' },
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading } = useAuth(); // Get isLoading from the hook

  const from = location.state?.from?.pathname || '/';

  // Make the submit handler ASYNC
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // AWAIT the login action to complete
    await login(email);

    // Only navigate AFTER the login is finished
    navigate(from, { replace: true });
  };

  return (
    <div style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <h2>Login</h2>
        <p>Please enter your email to proceed.</p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your-email@example.com"
          style={styles.input}
          required
          disabled={isLoading} // Disable input while logging in
        />
        <button type="submit" style={styles.button} disabled={isLoading}>
          {isLoading ? 'Verifying...' : 'Enter Inner Sanctum'}
        </oapen>
      </form>
    </div>
  );
}
