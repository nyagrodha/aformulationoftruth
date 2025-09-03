import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/10">
        <Link to="/" className="text-lg font-semibold">a formulation of truth</Link>
        <nav className="flex gap-6 text-sm">
          <Link to="/about" className="opacity-90 hover:opacity-100">about</Link>
          <Link to="/contact" className="opacity-90 hover:opacity-100">contact</Link>
        </nav>
      </header>
      <main className="px-6 py-10 relative">{children}</main>
      <footer className="px-6 py-10 opacity-70 text-sm border-t border-white/10">
        © {new Date().getFullYear()} aformulationoftruth.com
      </footer>
    </div>
  );
}

function Landing() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl text-center">
      <h1 className="text-3xl md:text-5xl font-bold tracking-tight">a formulation of truth</h1>
      <p className="mt-3 text-zinc-300">Welcome. When ready, click proceed.</p>

      {/* Circular Proceed Button */}
      <button
        onClick={() => navigate("/questionnaire")}
        className="mt-10 inline-grid place-items-center rounded-full w-40 h-40 border border-white/20 shadow-[0_10px_60px_rgba(255,255,255,0.06)] hover:shadow-[0_10px_80px_rgba(255,255,255,0.12)] transition"
        aria-label="Proceed"
      >
        <span className="text-lg font-semibold">Proceed</span>
      </button>
    </div>
  );
}

function About() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-2xl font-semibold">about</h2>
      <p className="text-zinc-300">
        Hosting, maintenance, and development of this website cost real time and money.
        If this work benefits you, any support is deeply appreciated.
      </p>

      <div className="grid gap-3">
        <div className="rounded-lg border border-white/10 p-4">
          <div className="text-sm uppercase opacity-70">Zcash</div>
          <code className="break-all text-zinc-200">t1QwR9aNRXAdSeKtZZ4ctYTFNNbSXkrNA4d</code>
        </div>
        <div className="rounded-lg border border-white/10 p-4">
          <div className="text-sm uppercase opacity-70">Ethereum</div>
          <code className="break-all text-zinc-200">0x29C9221d8C13CAb35190a9bcF7436357516e3308</code>
        </div>
      </div>
    </div>
  );
}

function Contact() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle"|"ok"|"err"|"loading">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email })
      });
      setStatus(r.ok ? "ok" : "err");
    } catch {
      setStatus("err");
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h2 className="text-2xl font-semibold mb-4">Stay in touch</h2>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full rounded-md bg-zinc-900 border border-white/10 px-3 py-2 outline-none focus:border-white/20"
        />
        <button
          disabled={status === "loading"}
          className="px-4 py-2 rounded-md border border-white/10 hover:border-white/20"
        >
          {status === "loading" ? "Sending…" : "Send"}
        </button>
        {status === "ok" && <p className="text-emerald-400">Thanks—we’ll be in touch.</p>}
        {status === "err" && <p className="text-rose-400">Something went wrong. Try again.</p>}
      </form>
    </div>
  );
}

function Questionnaire() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState("");
  const [status, setStatus] = useState<"idle"|"submitting"|"ok"|"err">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("submitting");
    try {
      const r = await fetch("/api/questionnaire/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, answers: { text: answers } })
      });
      if (!r.ok) throw new Error("submit failed");
      await fetch("/api/me", { credentials: "include" });
      setStatus("ok");
      setTimeout(() => navigate("/thanks"), 900);
    } catch (e) {
      setStatus("err");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-2xl font-semibold text-center">Questionnaire</h2>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm mb-1 opacity-80">Email</label>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md bg-zinc-900 border border-white/10 px-3 py-2 outline-none focus:border-white/20"
          />
        </div>
        <div>
          <label className="block text-sm mb-1 opacity-80">Your response</label>
          <textarea
            rows={6}
            placeholder="Write anything you'd like to share…"
            value={answers}
            onChange={(e) => setAnswers(e.target.value)}
            className="w-full rounded-md bg-zinc-900 border border-white/10 px-3 py-2 outline-none focus:border-white/20"
          />
        </div>
        <button
          disabled={status === "submitting"}
          className="px-4 py-2 rounded-md border border-white/10 hover:border-white/20"
        >
          {status === "submitting" ? "Submitting…" : "Submit"}
        </button>
        {status === "ok" && <p className="text-emerald-400">Thanks — redirecting…</p>}
        {status === "err" && <p className="text-rose-400">Something went wrong. Please try again.</p>}
      </form>
    </div>
  );
}

function ThankYou() {
  const navigate = useNavigate();
  const [seconds, setSeconds] = useState(15);

  useEffect(() => {
    const interval = setInterval(() => setSeconds(s => s - 1), 1000);
    const t = setTimeout(() => navigate("/"), 15000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [navigate]);

  return (
    <div className="mx-auto max-w-xl text-center">
      <h2 className="text-3xl font-semibold">Thank you!</h2>
      <p className="mt-3 opacity-80">Your submission has been received. You will be redirected to the home page shortly.</p>
      <p className="mt-2 opacity-60">(about 15 seconds)</p>
      <span className="fixed bottom-3 left-3 text-xs opacity-60">Redirecting in {seconds}s</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/questionnaire" element={<Questionnaire />} />
          <Route path="/thanks" element={<ThankYou />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
