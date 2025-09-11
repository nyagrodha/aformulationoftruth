import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// --- SVG Icon ---
const EmailInputIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '12px', top: '12px', color: '#666' }}>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
    </svg>
);

// --- Styles ---
const styles: { [key: string]: React.CSSProperties } = {
    pageContainer: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px',
        background: 'linear-gradient(-45deg, #0f0c29, #302b63, #24243e, #1a1a2e)', backgroundSize: '400% 400%',
        animation: 'gradientAnimation 15s ease infinite', fontFamily: 'sans-serif',
    },
    container: {
        maxWidth: '500px', width: '100%', padding: '40px 30px', color: '#e0e0e0',
        backgroundColor: 'rgba(10, 10, 20, 0.6)', backdropFilter: 'blur(10px)',
        borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'center',
    },
    // ... other styles remain the same
    header: { marginBottom: '30px' },
    title: { fontSize: '2.5rem', color: '#fff', fontWeight: '300', marginBottom: '10px' },
    subtitle: { fontSize: '1rem', color: '#aaa' },
    form: { display: 'flex', flexDirection: 'column', gap: '20px' },
    inputGroup: { position: 'relative' },
    input: {
        width: '100%', padding: '12px 12px 12px 45px', backgroundColor: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid #444', borderRadius: '8px', color: '#fff', fontSize: '1rem',
        transition: 'border-color 0.3s, box-shadow 0.3s',
    },
    button: {
        backgroundColor: '#003333', color: '#00ffff', border: '1px solid #00ffff', padding: '12px 20px',
        borderRadius: '8px', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold',
        transition: 'background-color 0.2s, box-shadow 0.2s', marginTop: '10px',
    },
    note: { marginTop: '15px', fontSize: '0.95rem' },
    error: { color: '#ff7b7b' },
};


export default function LoginPage() {
    const { startLogin } = useAuth();
    const location = useLocation();
    
    const [email, setEmail] = useState('');
    const [phase, setPhase] = useState<'idle'|'sending'|'sent'|'error'>('idle');
    const [error, setError] = useState<string>('');
    
    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (phase === 'sending' || phase === 'sent') return;

        setPhase('sending');
        setError('');

        const from = (location.state as any)?.from?.pathname || '/questionnaire';
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const send = async (geoLocation: Record<string, unknown>) => {
            try {
                // --- IPINFO API
                let ipInfo = {};
                try {
                    const ipinfoToken = import.meta.env.VITE_IP_API_KEY;
                    const response = await fetch(`https://ipinfo.io/json?token=${ipinfoToken}`);
                    if (!response.ok) throw new Error('IPinfo request failed');
                    ipInfo = await response.json();
                } catch (ipError) {
                    console.warn("Could not fetch IP info:", ipError);
                    // We continue even if this fails, so it doesn't block login
                }

                // Combine all metadata sources
                const metadata = { ...geoLocation, timezone, from, ipInfo };
                
                await startLogin(email, metadata);
                setPhase('sent');

            } catch (e) {
                console.error(e);
                setError('Could not send the magic link. Please try again.');
                setPhase('error');
            }
        };

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => void send({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
                () => void send({}), // Send empty object if geolocation is denied
                { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
            );
        } else {
            void send({}); // Send empty object if geolocation is not available
        }
    };

    // ... Event handlers and JSX remain the same ...
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = '#00ffff'; e.target.style.boxShadow = '0 0 10px rgba(0, 255, 255, 0.5)'; };
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = '#444'; e.target.style.boxShadow = 'none'; };
    const handleButtonHover = (e: React.MouseEvent<HTMLElement>, enter: boolean) => {
        e.currentTarget.style.transform = enter ? 'scale(1.05)' : 'scale(1)';
    };

    const isLoading = phase === 'sending';
    const isSubmitted = phase === 'sent';
    
    return (
        <div style={styles.pageContainer}>
            {/* The rest of your styled JSX component goes here, unchanged */}
            <div style={styles.container}>
                <header style={styles.header}>
                    <h1 style={styles.title}>Begin</h1>
                    <p style={styles.subtitle}>Enter your email to start or resume your session.</p>
                </header>
                <form onSubmit={handleSubmit} style={styles.form}>
                    <div style={styles.inputGroup}>
                        <EmailInputIcon />
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onFocus={handleFocus} onBlur={handleBlur} style={styles.input} placeholder="you@example.com" required disabled={isLoading || isSubmitted} />
                    </div>
                    <button type="submit" style={styles.button} onMouseEnter={(e) => handleButtonHover(e, true)} onMouseLeave={(e) => handleButtonHover(e, false)} disabled={isLoading || isSubmitted}>
                        {isLoading ? 'Sending...' : isSubmitted ? 'Link Sent ✅' : 'Send Magic Link'}
                    </button>
                    {isSubmitted && <div style={styles.note}>Check your inbox for the sign-in link.</div>}
                    {phase === 'error' && <div style={{ ...styles.note, ...styles.error }}>{error}</div>}
                </form>
            </div>
        </div>
    );
}
