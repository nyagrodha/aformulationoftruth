import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function ThankYou() {
  const navigate = useNavigate();
  const [left, setLeft] = useState(15);

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    const r = setTimeout(() => navigate("/"), 15000);
    return () => { clearInterval(t); clearTimeout(r); };
  }, [navigate]);

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:"2rem"}}>
      <div style={{textAlign:"center"}}>
        <h1>Thank you.</h1>
        <p>You’ll be redirected to the home page in {left}s.</p>
        <p><Link to="/">Go now</Link></p>
      </div>
    </main>
  );
}
