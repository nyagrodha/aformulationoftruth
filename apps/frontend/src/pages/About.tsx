
import React from "react";

const styles: Record<string, React.CSSProperties> = {
  /* your style objects… */
};

export default function AboutPage() {
  return (
    <main style={styles.main}>
      {/* ... */}
    </main>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: '750px', margin: '40px auto', padding: '0 20px', lineHeight: '1.7', color: '#ccc' },
  header: { textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '20px', marginBottom: '30px' },
  title: { fontSize: '2.5rem', color: '#fff', fontWeight: 300 },
  subtitle: { fontSize: '1rem', color: '#888', fontStyle: 'italic' },
  quoteBlock: { borderLeft: '3px solid #00ffff', paddingLeft: '20px', margin: '40px 0', fontStyle: 'italic', color: '#999' },
  cite: { display: 'block', textAlign: 'right', marginTop: '10px', color: '#00ffff', fontStyle: 'normal' },
  paragraph: { marginBottom: '20px' },
};

export default function AboutPage() {
  return (
    <div style={styles.container}>
      <header style={styles.header}><h1 style={styles.title}>a formulation of truth</h1><p style={styles.subtitle}>a slow experiment: language, memory, and meaning</p></header>
      <p style={styles.paragraph}>This questionnaire is more than a collection of answers; it is an instrument for autochthonous excavation...</p>
      <blockquote style={styles.quoteBlock}><p>"The true picture of the past flits by..."</p><cite style={styles.cite}>— Walter Benjamin, Theses on the Philosophy of History</cite></blockquote>
      <p style={styles.paragraph}>Each question provokes such an image—seize upon it...</p>
      <blockquote style={styles.quoteBlock}><p>"Memory is not an instrument for exploring the past but its theater..."</p><cite style={styles.cite}>— Walter Benjamin, Berlin Childhood around 1900</cite></blockquote>
      <p style={styles.paragraph}>And yet, this truth is not always found in deliberate recollection...</p>
      <blockquote style={styles.quoteBlock}><p>"The unconscious is that chapter of my history which is marked by a blank..."</p><cite style={styles.cite}>— Jacques Lacan</cite></blockquote>
      <p style={styles.paragraph}>This act of translation exceeds a subjective view of time...</p>
      <blockquote style={styles.quoteBlock}><p>"The past is not something that has passed away..."</p><cite style={styles.cite}>— Abhinavagupta</cite></blockquote>
      <p style={styles.paragraph}>We invite you to step into this capacious theater...</p>
      <blockquote style={styles.quoteBlock}><p>"The storyteller takes what he tells from experience..."</p><cite style={styles.cite}>— Walter Benjamin, The Storyteller</cite></blockquote>
    </div>
  );
}
