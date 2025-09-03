import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <main className="landing">
      <h1>a formulation of truth</h1>
      <p>Begin with a magic link, then answer the questionnaire.</p>

      <div className="grid">
        <Link className="card" to="/questionnaire">Start Questionnaire</Link>
        <Link className="card" to="/about">About</Link>
        <Link className="card" to="/contact">Contact</Link>
        <Link className="card" to="/login">Login</Link>
      </div>
    </main>
  );

