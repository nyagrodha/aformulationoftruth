import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Callback(): JSX.Element {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('Authenticating...');
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Extract token and email from URL
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        const email = urlParams.get('email');

        if (!token || !email) {
          throw new Error('Missing authentication parameters');
        }

        // Store credentials
        localStorage.setItem('token', token);
        localStorage.setItem('userEmail', email);

        setStatus('success');
        setMessage('Authentication successful! Redirecting...');

        // Redirect to questionnaire after a brief delay
        setTimeout(() => {
          navigate('/questions');
        }, 1500);
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Authentication failed');
      }
    };

    void handleCallback();
  }, [navigate]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap');

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }

        .spinner {
          animation: spin 1s linear infinite;
        }

        .success-icon {
          animation: pulse 1.5s ease-in-out infinite;
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 50%, #0a0a0a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: "'Orbitron', sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Background particles */}
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={`particle-${i}`}
            style={{
              position: 'absolute',
              width: `${Math.random() * 4 + 2}px`,
              height: `${Math.random() * 4 + 2}px`,
              backgroundColor: ['#ff00ff', '#00ffff', '#ffff00'][i % 3],
              borderRadius: '50%',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.5 + 0.2,
              boxShadow: `0 0 10px ${['#ff00ff', '#00ffff', '#ffff00'][i % 3]}`,
            }}
          />
        ))}

        <div style={{
          textAlign: 'center',
          zIndex: 10,
          background: 'rgba(26, 10, 46, 0.8)',
          padding: '3rem',
          borderRadius: '30px 10px 30px 10px',
          border: '2px solid',
          borderColor: status === 'error' ? '#ff0000' : status === 'success' ? '#00ff00' : '#ff00ff',
          boxShadow: `0 20px 60px ${status === 'error' ? 'rgba(255, 0, 0, 0.4)' : status === 'success' ? 'rgba(0, 255, 0, 0.4)' : 'rgba(255, 0, 255, 0.4)'}`,
          backdropFilter: 'blur(10px)',
          maxWidth: '500px',
          width: '90%',
        }}>
          {status === 'loading' && (
            <div
              className="spinner"
              style={{
                width: '80px',
                height: '80px',
                border: '6px solid transparent',
                borderTopColor: '#ff00ff',
                borderRightColor: '#00ffff',
                borderRadius: '50%',
                margin: '0 auto 2rem',
              }}
            />
          )}

          {status === 'success' && (
            <div
              className="success-icon"
              style={{
                fontSize: '80px',
                margin: '0 auto 2rem',
                color: '#00ff00',
                textShadow: '0 0 30px #00ff00',
              }}
            >
              ✓
            </div>
          )}

          {status === 'error' && (
            <div
              style={{
                fontSize: '80px',
                margin: '0 auto 2rem',
                color: '#ff0000',
                textShadow: '0 0 30px #ff0000',
              }}
            >
              ✗
            </div>
          )}

          <h2 style={{
            fontSize: '1.8rem',
            fontWeight: 700,
            marginBottom: '1rem',
            background: status === 'error'
              ? 'linear-gradient(90deg, #ff0000, #ff6666)'
              : status === 'success'
              ? 'linear-gradient(90deg, #00ff00, #00ff88)'
              : 'linear-gradient(90deg, #ff00ff, #00ffff)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            {status === 'loading' && 'Authenticating'}
            {status === 'success' && 'Success!'}
            {status === 'error' && 'Error'}
          </h2>

          <p style={{
            fontSize: '1.1rem',
            color: '#aaa',
            lineHeight: 1.6,
          }}>
            {message}
          </p>

          {status === 'error' && (
            <button
              onClick={() => navigate('/')}
              style={{
                marginTop: '2rem',
                padding: '1rem 2rem',
                fontSize: '1.1rem',
                fontWeight: 700,
                fontFamily: "'Orbitron', sans-serif",
                color: '#fff',
                background: 'linear-gradient(135deg, #ff00ff 0%, #00ffff 100%)',
                border: 'none',
                borderRadius: '25px 5px 25px 5px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 10px 30px rgba(255, 0, 255, 0.4)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 15px 40px rgba(255, 0, 255, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(255, 0, 255, 0.4)';
              }}
            >
              Return to Login
            </button>
          )}
        </div>
      </div>
    </>
  );
}
