import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/api';

export default function Login(): JSX.Element {
  const [email, setEmail] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await api.post('/user/magic-link', { email });
      setMessage('✅ Check your inbox for the apotropaic link!');
    } catch {
      setMessage('❌ Something went wrong. Try again.');
    }
  };

  const beginQuestionnaire = (): void => {
    navigate('/questions');
  };

  return (
    <div className="landing-container">
      <div className="cosmic-background"></div>

      <div className="main-content">
        <div className="header-section">
          <h1 className="neon-title">A Formulation of Truth</h1>
          <div className="consciousness-meter"></div>
          <p className="description">
            A practice in self-enquiry — these questions invite upon users a reflective state of awareness.
            Persons' crafted responses betray something interior (அகம்) that vivify the subject,
            as such, a person and a formulation of truth.
          </p>
        </div>

        <div className="interactive-section">
          <button
            className="questionnaire-button neon-button"
            onClick={beginQuestionnaire}
            type="button"
          >
            <span className="diamond">◇</span>
            Begin the Questionnaire
            <span className="diamond">◇</span>
          </button>

          <div className="divider">
            <span>or</span>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <h3 className="form-title">Sign in with your apotropaic link</h3>
            <div className="input-container">
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="neon-input"
              />
            </div>
            <button type="submit" className="neon-button submit-button">
              Send Link 🔑
            </button>
            {message && <p className="message">{message}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
