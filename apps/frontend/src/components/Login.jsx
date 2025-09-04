import React, { useState } from 'react';

// --- SVG Icons ---
const EmailInputIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '12px', top: '12px', color: '#666' }}>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
    </svg>
);


// --- Styles ---
const styles = {
    pageContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px',
        background: 'linear-gradient(-45deg, #0f0c29, #302b63, #24243e, #1a1a2e)',
        backgroundSize: '400% 400%',
        animation: 'gradientAnimation 15s ease infinite',
        fontFamily: 'sans-serif',
    },
    container: {
        maxWidth: '500px',
        width: '100%',
        padding: '40px 30px',
        lineHeight: '1.7',
        color: '#e0e0e0',
        backgroundColor: 'rgba(10, 10, 20, 0.6)',
        backdropFilter: 'blur(10px)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        textAlign: 'center',
    },
    header: {
        marginBottom: '30px',
    },
    title: {
        fontSize: '2.5rem',
        color: '#fff',
        fontWeight: '300',
        marginBottom: '10px',
    },
    subtitle: {
        fontSize: '1rem',
        color: '#aaa',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
    },
    inputGroup: {
        position: 'relative',
    },
    input: {
        width: '100%',
        padding: '12px 12px 12px 45px',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid #444',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '1rem',
        transition: 'border-color 0.3s, box-shadow 0.3s',
    },
    button: {
        backgroundColor: '#003333',
        color: '#00ffff',
        border: '1px solid #00ffff',
        padding: '12px 20px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '1.1rem',
        fontWeight: 'bold',
        transition: 'background-color 0.2s, box-shadow 0.2s',
        marginTop: '10px',
    },
};

export default function Login() {
    const [email, setEmail] = useState('');

    const handleFocus = (e) => {
        e.target.style.borderColor = '#00ffff';
        e.target.style.boxShadow = '0 0 10px rgba(0, 255, 255, 0.5)';
    };

    const handleBlur = (e) => {
        e.target.style.borderColor = '#444';
        e.target.style.boxShadow = 'none';
    };
    
    const handleButtonHover = (e, enter) => {
        e.currentTarget.style.backgroundColor = enter ? 'rgba(0, 255, 255, 0.1)' : '#003333';
        e.currentTarget.style.boxShadow = enter ? '0 0 15px rgba(0, 255, 255, 0.6)' : 'none';
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Handle login logic here, e.g., send a magic link
        console.log('Login attempt with email:', email);
        alert(`A login link has been sent to ${email}`);
    };

    return (
        <>
            <style>
                {`
                  @keyframes gradientAnimation {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                  }
                `}
            </style>
            <div style={styles.pageContainer}>
                <div style={styles.container}>
                    <header style={styles.header}>
                        <h1 style={styles.title}>Begin</h1>
                        <p style={styles.subtitle}>Enter your email to start or resume your session.</p>
                    </header>

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
                                placeholder="you@example.com"

                                required
                            />
                        </div>
                        <button 
                            type="submit" 
                            style={styles.button}
                            onMouseEnter={(e) => handleButtonHover(e, true)}
                            onMouseLeave={(e) => handleButtonHover(e, false)}
                        >
                            Send Magic Link
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}
