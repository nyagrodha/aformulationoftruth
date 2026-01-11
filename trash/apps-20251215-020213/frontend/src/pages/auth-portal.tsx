import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

// SVG Icon for Email Input
const EmailInputIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '12px', top: '12px', color: '#00ffff' }}>
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
    <polyline points="22,6 12,13 2,6"></polyline>
  </svg>
);

const styles: { [key: string]: React.CSSProperties } = {
  pageContainer: { display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',padding:'20px',fontFamily:"'EB Garamond', serif" },
  background: { position:'absolute',top:0,left:0,width:'100%',height:'100%',background:'radial-gradient(circle, #4a00e0, #8e2de2, #0d324d)',zIndex:-1 },
  frame: { maxWidth:'800px',width:'100%',padding:'50px',backgroundColor:'rgba(10, 0, 30, 0.7)',backdropFilter:'blur(10px)',borderRadius:'20px',textAlign:'center',color:'#f0e6ff',border:'3px solid #00ffff' },
  title: { fontSize:'2.8rem',fontWeight:500,marginBottom:'1rem',letterSpacing:'1px' },
  sanskritTitle: { fontSize:'2.2rem',marginBottom:'1.5rem',fontFamily:"'Noto Sans Devanagari', sans-serif" },
  description: { fontSize:'1.2rem',lineHeight:1.6,maxWidth:'600px',margin:'0 auto 2.5rem auto',color:'#dcd1ff' },
  link: { color:'#00ffff',textDecoration:'none' },
  symbols: { letterSpacing:'0.5em',fontSize:'1.5rem',marginBottom:'1rem',color:'#ff00ff' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '500px', margin: '0 auto' },
  inputGroup: { position: 'relative' },
  input: {
    width: '100%',
    padding: '12px 12px 12px 45px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid #00ffff',
    borderRadius: '50px',
    color: '#fff',
    fontSize: '1rem',
    transition: 'border-color 0.3s, box-shadow 0.3s',
    outline: 'none',
  },
  button: {
    backgroundColor:'rgba(0, 255, 255, 0.1)',
    border:'1px solid #00ffff',
    color:'#00ffff',
    padding:'12px 30px',
    borderRadius:'50px',
    cursor:'pointer',
    fontSize:'1.1rem',
    transition:'background-color 0.3s, box-shadow 0.3s',
    display:'inline-flex',
    alignItems:'center',
    justifyContent: 'center',
    gap:'10px',
    width: '100%',
  },
  note: { marginTop: '15px', fontSize: '0.95rem', color: '#dcd1ff' },
  error: { color: '#ff7b7b' },
  success: { color: '#00ffff' },
  affiliateCorner: {
    position: 'fixed' as const,
    bottom: '20px',
    right: '20px',
    textAlign: 'right' as const,
    zIndex: 1000,
  },
  affiliateLogo: {
    width: '180px',
    height: 'auto',
    opacity: 0.8,
    transition: 'opacity 0.3s',
  },
  testimonial: {
    marginTop: '10px',
    fontSize: '0.75rem',
    color: '#dcd1ff',
    fontStyle: 'italic',
    maxWidth: '220px',
    marginLeft: 'auto',
    lineHeight: 1.4,
  },
};

export default function AuthPortalPage() {
  const { startLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<'idle'|'sending'|'sent'|'error'>('idle');
  const [error, setError] = useState<string>('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (phase === 'sending' || phase === 'sent') return;

    setPhase('sending');
    setError('');

    try {
      await startLogin(email);
      setPhase('sent');
    } catch (e) {
      console.error(e);
      setError('Could not send the magic link. Please try again.');
      setPhase('error');
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#00ffff';
    e.target.style.boxShadow = '0 0 15px rgba(0, 255, 255, 0.6)';
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#00ffff';
    e.target.style.boxShadow = 'none';
  };

  const handleButtonHover = (e: React.MouseEvent<HTMLButtonElement>, enter: boolean) => {
    e.currentTarget.style.backgroundColor = enter ? 'rgba(0, 255, 255, 0.2)' : 'rgba(0, 255, 255, 0.1)';
    e.currentTarget.style.boxShadow = enter ? '0 0 15px rgba(0, 255, 255, 0.6)' : 'none';
  };

  const isLoading = phase === 'sending';
  const isSubmitted = phase === 'sent';

  return (
    <div style={styles.pageContainer}>
      <div style={styles.background} />

      {/* FlokiNET Affiliate Link */}
      <div style={styles.affiliateCorner}>
        <a
          href="https://billing.flokinet.is/aff.php?aff=543"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="https://flokinet.is/images/floki_logo.svg"
            alt="FlokiNET"
            style={styles.affiliateLogo}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
          />
        </a>
        <div style={styles.testimonial}>
          "I've used FlokiNET for over a decade. I implicitly trust the folks who manage the data for this site to keep it secure and private."
        </div>
      </div>

      <div style={styles.frame}>
        <h1 style={styles.title}>you are this moment</h1>
        <div style={styles.symbols}>
          <span className="om-symbol">ॐ</span>
          <span>@</span><span>@</span><span>@</span><span>@</span><span>@</span>
          <span className="at-symbol">ੴ</span>
        </div>
        <h2 style={styles.sanskritTitle}>
          <span>ஸ்ரீ ॥</span> உண்மையை சூத்திரம் | a formulation of truth | формулювання істини <span>॥ ஶ்ரீ</span>
        </h2>
        <p style={styles.description}>
          A practice in <a href="https://www.davidgodman.org/the-practice-of-self-enquiry/" target="_blank" rel="noopener noreferrer" style={styles.link}>self-enquiry</a>, these questions invite reflective states of consciousness.
        </p>

        {!isSubmitted ? (
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.inputGroup}>
              <EmailInputIcon />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={styles.input}
                placeholder="your@email.com"
                required
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              style={styles.button}
              onMouseEnter={(e) => handleButtonHover(e, true)}
              onMouseLeave={(e) => handleButtonHover(e, false)}
              disabled={isLoading}
            >
              {isLoading ? (
                <>Sending magic link...</>
              ) : (
                <><span>✧</span> Begin the questionnaire <span>✧</span></>
              )}
            </button>
            {phase === 'error' && <div style={{ ...styles.note, ...styles.error }}>{error}</div>}
          </form>
        ) : (
          <div style={{ ...styles.note, ...styles.success }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>✓</div>
            <div>Magic link sent to <strong>{email}</strong></div>
            <div style={{ marginTop: '0.5rem' }}>Check your inbox to begin your journey.</div>
          </div>
        )}
      </div>
    </div>
  );
}
