import React, { useEffect, useState } from "react";

export default function Header() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => setUser(d.user || null))
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header style={{
      display:"flex",alignItems:"center",justifyContent:"space-between",
      padding:"0.75rem 1rem",borderBottom:"1px solid #222",background:"#0b0b0b",color:"#eee"
    }}>
      <a href="/" style={{textDecoration:"none",color:"#ffc891",fontWeight:800}}>a formulation of truth</a>
      <nav style={{display:"flex",gap:"1rem"}}>
        <a href="/about" style={{color:"#bbb"}}>About</a>
        <a href="/contact" style={{color:"#bbb"}}>Contact</a>
        <a href="/questionnaire" style={{color:"#bbb"}}>Questionnaire</a>
      </nav>
      <div>
        {user
          ? (<>
               <span style={{marginRight:8,opacity:.85}}>Signed in as {user.email}</span>
               <button onClick={logout} style={{border:"1px solid #0f0",background:"#111",color:"#0f0",borderRadius:8,padding:"0.35rem 0.6rem"}}>
                 Logout
               </button>
             </>)
          : <a href="/login" style={{color:"#9f9"}}>Login</a>}
      </div>
    </header>
  );
}
