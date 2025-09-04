import React, { useEffect, useState } from "react";

export default function Verify() {
  const [msg, setMsg] = useState("Verifying…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      // Let backend set the cookie, then it will redirect to /questionnaire
      window.location.href = `/api/auth/verify?token=${encodeURIComponent(token)}`;
    } else {
      setMsg("No token found. Redirecting to login…");
      setTimeout(() => (window.location.href = "/login"), 900);
    }
  }, []);

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Verify</h1>
      <p>{msg}</p>
    </main>
  );
}
