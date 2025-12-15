import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface Response {
  question: string;
  answer: string;
  question_id: number;
  created_at: string;
}

interface UserProfile {
  id: number;
  email: string;
  display_name: string;
  profile_visibility: 'public' | 'private';
  completed_at: string | null;
  total_questions_answered: number;
  profile_slug: string;
}

interface ProfileData {
  user: UserProfile;
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
  },
  badgeComplete: {
    backgroundColor: 'rgba(0, 255, 100, 0.2)',
    border: '1px solid #00ff64',
    color: '#00ff64',
  },
  badgeIncomplete: {
    backgroundColor: 'rgba(255, 200, 0, 0.2)',
    border: '1px solid #ffc800',
    color: '#ffc800',
  },
  visibilitySection: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: '20px',
    borderRadius: '10px',
    marginBottom: '30px',
  },
  toggle: {
    display: 'flex',
    gap: '10px',
    marginTop: '15px',
  },
  toggleButton: {
    padding: '10px 20px',
    borderRadius: '25px',
    border: '1px solid #00ffff',
    backgroundColor: 'transparent',
    color: '#00ffff',
    cursor: 'pointer',
    transition: 'all 0.3s',
  },
  toggleButtonActive: {
    backgroundColor: '#00ffff',
    color: '#0f0c29',
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
  shareLink: {
    backgroundColor: 'rgba(0, 255, 255, 0.1)',
    padding: '15px',
    borderRadius: '10px',
    marginTop: '10px',
    fontSize: '0.95rem',
    wordBreak: 'break-all',
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
    marginRight: '10px',
  },
  loading: {
    textAlign: 'center' as const,
    padding: '40px',
    fontSize: '1.2rem',
  },
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await api.get('/api/profile');
      setProfileData(response.data);
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateVisibility = async (visibility: 'public' | 'private') => {
    setUpdatingVisibility(true);
    try {
      await api.patch('/api/profile/visibility', { visibility });
      setProfileData(prev => prev ? {
        ...prev,
        user: { ...prev.user, profile_visibility: visibility }
      } : null);
    } catch (err) {
      console.error('Failed to update visibility:', err);
    } finally {
      setUpdatingVisibility(false);
    }
  };

  const copyProfileLink = () => {
    const link = `${window.location.origin}/u/${profileData?.user.profile_slug}`;
    navigator.clipboard.writeText(link);
    alert('Profile link copied to clipboard!');
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading your profile...</div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Profile not found</div>
      </div>
    );
  }

  const { user, responses, isComplete } = profileData;
  const visibility = user.profile_visibility;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>Your Profile</h1>
          <p style={styles.subtitle}>{user.display_name}</p>
          <p style={{ ...styles.subtitle, fontSize: '0.9rem' }}>{user.email}</p>
          <div style={isComplete ? { ...styles.badge, ...styles.badgeComplete } : { ...styles.badge, ...styles.badgeIncomplete }}>
            {isComplete ? `✓ Completed all 35 questions` : `${user.total_questions_answered}/35 questions answered`}
          </div>
        </div>

        <div style={styles.visibilitySection}>
          <h3 style={{ marginBottom: '10px', color: '#00ffff' }}>Profile Visibility</h3>
          <p style={{ fontSize: '0.95rem', color: '#dcd1ff', marginBottom: '15px' }}>
            Choose whether others can view your responses
          </p>
          <div style={styles.toggle}>
            <button
              style={{
                ...styles.toggleButton,
                ...(visibility === 'private' ? styles.toggleButtonActive : {})
              }}
              onClick={() => updateVisibility('private')}
              disabled={updatingVisibility}
            >
              🔒 Private
            </button>
            <button
              style={{
                ...styles.toggleButton,
                ...(visibility === 'public' ? styles.toggleButtonActive : {})
              }}
              onClick={() => updateVisibility('public')}
              disabled={updatingVisibility}
            >
              🌐 Public
            </button>
          </div>
          {visibility === 'public' && (
            <div style={styles.shareLink}>
              <strong>Your public profile:</strong>
              <br />
              {window.location.origin}/u/{user.profile_slug}
              <br />
              <button style={{ ...styles.button, marginTop: '10px' }} onClick={copyProfileLink}>
                📋 Copy Link
              </button>
            </div>
          )}
        </div>

        <div style={styles.responsesSection}>
          <h3 style={{ marginBottom: '20px', color: '#00ffff', fontSize: '1.8rem' }}>
            Your Responses ({responses.length})
          </h3>
          {responses.length === 0 ? (
            <p style={{ color: '#dcd1ff', textAlign: 'center', padding: '40px' }}>
              You haven't answered any questions yet.
              <br />
              <button
                style={{ ...styles.button, marginTop: '20px' }}
                onClick={() => navigate('/questionnaire')}
              >
                Start Questionnaire
              </button>
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

        <div style={{ marginTop: '40px', textAlign: 'center' }}>
          <button style={styles.button} onClick={() => navigate('/questionnaire')}>
            {isComplete ? 'Review Answers' : 'Continue Questionnaire'}
          </button>
          <button style={styles.button} onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
