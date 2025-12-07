import { useState, useEffect } from 'react';
import { getStoredToken, formatRemainingTime, willExpireSoon, getTimeUntilExpiration } from '../utils/tokenUtils';

interface SessionIndicatorProps {
  onExpiringSoon?: () => void;
  warnThresholdMinutes?: number;
}

export default function SessionIndicator({
  onExpiringSoon,
  warnThresholdMinutes = 29
}: SessionIndicatorProps): JSX.Element | null {
  const [remainingTime, setRemainingTime] = useState<string>('');
  const [isExpiringSoon, setIsExpiringSoon] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    const updateRemainingTime = () => {
      const token = getStoredToken();

      if (!token) {
        setIsVisible(false);
        return;
      }

      const timeUntilExpiration = getTimeUntilExpiration(token);

      if (timeUntilExpiration <= 0) {
        setIsVisible(false);
        return;
      }

      setIsVisible(true);
      setRemainingTime(formatRemainingTime(token));

      const expiringSoon = willExpireSoon(token, warnThresholdMinutes);
      setIsExpiringSoon(expiringSoon);

      // Trigger callback when expiring soon (only once)
      if (expiringSoon && onExpiringSoon && !isExpiringSoon) {
        onExpiringSoon();
      }
    };

    // Update immediately
    updateRemainingTime();

    // Update every second
    const interval = setInterval(updateRemainingTime, 1000);

    return () => clearInterval(interval);
  }, [onExpiringSoon, warnThresholdMinutes, isExpiringSoon]);

  if (!isVisible) {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={{
        ...styles.indicator,
        ...(isExpiringSoon ? styles.indicatorWarning : styles.indicatorNormal)
      }}>
        <span style={styles.icon}>
          {isExpiringSoon ? '⚠️' : '🔒'}
        </span>
        <div style={styles.content}>
          <div style={styles.label}>Session</div>
          <div style={styles.time}>{remainingTime}</div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: 1000,
  },
  indicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.3s ease',
    cursor: 'default',
  },
  indicatorNormal: {
    backgroundColor: '#1a1a2e',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#ffffff',
  },
  indicatorWarning: {
    backgroundColor: '#f59e0b',
    border: '1px solid #d97706',
    color: '#ffffff',
    animation: 'pulse 2s ease-in-out infinite',
  },
  icon: {
    fontSize: '18px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  label: {
    fontSize: '11px',
    opacity: 0.8,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  time: {
    fontSize: '14px',
    fontWeight: '600',
  },
};

// Add keyframe animation for pulsing effect
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.9;
      transform: scale(1.02);
    }
  }
`;
document.head.appendChild(styleSheet);
