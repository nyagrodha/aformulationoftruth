import React from 'react';

// The single, non-dual declaration of our styles
const styles = {
  container: { maxWidth: '750px', margin: '40px auto', padding: '0 20px', lineHeight: '1.7', color: '#ccc' },
  header: { textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '20px', marginBottom: '30px' },
  title: { fontSize: '2.5rem', margin: '0 0 10px 0', color: '#eee' },
  subtitle: { fontSize: '1.2rem', color: '#aaa', fontStyle: 'italic' },
  section: { marginBottom: '30px' },
  sectionTitle: { fontSize: '1.8rem', color: '#00ffff', borderBottom: '1px solid #00ffff', paddingBottom: '5px', marginBottom: '15px' },
  paragraph: { marginBottom: '15px', fontSize: '1.1rem' },
  link: { color: '#00ffff', textDecoration: 'none' }
};

export default function AboutPage() {
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>About This Project</h1>
        <p style={styles.subtitle}>A Formulation of Truth</p>
      </header>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>The Inquiry</h2>
        <p style={styles.paragraph}>
          The questionnaire is a digital meditation on the practice of self-enquiry (ātma-vicāra), a path illuminated by sages like Ramana Maharshi. It is not a test, but an invitation to turn consciousness inward and observe the nature of the "I"-thought.
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>The Technology</h2>
        <p style={styles.paragraph}>
          Built with a modern web stack, this project aims to create a serene and focused environment for reflection, proving that technology can be a vessel for introspection as much as it is for information.
        </p>
      </section>
    </div>
  );
}
