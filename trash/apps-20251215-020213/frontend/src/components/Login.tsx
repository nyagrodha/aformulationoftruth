import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface User {
  id: string;
  email: string;
  displayName?: string;
  roles?: string[];
}

export default function Login(): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    checkAuthStatus();
  }, []);

  async function checkAuthStatus() {
    try {
      // Check for token in URL (from magic link callback)
      const urlToken = searchParams.get('token');
      const authSuccess = searchParams.get('auth');

      if (urlToken) {
        // Store token in localStorage
        localStorage.setItem('token', urlToken);
        // Clean up URL
        window.history.replaceState({}, '', '/login');
      }

      // Check for stored token
      const token = localStorage.getItem('token');

      if (token) {
        // Validate token with backend
        const response = await fetch('/api/user/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);

          // Store userEmail for Questionnaire component
          if (userData.email) {
            localStorage.setItem('userEmail', userData.email);
          }

          // Handle redirect after login
          const redirect = searchParams.get('redirect');
          if (redirect) {
            navigate(redirect);
          } else {
            navigate('/questionnaire');
          }
        } else {
          // Invalid token, clear it
          localStorage.removeItem('token');
        }
      }
    } catch (err) {
      console.error('Auth check error:', err);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLinkRequest(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    // Collect browser geolocation if available
    let geolocation: any = null;
    if ('geolocation' in navigator) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
          });
        });

        geolocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp
        };
      } catch (geoError) {
        console.log('Geolocation not available or denied:', geoError);
        // Continue without geolocation - not required
      }
    }

    try {
      const response = await fetch('/auth/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, geolocation })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message || 'Magic link sent! Check your email inbox.');
        setEmail('');
      } else {
        setError(data.error || 'Failed to send magic link');
      }
    } catch (err) {
      console.error('Magic link request error:', err);
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('userEmail');
      setUser(null);
      navigate('/');
    } catch (err) {
      setError('Logout failed');
    }
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.loading}>Loading...</div>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.title}>Welcome, {user.displayName || user.email}!</h2>
          <button onClick={handleLogout} style={styles.button}>
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.symbol}>ॐ@ॐ</div>
        <h2 style={styles.title}>Sign In</h2>
        <p style={styles.description}>
          Enter your email to receive a magic link for authentication
        </p>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        <form onSubmit={handleMagicLinkRequest} style={styles.form}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            style={styles.input}
            disabled={submitting}
          />
          <button
            type="submit"
            style={styles.submitButton}
            disabled={submitting}
          >
            {submitting ? 'Sending...' : '🔐 Send Magic Link'}
          </button>
        </form>

        <p style={styles.footer}>
          Secure passwordless authentication
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#000011',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    fontFamily: 'Orbitron, monospace'
  },
  card: {
    background: 'rgba(147, 112, 219, 0.05)',
    border: '2px solid #9370db',
    borderRadius: '16px',
    padding: '3rem',
    maxWidth: '500px',
    width: '100%',
    textAlign: 'center'
  },
  symbol: {
    fontSize: '3rem',
    color: '#ff8c00',
    marginBottom: '1.5rem'
  },
  title: {
    color: '#9370db',
    fontSize: '2rem',
    marginBottom: '1rem'
  },
  description: {
    color: '#eae6ff',
    opacity: 0.8,
    marginBottom: '2rem'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    marginBottom: '1rem'
  },
  input: {
    width: '100%',
    padding: '1rem',
    background: 'rgba(147, 112, 219, 0.1)',
    border: '2px solid #9370db',
    borderRadius: '12px',
    color: '#eae6ff',
    fontSize: '1rem',
    fontFamily: 'Orbitron, monospace',
    outline: 'none',
    boxSizing: 'border-box'
  },
  submitButton: {
    width: '100%',
    padding: '1rem 2rem',
    background: '#9370db',
    color: '#000011',
    border: 'none',
    borderRadius: '12px',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    fontFamily: 'Orbitron, monospace'
  },
  button: {
    width: '100%',
    padding: '1rem 2rem',
    background: 'transparent',
    color: '#9370db',
    border: '2px solid #9370db',
    borderRadius: '12px',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    fontFamily: 'Orbitron, monospace'
  },
  footer: {
    marginTop: '2rem',
    color: '#eae6ff',
    opacity: 0.6,
    fontSize: '0.9rem'
  },
  error: {
    background: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    padding: '1rem',
    color: '#ff6b6b',
    marginBottom: '1rem'
  },
  success: {
    background: 'rgba(34, 197, 94, 0.2)',
    border: '1px solid #22c55e',
    borderRadius: '8px',
    padding: '1rem',
    color: '#4ade80',
    marginBottom: '1rem'
  },
  loading: {
    color: '#9370db',
    fontSize: '1.2rem'
  }
};
