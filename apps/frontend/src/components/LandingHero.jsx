import { Link } from "react-router-dom";
import "./landing.css";

export default function LandingHero() {
  return (
    <section className="hero">
      <h1 className="hero-title">you are this moment</h1>
      <div className="oms" aria-hidden="true">
        <span className="om sup">ஓம்</span>
        <span className="at">@</span>
        <span className="om sub">ॐ</span>
        <span className="at">@</span>
        <span className="irendu">&#3048;</span>
        <span className="at">@</span>
        <span className="om sup">ஓம்</span>
        <span className="at">@</span>
        <span className="om sub">ॐ</span>
      </div>
       <div className="lockup">
         <div className="lockup-center">|| a formulation of truth ||</div>
         <div className="lockup-tamil">உண்மையை சூத்திரம்</div>
         <div className="lockup-ukr">
           формулювання істини
          <span className="flag-ua" role="img" aria-label="Ukraine flag" />
         </div>
       </div>
            <p>A practice in self-inquiry these questions invite upon users a reflective state of awareness. Persons' crafted responses (or a non-response!) reveal something interior (அகம்)--the idiosyncratic machinations that vivify oneself, as such, a person and a formulation of truth. It has been said that beauty brings a promise of happiness, but it could be otherwise that the possibility of joy is the beginning of beauty. So have fun and, if you wish, share what you create so joy may ever await you.</p>
      
{/* grid of links */}
        <div className="grid">
          <Link className="card" to="/questionnaire">
            Welcome. Click here to enter the site.
          </Link>
          <Link className="card" to="/about">About</Link>
          <Link className="card" to="/contact">Contact</Link>
          <Link className="card" to="/login">Login</Link>
        </div>
      </div>
    </section>
  );
}
