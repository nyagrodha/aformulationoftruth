import React from 'react';
import { useLocation } from 'wouter';

// --- Styles ---
// Using an object for inline styles for simplicity and self-containment.
const styles: { [key: string]: React.CSSProperties } = {
    pageContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px',
        fontFamily: "'EB Garamond', serif",
    },
    background: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'radial-gradient(circle, #4a00e0, #8e2de2, #0d324d)',
        zIndex: -1,
    },
    frame: {
        maxWidth: '800px',
        width: '100%',
        padding: '50px',
        backgroundColor: 'rgba(10, 0, 30, 0.7)',
        backdropFilter: 'blur(10px)',
        borderRadius: '20px',
        textAlign: 'center',
        color: '#f0e6ff',
        border: '3px solid #00ffff',
    },
    title: {
        fontSize: '2.8rem',
        fontWeight: 500,
        marginBottom: '1rem',
        letterSpacing: '1px',
    },
    sanskritTitle: {
        fontSize: '2.2rem',
        marginBottom: '1.5rem',
        fontFamily: "'Noto Sans Devanagari', sans-serif",
    },
    description: {
        fontSize: '1.2rem',
        lineHeight: 1.6,
        maxWidth: '600px',
        margin: '0 auto 2.5rem auto',
        color: '#dcd1ff',
    },
    button: {
        backgroundColor: 'rgba(0, 255, 255, 0.1)',
        border: '1px solid #00ffff',
        color: '#00ffff',
        padding: '12px 30px',
        borderRadius: '50px',
        cursor: 'pointer',
        fontSize: '1.1rem',
        transition: 'background-color 0.3s, box-shadow 0.3s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
    },
    symbols: {
        letterSpacing: '0.5em',
        fontSize: '1.5rem',
        marginBottom: '1rem',
        color: '#ff00ff',
    },
};


export default function AuthPage() {
    const [, setLocation] = useLocation();

    const handleBegin = () => {
        // Navigate to the questionnaire page or the next step in your auth flow
        setLocation('/questionnaire');
    };
    
    // Add hover effects via JS for inline styling
    const handleButtonHover = (e: React.MouseEvent<HTMLButtonElement>, enter: boolean) => {
        if (enter) {
            e.currentTarget.style.backgroundColor = 'rgba(0, 255, 255, 0.2)';
            e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 255, 255, 0.6)';
        } else {
            e.currentTarget.style.backgroundColor = 'rgba(0, 255, 255, 0.1)';
            e.currentTarget.style.boxShadow = 'none';
        }
    };


    return (
        <div style={styles.pageContainer}>
            <div style={styles.background} className="neon-background"></div>
            <div style={styles.frame} className="neon-frame">
                <h1 style={styles.title}>you are this moment</h1>
                <div style={styles.symbols}>
                    <span className="om-symbol">ॐ</span>
                    <span>@</span><span>@</span><span>@</span><span>@</span><span>@</span>
                    <span className="at-symbol">ੴ</span>
                </div>
                <h2 style={styles.sanskritTitle}>
                    <span>ஸ்ரீ ॥</span> a formulation of truth <span>॥ ஶ்ரீ</span>
                </h2>
                <p style={styles.description}>
                    A practice in self-inquiry, these questions invite upon users a reflective state of awareness. Persons' crafted responses (or a non-response!) betray something interior (அகம்) like idiosyncratic machinations this 'I' with which the subject vivivies the self, as such, a person and a formulation of truth.
                </p>

                <button 
                    style={styles.button} 
                    onClick={handleBegin}
                    onMouseEnter={(e) => handleButtonHover(e, true)}
                    onMouseLeave={(e) => handleButtonHover(e, false)}
                >
                    <span>✧</span>
                    Begin the questionnaire
                    <span>✧</span>
                </button>
            </div>
        </div>
    );
}
