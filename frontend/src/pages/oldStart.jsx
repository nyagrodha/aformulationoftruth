import React, { useMemo, useState } from "react";

export default function Start() {
  const languages = useMemo(
    () => [
      { code: "en", label: "English" },
      { code: "hi", label: "हिन्दी" },
      { code: "ta", label: "தமிழ்" },
    ],
    []
  );

  const browserLang = (typeof navigator !== "undefined" ? navigator.language : "en")
    .split("-")[0]
    .toLowerCase();

  const [centerLang, setCenterLang] =
    useState(languages.find((l) => l.code === browserLang)?.code || "en");
  const center = languages.find((l) => l.code === centerLang) || languages[0];
  const around = languages.filter((l) => l.code !== center.code);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

  async function startLogin(e) {
  e.preventDefault();
  setStatus("Sending…");
  try {
    const res = await fetch("/api/auth/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",           // << send/receive cookie
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return setStatus(`Failed (${res.status}).`);
    setStatus("Check your inbox. Redirecting…");
    setTimeout(() => (window.location.href = "/questionnaire"), 150);
  } catch {
    setStatus("Network error.");
  }
}
  
  return (
    <main className="min-h-screen grid place-items-start md:place-items-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-bayOfBengal/25 bg-colonialCream text-monsoonEarth shadow-xl">
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
              aria-describedby="login-email-lang"
              className="w-full rounded-xl border-2 border-monsoonEarth/30 bg-colonialCream px-4 py-3 text-lg font-semibold text-monsoonEarth outline-none focus:border-sage focus:ring-2 focus:ring-sage/40"
            />

            {/* Center language badge */}
            <div
              id="login-email-lang"
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                         rounded-full border border-monsoonEarth/20 bg-white px-3 py-0.5 text-xs font-extrabold
                         text-monsoonEarth shadow"
              title="Browser language"
            >
              {center.label}
            </div>

            {/* Top badge */}
            {around[0] && (
              <button
                type="button"
                onClick={() => setCenterLang(around[0].code)}
                className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2
                           rounded-full border border-monsoonEarth/20 bg-white px-3 py-0.5 text-xs font-extrabold
                           text-monsoonEarth shadow hover:bg-marigold hover:text-monsoonEarth"
                aria-label={`Switch to ${around[0].label}`}
              >
                {around[0].label}
              </button>
            )}

            {/* Right badge */}
            {around[1] && (
              <button
                type="button"
                onClick={() => setCenterLang(around[1].code)}
                className="absolute right-1 top-1/2 -translate-y-1/2
                           rounded-full border border-monsoonEarth/20 bg-white px-3 py-0.5 text-xs font-extrabold
                           text-monsoonEarth shadow hover:bg-marigold hover:text-monsoonEarth"
                aria-label={`Switch to ${around[1].label}`}
              >
                {around[1].label}
              </button>
            )}
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

            {/* optional GET fallback if your backend supports it */}
            <a
              href="/api/auth/start"
              className="font-extrabold text-bayOfBengal underline-offset-4 hover:underline"
            >
            </a>
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

        <footer className="flex items-center justify-between flex-wrap gap-3 px-6 pb-6 text-sm font-bold text-bayOfBengal/80">
          <span>
            Palette:
            {" "}
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
