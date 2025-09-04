import React from 'react';

// --- SVG Icons ---
// Using inline SVGs to avoid external dependencies.
const MailIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
    <polyline points="22,6 12,13 2,6"></polyline>
  </svg>
);

const LinkedinIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
    <rect x="2" y="9" width="4" height="12"></rect>
    <circle cx="4" cy="4" r="2"></circle>
  </svg>
);

const GithubIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
  </svg>
);

const KeyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
);


// --- Styles ---
const styles = {
  container: {
    maxWidth: '750px',
    margin: '40px auto',
    padding: '0 20px',
    lineHeight: '1.7',
    color: '#ccc',
    fontFamily: 'sans-serif',
  },
  header: {
    textAlign: 'center',
    borderBottom: '1px solid #333',
    paddingBottom: '20px',
    marginBottom: '30px',
  },
  title: {
    fontSize: '2.5rem',
    color: '#fff',
    fontWeight: '300',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#888',
    fontStyle: 'italic',
  },
  contactSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    marginBottom: '40px',
  },
  contactLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: '#ccc',
    textDecoration: 'none',
    fontSize: '1.1rem',
    transition: 'color 0.2s ease-in-out',
  },
};


export default function Contact() {
  
  // A simple hover effect managed with state
  const handleHover = (e, enter) => {
    e.currentTarget.style.color = enter ? '#00ffff' : '#ccc';
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Contact</h1>
        <p style={styles.subtitle}>Get in touch.</p>
      </header>

      <div style={styles.contactSection}>
        <a href="mailto:eachmomenteverydayur@aformulationoftruth.com" style={styles.contactLink} onMouseEnter={(e) => handleHover(e, true)} onMouseLeave={(e) => handleHover(e, false)}>
          <MailIcon /> youare@aformulationoftruth.com
        </a>
        <a href="https://linkedin.com/in/your-profile" target="_blank" rel="noopener noreferrer" style={styles.contactLink} onMouseEnter={(e) => handleHover(e, true)} onMouseLeave={(e) => handleHover(e, false)}>
          <LinkedinIcon /> LinkedIn Profile
        </a>
        <a href="https://github.com/nyagrodha" target="_blank" rel="noopener noreferrer" style={styles.contactLink} onMouseEnter={(e) => handleHover(e, true)} onMouseLeave={(e) => handleHover(e, false)}>
          <GithubIcon /> GitHub Profile
        </a>
         <a href="/pgp-key.asc" target="_blank" rel="noopener noreferrer" style={styles.contactLink} onMouseEnter={(e) => handleHover(e, true)} onMouseLeave={(e) => handleHover(e, false)}>
          <KeyIcon /> Public PGP Key
        </a>
      </div>
    </div>
  );
}
