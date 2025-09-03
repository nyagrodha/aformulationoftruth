import { Link } from 'react-router-dom';
import { useTheme } from '../themeContext';

export default function Navbar() {
  const { theme, setTheme } = useTheme();

  return (
    <nav className="navbar">
      <ul>
        <li><Link to="/">Home</Link>நான் யார்?</li>
        <li><Link to="/proust">Proust Questionnaire</Link></li>
        <li><Link to="/about">About</Link></li>
        <li><Link to="/login">Login</Link></li>
      </ul>
      <div className="theme-switcher">
        <select value={theme} onChange={e => setTheme(e.target.value)}>
          <option value="light">☀️ Light</option>
          <option value="dark">🌙 Dark</option>
          <option value="neon">💡 Neon</option>
        </select>
      </div>
    </nav>
  );
}
