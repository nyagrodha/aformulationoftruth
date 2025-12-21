import { useState, FormEvent } from 'react';
import { Magic } from 'magic-sdk';

export default function Login(): JSX.Element {
  const [email, setEmail] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [showModal, setShowModal] = useState<boolean>(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const publishableKey = process.env.REACT_APP_MAGIC_PUBLISHABLE_KEY;
      if (!publishableKey) {
        throw new Error('Magic publishable key not configured');
      }

      const magic = new Magic(publishableKey);
      const didToken = await magic.auth.loginWithEmailOTP({ email });

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ didToken }),
      });

      if (response.ok) {
        window.location.href = '/questions';
      } else {
        throw new Error('Authentication failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  const openModal = () => setShowModal(true);
  const closeModal = () => {
    if (!isLoading) {
      setShowModal(false);
      setEmail('');
      setError('');
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }

        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(255, 0, 255, 0.5), 0 0 40px rgba(0, 255, 255, 0.3); }
          50% { box-shadow: 0 0 40px rgba(255, 0, 255, 0.8), 0 0 80px rgba(0, 255, 255, 0.6); }
        }

        @keyframes rotate-gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .funky-button {
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
          transform: perspective(1000px);
        }

        .funky-button:hover:not(:disabled) {
          transform: perspective(1000px) rotateX(5deg) rotateY(-5deg) scale(1.05);
        }

        .funky-button:active:not(:disabled) {
          transform: perspective(1000px) rotateX(-5deg) rotateY(5deg) scale(0.95);
        }

        .funky-button::before {
          content: '';
          position: absolute;
          top: -2px;
          left: -2px;
          right: -2px;
          bottom: -2px;
          background: linear-gradient(45deg, #ff00ff, #00ffff, #ffff00, #ff00ff);
          background-size: 400% 400%;
          border-radius: inherit;
          z-index: -1;
          animation: rotate-gradient 3s ease infinite;
        }

        .modal-overlay {
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .modal-content {
          animation: slideUp 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        @keyframes slideUp {
          from {
            transform: translate(-50%, 100%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, -50%);
            opacity: 1;
          }
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 50%, #0a0a0a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: "'Orbitron', sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Animated background particles */}
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={`particle-${i}`}
            style={{
              position: 'absolute',
              width: `${Math.random() * 6 + 2}px`,
              height: `${Math.random() * 6 + 2}px`,
              backgroundColor: ['#ff00ff', '#00ffff', '#ffff00'][i % 3],
              borderRadius: '50%',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.5 + 0.2,
              animation: `float ${Math.random() * 3 + 2}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
              boxShadow: `0 0 10px ${['#ff00ff', '#00ffff', '#ffff00'][i % 3]}`,
            }}
          />
        ))}

        {/* Main content */}
        <div style={{
          textAlign: 'center',
          zIndex: 10,
          maxWidth: '600px',
        }}>
          <h1 style={{
            fontSize: 'clamp(2.5rem, 8vw, 5rem)',
            fontWeight: 900,
            marginBottom: '1rem',
            background: 'linear-gradient(90deg, #ff00ff, #00ffff, #ffff00)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 0 30px rgba(255,0,255,0.5)',
            animation: 'pulse-glow 2s infinite',
          }}>
            A Formulation of Truth
          </h1>

          <p style={{
            fontSize: '1.2rem',
            color: '#00ffff',
            marginBottom: '3rem',
            opacity: 0.9,
          }}>
            Enter the portal of self-discovery
          </p>

          {/* Funky styled Enter button */}
          <button
            onClick={openModal}
            className="funky-button"
            style={{
              padding: '1.5rem 4rem',
              fontSize: '1.5rem',
              fontWeight: 700,
              fontFamily: "'Orbitron', sans-serif",
              color: '#000',
              background: 'linear-gradient(45deg, #ff00ff, #00ffff)',
              border: 'none',
              borderRadius: '50px 10px 50px 10px',
              cursor: 'pointer',
              position: 'relative',
              zIndex: 1,
              boxShadow: '0 10px 30px rgba(255, 0, 255, 0.4)',
            }}
          >
            ENTER
          </button>

          <div style={{
            marginTop: '3rem',
            fontSize: '0.9rem',
            color: '#888',
          }}>
            <p>The Proust Questionnaire Reimagined</p>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={closeModal}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'linear-gradient(135deg, #1a0a2e 0%, #2d1b3d 50%, #1a0a2e 100%)',
              borderRadius: '30px 5px 30px 5px',
              padding: '3rem',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 20px 60px rgba(255, 0, 255, 0.4), 0 0 0 2px #ff00ff',
              border: '2px solid transparent',
              backgroundClip: 'padding-box',
            }}
          >
            <h2 style={{
              fontSize: '2rem',
              fontWeight: 700,
              marginBottom: '1.5rem',
              textAlign: 'center',
              background: 'linear-gradient(90deg, #ff00ff, #00ffff)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Sign In
            </h2>

            <p style={{
              textAlign: 'center',
              color: '#aaa',
              marginBottom: '2rem',
              fontSize: '0.95rem',
            }}>
              Enter your email to receive a magic link
            </p>

            <form onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '1rem 1.5rem',
                  fontSize: '1.1rem',
                  fontFamily: "'Orbitron', sans-serif",
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '2px solid #ff00ff',
                  borderRadius: '15px 5px 15px 5px',
                  color: '#fff',
                  marginBottom: '1.5rem',
                  outline: 'none',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 0 20px rgba(255, 0, 255, 0.2)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#00ffff';
                  e.target.style.boxShadow = '0 0 30px rgba(0, 255, 255, 0.4)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#ff00ff';
                  e.target.style.boxShadow = '0 0 20px rgba(255, 0, 255, 0.2)';
                }}
              />

              {error && (
                <div style={{
                  padding: '1rem',
                  marginBottom: '1rem',
                  backgroundColor: 'rgba(255, 0, 0, 0.1)',
                  border: '1px solid #ff0000',
                  borderRadius: '10px',
                  color: '#ff6666',
                  fontSize: '0.9rem',
                }}>
                  {error}
                </div>
              )}

              <div style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'space-between',
              }}>
                {/* Cancel button - funky shape 1 */}
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isLoading}
                  className="funky-button"
                  style={{
                    flex: 1,
                    padding: '1rem 2rem',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    fontFamily: "'Orbitron', sans-serif",
                    color: '#fff',
                    background: 'linear-gradient(135deg, #4a0e4e 0%, #81157c 100%)',
                    border: '2px solid #ff00ff',
                    borderRadius: '25px 5px 5px 25px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.5 : 1,
                    transition: 'all 0.3s ease',
                  }}
                >
                  CANCEL
                </button>

                {/* Submit button - funky shape 2 */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="funky-button"
                  style={{
                    flex: 1,
                    padding: '1rem 2rem',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    fontFamily: "'Orbitron', sans-serif",
                    color: '#000',
                    background: isLoading
                      ? 'linear-gradient(135deg, #666 0%, #999 100%)'
                      : 'linear-gradient(135deg, #00ffff 0%, #ff00ff 100%)',
                    border: 'none',
                    borderRadius: '5px 25px 25px 5px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.7 : 1,
                    transition: 'all 0.3s ease',
                  }}
                >
                  {isLoading ? 'SENDING...' : 'SEND LINK'}
                </button>
              </div>
            </form>

            <p style={{
              marginTop: '2rem',
              textAlign: 'center',
              fontSize: '0.85rem',
              color: '#666',
            }}>
              Check your email for the magic link to continue
            </p>
          </div>
        </div>
      )}
    </>
  );
}
