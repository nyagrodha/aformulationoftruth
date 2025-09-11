import React from 'react';

// Basic styling for the component
const styles = {
  container: {
    maxWidth: '750px',
    margin: '40px auto',
    padding: '0 20px',
    lineHeight: '1.7',
    color: '#ccc',
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
  quoteBlock: {
    borderLeft: '3px solid #00ffff',
    paddingLeft: '20px',
    margin: '40px 0',
    fontStyle: 'italic',
    color: '#999',
  },
  cite: {
    display: 'block',
    textAlign: 'right',
    marginTop: '10px',
    color: '#00ffff',
    fontStyle: 'normal',
  },
  paragraph: {
    marginBottom: '20px',
  },
};

export default function About() {
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>a formulation of truth</h1>
        <p style={styles.subtitle}>a slow experiment: language, memory, and meaning</p>
      </header>

      <p style={styles.paragraph}>
        This questionnaire is more than a collection of answers; it is an instrument for autochthonous excavation. Truth resides in the reconstuction of events without precedent, in a world where nothing happens the same way twice. Where sense comes from the association of memories. Respondents, therefore, turn their gazes inward. The past is not a static record, but a living, fleeting landscape within.
      </p>

      <blockquote style={styles.quoteBlock}>
        <p>"The true picture of the past flits by. The past can be seized only as an image which flashes up at the instant when it can be recognized and is never seen again."</p>
        <cite style={styles.cite}>— Walter Benjamin, Theses on the Philosophy of History</cite>
      </blockquote>

      <p style={styles.paragraph}>
        Each question provokes some such image or another—seize upon it as it "flashes up at a moment of danger." The danger here is not external, but the internal risk of self-revelation. What is the self but a constellation of these fleeting images, a story told and retold?
      </p>

      <blockquote style={styles.quoteBlock}>
        <p>"Memory is not an instrument for exploring the past but its theater. It is the medium of past experience, as the ground is the medium in which dead cities lie interred."</p>
        <cite style={styles.cite}>— Walter Benjamin, Berlin Childhood around 1900</cite>
      </blockquote>
      
      <p style={styles.paragraph}>
        And yet, this truth is not always found in deliberate recollection. It often emerges unexpectedly, in a slip of the tongue or a forgotten detail that suddenly rushes to the forefront. These are the moments when the carefully constructed narrative of the self falters, and a deeper truth is allowed to speak.
      </p>

      <blockquote style={styles.quoteBlock}>
        <p>"The unconscious is that chapter of my history which is marked by a blank or occupied by a falsehood: it is the censored chapter. But this truth can be rediscovered; most often it has already been written down elsewhere... in slips of the tongue, in the jokes he tells."</p>
        <cite style={styles.cite}>— Jacques Lacan, The Function and Field of Speech and Language in Psychoanalysis</cite>
      </blockquote>

      <p style={styles.paragraph}>
        This act of translation exceeds a subjective view of time oriented linearly. The past is not a separate place, but a presence, re-cognized and remembered within the field of the present by a subject, I. Recognize this I, one's self, that name which is so well known as to be an identity. Allow it to be an absence that words alone create the possiblity for.
      </p>

      <blockquote style={styles.quoteBlock}>
        <p>"The past is not something that has passed away, but it is the very fabric of the present. Memory is not a recalling of what is gone, but a recognition (pratyabhijñā) of what has always been present in the heart of consciousness."</p>
        <cite style={styles.cite}>— Abhinavagupta, commentary on the Pratyabhijñāhṛdayam</cite>
      </blockquote>

      <p style={styles.paragraph}>
        We invite you to step into this capacious theater of consciousness, one's self-awareness. Answering is translating for to answer you become both archaeologist and storyteller, uncovering the interred experiences of your own. In this space, you are not merely recalling facts, but a formulation of truth that is uniquely yours and yet made from our self-same awareness 'I'.
      </p>
      <p style={styles.paragraph}>
      "Time passes, and little by little everything that we have spoken in falsehood becomes true used to tell this story about the origin of these questions. I could not tell you wherefrom I learned those 
       <blockquote style={styles.quoteBlock}>
        <p>"The storyteller takes what he tells from experience—his own or that reported by others. And he in turn makes it the experience of those who are listening to his tale."</p>
        <cite style={styles.cite}>— Walter Benjamin, The Storyteller</cite>
      </blockquote>

    </div>
  );
}
