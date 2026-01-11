import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';

interface Response {
  question: string;
  answer: string;
  question_id: number;
}

interface PublicUser {
  display_name: string;
  completed_at: string | null;
  total_questions_answered: number;
  profile_slug: string;
}

interface PublicProfileData {
  user: PublicUser;
  responses: Response[];
  isComplete: boolean;
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(-45deg, #0f0c29, #302b63, #24243e, #1a1a2e)',
    padding: '40px 20px',
    fontFamily: "'EB Garamond', serif",
  },
  card: {
    maxWidth: '900px',
    margin: '0 auto',
    backgroundColor: 'rgba(10, 0, 30, 0.8)',
    backdropFilter: 'blur(10px)',
    borderRadius: '20px',
    padding: '40px',
    color: '#f0e6ff',
    border: '2px solid #00ffff',
  },
  header: {
    borderBottom: '1px solid rgba(0, 255, 255, 0.3)',
    paddingBottom: '20px',
    marginBottom: '30px',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '2.5rem',
    marginBottom: '10px',
    color: '#00ffff',
  },
  subtitle: {
    fontSize: '1.1rem',
    color: '#dcd1ff',
    marginBottom: '5px',
  },
  badge: {
    display: 'inline-block',
    padding: '5px 15px',
    borderRadius: '20px',
    fontSize: '0.9rem',
    marginTop: '10px',
    backgroundColor: 'rgba(0, 255, 100, 0.2)',
    border: '1px solid #00ff64',
    color: '#00ff64',
  },
  responsesSection: {
    marginTop: '30px',
  },
  responseItem: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: '20px',
    borderRadius: '10px',
    marginBottom: '15px',
    borderLeft: '3px solid #00ffff',
  },
  question: {
    fontSize: '1.1rem',
    fontWeight: 500,
    color: '#00ffff',
    marginBottom: '10px',
  },
  answer: {
    fontSize: '1rem',
    lineHeight: 1.6,
    color: '#dcd1ff',
  },
  button: {
    padding: '10px 20px',
    borderRadius: '25px',
    border: '1px solid #00ffff',
    backgroundColor: 'rgba(0, 255, 255, 0.1)',
    color: '#00ffff',
    cursor: 'pointer',
    fontSize: '1rem',
    transition: 'all 0.3s',
  },
  loading: {
    textAlign: 'center' as const,
    padding: '40px',
    fontSize: '1.2rem',
  },
  error: {
    textAlign: 'center' as const,
    padding: '40px',
    fontSize: '1.2rem',
    color: '#ff7b7b',
  },
  footer: {
    marginTop: '40px',
    paddingTop: '20px',
    borderTop: '1px solid rgba(0, 255, 255, 0.3)',
    textAlign: 'center' as const,
  },
};

export default function PublicProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState<PublicProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicProfile();
  }, [slug]);

  const fetchPublicProfile = async () => {
    try {
      const response = await api.get(`/api/u/${slug}`);
      setProfileData(response.data);
    } catch (err: any) {
      console.error('Failed to fetch public profile:', err);
      setError(err.response?.data?.error || 'Profile not found');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading profile...</div>
      </div>
    );
  }

  if (error || !profileData) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.error}>
            {error || 'Profile not found'}
            <br />
            <p style={{ fontSize: '0.9rem', marginTop: '20px' }}>
              This profile may be private or does not exist.
            </p>
            <button style={{ ...styles.button, marginTop: '20px' }} onClick={() => navigate('/')}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { user, responses, isComplete } = profileData;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>{user.display_name}'s Responses</h1>
          <p style={styles.subtitle}>
            A Formulation of Truth - Proust Questionnaire
          </p>
          {isComplete && (
            <div style={styles.badge}>
              ✓ Completed all 35 questions
            </div>
          )}
          {user.completed_at && (
            <p style={{ ...styles.subtitle, fontSize: '0.85rem', marginTop: '10px' }}>
              Completed on {new Date(user.completed_at).toLocaleDateString()}
            </p>
          )}
        </div>

        <div style={styles.responsesSection}>
          <h3 style={{ marginBottom: '20px', color: '#00ffff', fontSize: '1.8rem' }}>
            Responses ({responses.length})
          </h3>
          {responses.length === 0 ? (
            <p style={{ color: '#dcd1ff', textAlign: 'center', padding: '40px' }}>
              No responses available yet.
            </p>
          ) : (
            responses.map((response, index) => (
              <div key={index} style={styles.responseItem}>
                <div style={styles.question}>
                  Q{response.question_id}: {response.question}
                </div>
                <div style={styles.answer}>{response.answer}</div>
              </div>
            ))
          )}
        </div>

        <div style={styles.footer}>
          <p style={{ color: '#dcd1ff', marginBottom: '15px' }}>
            Inspired by Marcel Proust's questionnaire
          </p>
          <button style={styles.button} onClick={() => navigate('/')}>
            Create Your Own
          </button>
        </div>
      </div>
    </div>
  );
}
