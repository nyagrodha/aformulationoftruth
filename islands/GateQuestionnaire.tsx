/**
 * Gate Questionnaire Island
 *
 * A sequential gate experience for the first two Proust questions:
 * 1. "What is your idea of perfect happiness?" (Q0)
 * 2. "What is your greatest fear?" (Q1)
 *
 * After answering both, the user enters their email to receive a magic link.
 * Questions are presented one at a time (sequential, not stacked).
 *
 * Aesthetic: Lighter, more breathable than the main site.
 */

import { useState, useRef, useEffect } from 'preact/hooks';

interface GateQuestionnaireProps {
  onComplete?: (data: { email: string; answers: string[] }) => void;
}

type Stage = 'question0' | 'question1' | 'email' | 'sending' | 'success';

const QUESTIONS = [
  {
    number: '\u0BF0',
    text: 'What is your idea of perfect happiness?',
    placeholder: 'Take your time... you can return here, or switch to Telegram and respond, reflect or choose to write what initially comes about...',
  },
  {
    number: '\u0BF1',
    text: 'What is your greatest fear?',
    placeholder: '...or leave a question unanswered... but once submitted there is a period the webapp enforces at random. Should you elect to stay in contact via the newsletter you would also be notified when the questionnaire may be revisited...',
  },
];

