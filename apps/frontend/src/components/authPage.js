import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLocation } from 'wouter';
// --- Styles ---
// Using an object for inline styles for simplicity and self-containment.
const styles = {
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
    const handleButtonHover = (e, enter) => {
        if (enter) {
            e.currentTarget.style.backgroundColor = 'rgba(0, 255, 255, 0.2)';
            e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 255, 255, 0.6)';
        }
        else {
            e.currentTarget.style.backgroundColor = 'rgba(0, 255, 255, 0.1)';
            e.currentTarget.style.boxShadow = 'none';
        }
    };
    return (_jsxs("div", { style: styles.pageContainer, children: [_jsx("div", { style: styles.background, className: "neon-background" }), _jsxs("div", { style: styles.frame, className: "neon-frame", children: [_jsx("h1", { style: styles.title, children: "you are this moment" }), _jsxs("div", { style: styles.symbols, children: [_jsx("span", { className: "om-symbol", children: "\u0950" }), _jsx("span", { children: "@" }), _jsx("span", { children: "@" }), _jsx("span", { children: "@" }), _jsx("span", { children: "@" }), _jsx("span", { children: "@" }), _jsx("span", { className: "at-symbol", children: "\u0A74" })] }), _jsxs("h2", { style: styles.sanskritTitle, children: [_jsx("span", { children: "\u0BB8\u0BCD\u0BB0\u0BC0 \u0965" }), " a formulation of truth ", _jsx("span", { children: "\u0965 \u0BB6\u0BCD\u0BB0\u0BC0" })] }), _jsx("p", { style: styles.description, children: "A practice in self-inquiry, these questions invite upon users a reflective state of awareness. Persons' crafted responses (or a non-response!) betray something interior (\u0B85\u0B95\u0BAE\u0BCD) like idiosyncratic machinations this 'I' with which the subject vivivies the self, as such, a person and a formulation of truth." }), _jsxs("button", { style: styles.button, onClick: handleBegin, onMouseEnter: (e) => handleButtonHover(e, true), onMouseLeave: (e) => handleButtonHover(e, false), children: [_jsx("span", { children: "\u2727" }), "Begin the questionnaire", _jsx("span", { children: "\u2727" })] })] })] }));
}
