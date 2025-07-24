import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav>
      {/* your existing links */}
      <Link to="/">Home</Link>
      <Link to="/questions">Questionnaire</Link>
      {/* … */}
    </nav>
  );
}

