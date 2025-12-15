import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

type ReactionType = 'thoughtful' | 'insightful' | 'resonates' | 'beautiful' | 'profound' | 'curious' | 'appreciate';
type TargetType = 'response' | 'comment';

interface ReactionSummary {
  reaction_type: ReactionType;
  count: number;
  user_reacted: boolean;
}

interface ReactionsData {
  reactions: ReactionSummary[];
  total: number;
  user_reaction: ReactionType | null;
}

interface ReactionPickerProps {
  targetType: TargetType;
  targetId: number;
  currentUserId?: number;
  compact?: boolean;
}

const REACTION_CONFIG: Record<ReactionType, { emoji: string; label: string; color: string }> = {
  thoughtful: { emoji: '💭', label: 'Thoughtful', color: '#9370db' },
  insightful: { emoji: '💡', label: 'Insightful', color: '#ffc107' },
  resonates: { emoji: '🎯', label: 'Resonates', color: '#ff5722' },
  beautiful: { emoji: '✨', label: 'Beautiful', color: '#e91e63' },
  profound: { emoji: '🌟', label: 'Profound', color: '#00bcd4' },
  curious: { emoji: '🤔', label: 'Curious', color: '#8bc34a' },
  appreciate: { emoji: '🙏', label: 'Appreciate', color: '#795548' }
};

const ReactionPicker: React.FC<ReactionPickerProps> = ({
  targetType,
  targetId,
  currentUserId,
  compact = false
}) => {
  const [reactionsData, setReactionsData] = useState<ReactionsData>({
    reactions: [],
    total: 0,
    user_reaction: null
  });
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchReactions();
  }, [targetType, targetId]);

  const fetchReactions = async () => {
    try {
      const endpoint = targetType === 'response' ? 'responses' : 'comments';
      const response = await api.get(`/api/${endpoint}/${targetId}/reactions`);
      setReactionsData(response.data);
    } catch (error) {
      console.error('Failed to fetch reactions:', error);
    }
  };

  const handleReaction = async (reactionType: ReactionType) => {
    if (!currentUserId) {
      alert('Please sign in to react');
      return;
    }

    setLoading(true);
    try {
      // If clicking the same reaction, remove it
      if (reactionsData.user_reaction === reactionType) {
        await api.delete(`/api/reactions/${targetType}/${targetId}`);
        await fetchReactions();
      } else {
        // Add or change reaction
        await api.post('/api/reactions', {
          target_type: targetType,
          target_id: targetId,
          reaction_type: reactionType
        });
        await fetchReactions();
      }
      setShowPicker(false);
    } catch (error) {
      console.error('Failed to update reaction:', error);
      alert('Failed to update reaction. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getMostCommonReactions = () => {
    return reactionsData.reactions
      .sort((a, b) => b.count - a.count)
      .slice(0, compact ? 3 : 5);
  };

  if (compact) {
    // Compact view: show only top reactions and total
    const topReactions = getMostCommonReactions();

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
        {topReactions.map(reaction => (
          <button
            key={reaction.reaction_type}
            onClick={() => handleReaction(reaction.reaction_type)}
            disabled={loading || !currentUserId}
            style={{
              background: reaction.user_reacted ? 'rgba(0, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
              border: reaction.user_reacted ? '1px solid #00ffff' : '1px solid transparent',
              borderRadius: '16px',
              padding: '4px 10px',
              cursor: currentUserId ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.9rem',
              transition: 'all 0.2s'
            }}
            title={REACTION_CONFIG[reaction.reaction_type].label}
          >
            <span>{REACTION_CONFIG[reaction.reaction_type].emoji}</span>
            <span style={{ color: '#dcd1ff', fontSize: '0.85rem' }}>
              {reaction.count}
            </span>
          </button>
        ))}

        {currentUserId && (
          <button
            onClick={() => setShowPicker(!showPicker)}
            style={{
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid #00ffff',
              borderRadius: '16px',
              padding: '4px 10px',
              cursor: 'pointer',
              color: '#00ffff',
              fontSize: '1.2rem'
            }}
            title="React"
          >
            +
          </button>
        )}

        {showPicker && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '8px',
            backgroundColor: 'rgba(10, 0, 30, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '2px solid #00ffff',
            borderRadius: '12px',
            padding: '12px',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
            minWidth: '240px'
          }}>
            {Object.entries(REACTION_CONFIG).map(([type, config]) => (
              <button
                key={type}
                onClick={() => handleReaction(type as ReactionType)}
                disabled={loading}
                style={{
                  background: reactionsData.user_reaction === type ? 'rgba(0, 255, 255, 0.2)' : 'transparent',
                  border: reactionsData.user_reaction === type ? '1px solid #00ffff' : '1px solid transparent',
                  borderRadius: '8px',
                  padding: '8px',
                  cursor: 'pointer',
                  fontSize: '1.5rem',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title={config.label}
              >
                <span>{config.emoji}</span>
                <span style={{ fontSize: '0.7rem', color: '#888' }}>{config.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full view: show all reactions with counts
  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        {Object.entries(REACTION_CONFIG).map(([type, config]) => {
          const reaction = reactionsData.reactions.find(r => r.reaction_type === type);
          const count = reaction?.count || 0;
          const userReacted = reaction?.user_reacted || false;

          return (
            <button
              key={type}
              onClick={() => handleReaction(type as ReactionType)}
              disabled={loading || !currentUserId}
              style={{
                background: userReacted ? 'rgba(0, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                border: userReacted ? '2px solid #00ffff' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '20px',
                padding: '8px 16px',
                cursor: currentUserId ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                opacity: !currentUserId ? 0.6 : 1
              }}
              title={currentUserId ? config.label : 'Sign in to react'}
            >
              <span style={{ fontSize: '1.2rem' }}>{config.emoji}</span>
              <span style={{ color: '#dcd1ff', fontWeight: userReacted ? 600 : 400 }}>
                {config.label}
              </span>
              {count > 0 && (
                <span style={{
                  backgroundColor: userReacted ? '#00ffff' : 'rgba(255, 255, 255, 0.2)',
                  color: userReacted ? '#000' : '#fff',
                  borderRadius: '12px',
                  padding: '2px 8px',
                  fontSize: '0.85rem',
                  fontWeight: 600
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {reactionsData.total > 0 && (
        <div style={{ color: '#888', fontSize: '0.9rem' }}>
          {reactionsData.total} {reactionsData.total === 1 ? 'reaction' : 'reactions'}
        </div>
      )}

      {!currentUserId && (
        <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(0, 0, 0, 0.2)', borderRadius: '8px' }}>
          <a href="/login" style={{ color: '#00ffff', textDecoration: 'none' }}>
            Sign in to react
          </a>
        </div>
      )}
    </div>
  );
};

export default ReactionPicker;
