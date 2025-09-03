// src/pages/Start.jsx
import React, { useEffect, useState } from "react";
import "../styles/glow.css"; // defines .glow-animate (keyframes)

export default function Start() {
  const [user, setUser] = useState(undefined);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

  // Static languages list (no useMemo needed)
  const languages = [
    { code: "en", label: "English" },
    { code: "hi", label: "हिन्दी" },
    { code: "es", label: "Español" },
    { code: "fr", label: "Français" },
    { code: "de", label: "Deutsch" },
  ];

  // Load session; if already signed in, you might redirect if desired
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => setUser(null));
  }, []);

  // Language chips
  const browserLang =
    (typeof navigator !== "undefined" ? navigator.language : "en")
      .split("-")[0]
      .toLowerCase();

  const [centerLang, setCenterLang] = useState(
    languages.find((l) => l.code === browserLang)?.code || "en"
  );
  const center = languages.find((l) => l.code === centerLang) || languages[0];
  const around = languages.filter((l) => l.code !== center.code);

  async function startLogin(e) {
    e.preventDefault();
    setStatus("Sending…");
    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // send/receive cookie
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setStatus(`Failed (${res.status}).`);
        return;
      }
      setStatus("Check your inbox. Redirecting…");
      setTimeout(() => (window.location.href = "/questionnaire"), 150);
    } catch {
      setStatus("Network error.");
    }
  }

  return (
    <main className="min-h-screen grid place-items-start md:place-items-center p-6">
      <div className="relative w-full max-w-xl rounded-2xl border border-bayOfBengal/25 bg-colonialCream text-monsoonEarth shadow-xl glow-animate">
        <header className="px-6 pt-6">
          <h1 className="m-0 text-3xl md:text-4xl font-extrabold tracking-tight">Login</h1>
          <p className="mt-2 mb-4 text-bayOfBengal/90 font-semibold">
            Enter your email to receive a link to login.
          </p>
        </header>

        <form onSubmit={startLogin} noValidate className="p-6 grid gap-4">
          <div className="relative">
            {/* Email input */}
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.org"
              className="w-full rounded-xl border-2 border-monsoonEarth/30 bg-colonialCream px-4 py-3 text-lg font-semibold text-monsoonEarth outline-none focus:border-sage focus:ring-2 focus:ring-sage/40"
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!email.trim()}
              className="rounded-xl bg-terracotta px-5 py-3 font-black text-colonialCream shadow
                         hover:bg-spicedCrimson disabled:opacity-60"
            >
              Send magic link
            </button>
          </div>

          {status && (
            <p
              className={`mt-1 font-extrabold ${
                status.startsWith("Check") ? "text-sage" : "text-bayOfBengal/90"
              }`}
              aria-live="polite"
            >
              {status}
            </p>
          )}
        </form>

        {/* Top-right language badge */}
        {center.label && (
          <div className="absolute top-0 right-0 transform -translate-y-1/2 translate-x-1/2 p-2">
            <span
              className="rounded-full bg-monsoonEarth px-3 py-0.5 text-xs font-extrabold text-white shadow"
              aria-label="Selected language"
            >
              {center.label}
            </span>
          </div>
        )}

        {/* Bottom-left switch badge */}
        {around[0] && (
          <button
            type="button"
            onClick={() => setCenterLang(around[0].code)}
            className="absolute bottom-0 left-0 transform translate-y-1/2 -translate-x-1/2 p-2
                       rounded-full bg-monsoonEarth px-3 py-0.5 text-xs font-extrabold text-white shadow
                       hover:bg-marigold hover:text-monsoonEarth"
            aria-label={`Switch to ${around[0].label}`}
          >
            {around[0].label}
          </button>
        )}

        <footer className="flex items-center justify-between flex-wrap gap-3 px-6 pb-6 text-sm font-bold text-bayOfBengal/80">
          <span>
            Palette:{" "}
            <span className="text-marigold">Marigold</span>,{" "}
            <span className="text-terracotta">Terracotta</span>,{" "}
            <span className="text-sage">Sage</span>,{" "}
            <span className="text-bayOfBengal">Bay of Bengal</span>,{" "}
            <span className="text-spicedCrimson">Spiced Crimson</span>,{" "}
            <span className="text-monsoonEarth">Monsoon Earth</span>
          </span>
        </footer>
      </div>
    </main>
  );
}