export default function GateQuestionnaire({ onComplete }: GateQuestionnaireProps) {
  const [stage, setStage] = useState<Stage>('question0');
  const [answers, setAnswers] = useState<string[]>(['', '']);
  const [email, setEmail] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current && (stage === 'question0' || stage === 'question1')) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [stage]);

  const currentQuestionIndex = stage === 'question0' ? 0 : stage === 'question1' ? 1 : -1;

  const handleAnswerChange = (value: string) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = value;
    setAnswers(newAnswers);
  };

  const handleNext = () => {
    if (stage === 'question0') {
      setStage('question1');
    } else if (stage === 'question1') {
      setStage('email');
    }
  };

  const handleBack = () => {
    if (stage === 'question1') {
      setStage('question0');
    } else if (stage === 'email') {
      setStage('question1');
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setStatusMessage({ text: 'Please enter a valid email address', type: 'error' });
      return;
    }

    setStage('sending');
    setStatusMessage({ text: 'Securing your responses...', type: 'info' });

    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      setStatusMessage({ text: 'Requesting magic link...', type: 'info' });

      const response = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setStage('success');
        setStatusMessage({
          text: 'Check your inbox for your magic link to continue.',
          type: 'success',
        });
        onComplete?.({ email, answers });
      } else {
        throw new Error(data.error || 'Failed to send magic link');
      }
    } catch (error) {
      setStage('email');
      setStatusMessage({
        text: error instanceof Error ? error.message : 'Something went wrong.',
        type: 'error',
      });
    }
  };

  return (
    <div class="gate-wrapper">
      <style>{`
        .gate-wrapper {
          --soft-white: #f5f5f5;
          --muted-gray: #9a9a9a;
          --text-dark: #2a2a2a;
          --accent-rose: #d4a5a5;
          --accent-sage: #a5c4b8;
          --bg-cream: #faf9f7;
          --shadow-soft: rgba(0, 0, 0, 0.04);

          font-family: 'Space Mono', 'SF Mono', monospace;
          max-width: 540px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
          background: var(--bg-cream);
          color: var(--text-dark);
          min-height: 400px;
        }

        .progress-dots {
          display: flex;
          justify-content: center;
          gap: 0.75rem;
          margin-bottom: 2.5rem;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--muted-gray);
          opacity: 0.3;
          transition: all 0.3s ease;
        }

        .dot.active {
          opacity: 1;
          background: var(--accent-rose);
          transform: scale(1.2);
        }

        .dot.complete {
          opacity: 0.7;
          background: var(--accent-sage);
        }

        .gate-question {
          animation: fadeIn 0.4s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .question-label {
          display: block;
          font-size: 0.95rem;
          font-weight: 500;
          color: var(--text-dark);
          margin-bottom: 1rem;
          line-height: 1.6;
        }

        .question-number {
          display: inline-block;
          font-family: 'Noto Sans Tamil', sans-serif;
          color: var(--accent-rose);
          margin-right: 0.5rem;
          font-size: 1.1rem;
        }

        .question-textarea {
          width: 100%;
          min-height: 140px;
          padding: 1rem;
          font-family: inherit;
          font-size: 0.9rem;
          line-height: 1.7;
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 4px;
          color: var(--text-dark);
          resize: vertical;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .question-textarea:focus {
          outline: none;
          border-color: var(--accent-rose);
          box-shadow: 0 0 0 3px rgba(212, 165, 165, 0.15);
        }

        .question-textarea::placeholder {
          color: var(--muted-gray);
          font-size: 0.85rem;
          line-height: 1.6;
        }

        .question-nav {
          display: flex;
          justify-content: space-between;
          margin-top: 1.5rem;
          gap: 1rem;
        }

        .nav-btn {
          font-family: inherit;
          font-size: 0.75rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 0.75rem 1.5rem;
          border: 1px solid var(--muted-gray);
          background: transparent;
          color: var(--text-dark);
          cursor: pointer;
          transition: all 0.2s ease;
          border-radius: 2px;
        }

        .nav-btn:hover {
          background: var(--text-dark);
          color: white;
          border-color: var(--text-dark);
        }

        .back-btn {
          opacity: 0.6;
        }

        .back-btn:hover {
          opacity: 1;
        }

        .next-btn {
          margin-left: auto;
          background: var(--text-dark);
          color: white;
          border-color: var(--text-dark);
        }

        .next-btn:hover {
          background: var(--accent-sage);
          border-color: var(--accent-sage);
          color: var(--text-dark);
        }

        .skip-hint {
          font-size: 0.7rem;
          color: var(--muted-gray);
          text-align: center;
          margin-top: 1.5rem;
          font-style: italic;
        }

        .email-form {
          animation: fadeIn 0.4s ease;
        }

        .email-label {
          display: block;
          font-size: 0.85rem;
          color: var(--accent-sage);
          margin-bottom: 0.75rem;
          font-weight: 500;
        }

        .email-input {
          width: 100%;
          padding: 0.875rem 1rem;
          font-family: inherit;
          font-size: 0.9rem;
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 4px;
          color: var(--text-dark);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .email-input:focus {
          outline: none;
          border-color: var(--accent-sage);
          box-shadow: 0 0 0 3px rgba(165, 196, 184, 0.15);
        }

        .freemail-suggestions {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          margin-top: 1.25rem;
        }

        .freemail-box {
          flex: 1;
          padding: 0.75rem;
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.05);
          border-radius: 3px;
          text-align: center;
        }

        .freemail-box a {
          display: block;
          font-size: 0.75rem;
          color: var(--text-dark);
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s;
        }

        .freemail-box a:hover {
          color: var(--accent-rose);
        }

        .freemail-note {
          display: block;
          font-size: 0.65rem;
          color: var(--muted-gray);
          margin-top: 0.25rem;
        }

        .coming-soon {
          font-size: 0.65rem;
          color: var(--muted-gray);
          text-align: center;
          margin-top: 1rem;
          font-family: 'Courier New', monospace;
          letter-spacing: 0.02em;
        }

        .form-actions {
          display: flex;
          justify-content: space-between;
          margin-top: 1.75rem;
          gap: 1rem;
        }

        .submit-btn {
          flex: 1;
          font-family: inherit;
          font-size: 0.8rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          padding: 1rem 1.5rem;
          background: var(--text-dark);
          color: white;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          border-radius: 2px;
        }

        .submit-btn:hover:not(:disabled) {
          background: var(--accent-sage);
          color: var(--text-dark);
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .status-message {
          padding: 0.875rem;
          margin-top: 1rem;
          font-size: 0.8rem;
          text-align: center;
          border-radius: 3px;
        }

        .status-message.info {
          background: rgba(165, 196, 184, 0.15);
          color: var(--text-dark);
        }

        .status-message.success {
          background: rgba(165, 196, 184, 0.25);
          color: var(--text-dark);
        }

        .status-message.error {
          background: rgba(212, 165, 165, 0.2);
          color: #8b4545;
        }

        .encryption-note {
          font-size: 0.65rem;
          color: var(--muted-gray);
          text-align: center;
          margin-top: 1.5rem;
        }

        .encryption-note::before {
          content: '\\1F510';
          margin-right: 0.4rem;
        }

        .success-state {
          text-align: center;
          padding: 2rem 0;
          animation: fadeIn 0.4s ease;
        }

        .success-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 1.5rem;
          background: var(--accent-sage);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          color: white;
        }

        .success-title {
          font-size: 1.1rem;
          font-weight: 500;
          color: var(--text-dark);
          margin-bottom: 0.75rem;
        }

        .success-text {
          font-size: 0.85rem;
          color: var(--muted-gray);
          line-height: 1.6;
        }
      `}</style>

      <div class="progress-dots">
        <span class={`dot ${stage === 'question0' ? 'active' : answers[0] ? 'complete' : ''}`} />
        <span class={`dot ${stage === 'question1' ? 'active' : answers[1] ? 'complete' : ''}`} />
        <span class={`dot ${stage === 'email' || stage === 'sending' ? 'active' : stage === 'success' ? 'complete' : ''}`} />
      </div>

      {stage === 'question0' && (
        <div class="gate-question">
          <label class="question-label">
            <span class="question-number">{QUESTIONS[0].number}</span>
            {QUESTIONS[0].text}
          </label>
          <textarea
            ref={textareaRef}
            class="question-textarea"
            value={answers[0]}
            onInput={(e) => handleAnswerChange((e.target as HTMLTextAreaElement).value)}
            placeholder={QUESTIONS[0].placeholder}
            aria-label={QUESTIONS[0].text}
          />
          <div class="question-nav">
            <button type="button" class="nav-btn next-btn" onClick={handleNext}>
              Next
            </button>
          </div>
          <p class="skip-hint">You may answer now or skip ahead</p>
        </div>
      )}

      {stage === 'question1' && (
        <div class="gate-question">
          <label class="question-label">
            <span class="question-number">{QUESTIONS[1].number}</span>
            {QUESTIONS[1].text}
          </label>
          <textarea
            ref={textareaRef}
            class="question-textarea"
            value={answers[1]}
            onInput={(e) => handleAnswerChange((e.target as HTMLTextAreaElement).value)}
            placeholder={QUESTIONS[1].placeholder}
            aria-label={QUESTIONS[1].text}
          />
          <div class="question-nav">
            <button type="button" class="nav-btn back-btn" onClick={handleBack}>
              Back
            </button>
            <button type="button" class="nav-btn next-btn" onClick={handleNext}>
              Continue
            </button>
          </div>
          <p class="skip-hint">Skip if you prefer</p>
        </div>
      )}

      {(stage === 'email' || stage === 'sending') && (
        <form class="email-form" onSubmit={handleSubmit}>
          <label class="email-label">
            Enter your email to receive a magic link
          </label>
          <input
            type="email"
            class="email-input"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            placeholder="your@email.com"
            required
            autocomplete="email"
          />

          <div class="freemail-suggestions">
            <div class="freemail-box left">
              <a href="https://maildrop.cc" target="_blank" rel="noopener noreferrer">
                maildrop.cc
              </a>
              <span class="freemail-note">disposable inbox</span>
            </div>
            <div class="freemail-box right">
              <a href="https://guerrillamail.com" target="_blank" rel="noopener noreferrer">
                guerrillamail.com
              </a>
              <span class="freemail-note">temp email</span>
            </div>
          </div>
          <p class="coming-soon">coming soon: o/|/1.0|\|_|-|4t[dot]com</p>

          <div class="form-actions">
            <button type="button" class="nav-btn back-btn" onClick={handleBack}>
              Back
            </button>
            <button
              type="submit"
              class="submit-btn"
              disabled={stage === 'sending'}
            >
              {stage === 'sending' ? 'Sending...' : 'Continue to Questionnaire'}
            </button>
          </div>

          {statusMessage && (
            <div class={`status-message ${statusMessage.type}`}>
              {statusMessage.text}
            </div>
          )}

          <p class="encryption-note">
            Responses encrypted with age (X25519) before storage
          </p>
        </form>
      )}

      {stage === 'success' && (
        <div class="success-state">
          <div class="success-icon">✓</div>
          <h3 class="success-title">Magic link sent!</h3>
          <p class="success-text">
            Check your inbox for your magic link to continue the questionnaire.
          </p>
        </div>
      )}
    </div>
  );
}
