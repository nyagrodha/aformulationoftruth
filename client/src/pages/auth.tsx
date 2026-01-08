import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

type AuthStatus = "idle" | "sending" | "sent" | "error" | "verifying";

export default function AuthPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newsletterError, setNewsletterError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [newsletterSuccess, setNewsletterSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  const verifyToken = useCallback(
    async (token: string) => {
      setStatus("verifying");
      setErrorMessage(null);
      setInfoMessage("Verifying your link...");

      try {
        const response = await fetch("/api/auth/magic-link/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({ message: "Failed to verify magic link" }));
          throw new Error(body.message || "Failed to verify magic link");
        }

        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        setStatus("sent");
        setInfoMessage("Authentication complete. Redirecting...");

        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        url.searchParams.delete("portal");
        window.history.replaceState({}, "", url.toString());

        setTimeout(() => {
          setLocation("/auth-callback");
        }, 800);
      } catch (error) {
        setStatus("error");
        setInfoMessage(null);

        const message = error instanceof Error ? error.message : "Failed to verify magic link";
        setErrorMessage(message);

        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        url.searchParams.delete("portal");
        window.history.replaceState({}, "", url.toString());
      }
    },
    [queryClient, setLocation],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      verifyToken(token);
    }
  }, [verifyToken]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("portal") === "1") {
      setInfoMessage("The portal hums softly—enter your email to proceed.");
      params.delete("portal");

      if (!params.get("token")) {
        const newSearch = params.toString();
        const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
        window.history.replaceState({}, "", newUrl);
      }
    }
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!email) {
      setErrorMessage("Please enter an email address.");
      return;
    }

    setStatus("sending");
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: "Failed to send magic link" }));
        throw new Error(body.message || "Failed to send magic link");
      }

      setStatus("sent");
      setInfoMessage("Check your email for the apotropaic link to continue.");
    } catch (error) {
      setStatus("error");
      const message = error instanceof Error ? error.message : "Failed to send magic link";
      setErrorMessage(message);
    }
  };

  const handleNewsletterSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!newsletterEmail) {
      setNewsletterError("Please enter an email address.");
      return;
    }

    setNewsletterStatus("sending");
    setNewsletterError(null);
    setNewsletterSuccess(null);

    try {
      const response = await fetch("/api/newsletter/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newsletterEmail }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: "Failed to subscribe to newsletter" }));
        throw new Error(body.message || "Failed to subscribe to newsletter");
      }

      setNewsletterStatus("sent");
      setNewsletterSuccess("Successfully subscribed to the newsletter!");
      setNewsletterEmail("");
    } catch (error) {
      setNewsletterStatus("error");
      const message = error instanceof Error ? error.message : "Failed to subscribe to newsletter";
      setNewsletterError(message);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen overflow-hidden flex items-center justify-center neon-background"
      style={{
        background: `
          radial-gradient(circle at 20% 20%, rgba(0, 255, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 80% 80%, rgba(255, 0, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 40% 60%, rgba(148, 0, 211, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 70% 30%, rgba(0, 255, 255, 0.05) 0%, transparent 60%),
          #8B4513
        `,
      }}
    >
      <div
        className="relative px-12 py-8 neon-frame"
        style={{
          background: "rgba(212, 175, 55, 0.8)",
          border: "12px solid #8B4513",
          borderRadius: "16px",
          boxShadow: `
            0 0 20px #00ffff,
            inset 0 0 15px #ff00ff,
            0 0 30px #9400d3
          `,
        }}
      >
        <div className="text-center mb-6">
          <span
            className="block lowercase text-5xl"
            style={{
              fontFamily: '"Playfair Display", serif',
              color: "#111",
              textShadow: `
                0 0 8px #00ffff,
                0 0 12px #ff00ff,
                0 0 4px rgba(0, 255, 255, 0.8),
                0 0 8px rgba(255, 0, 255, 0.8)
              `,
            }}
          >
            you are this moment
          </span>

          <div className="my-3 text-3xl leading-none overflow-hidden">
            {Array.from({ length: 16 }, (_, i) => (
              <span
                key={i}
                className={i % 2 === 0 ? "om-symbol" : "at-symbol"}
                style={{ animationDelay: `${i * 0.2}s` }}
              >
                {i % 2 === 0 ? "ॐ" : "@"}
              </span>
            ))}
          </div>

          <span
            className="block lowercase text-5xl mt-2"
            style={{
              fontFamily: '"Playfair Display", serif',
              color: "#111",
              textShadow: `
                0 0 8px #00ffff,
                0 0 12px #ff00ff,
                0 0 4px rgba(0, 255, 255, 0.8),
                0 0 8px rgba(255, 0, 255, 0.8)
              `,
            }}
          >
            ஸ்ரீ ॥ a formulation of truth ॥ ശ്രീ
          </span>
        </div>

        <p
          className="text-lg leading-relaxed max-w-2xl mx-auto mb-12 font-light text-center text-[#4d2316] pt-[0px] pb-[0px]"
          style={{
            fontFamily: '"Playfair Display", serif',
            color: "#2d1810",
            textShadow: `
              0 0 4px rgba(0, 255, 255, 0.3),
              0 0 6px rgba(255, 0, 255, 0.3)
            `,
          }}
        >
          A practice in self-inquiry these questions invite upon users a
          reflective state of awareness. Persons' crafted responses (or a
          non-response!) betray something interior (அகம்) this I--machinations
          idiosyncratiques--that vivify the subject, as such, a person and a
          formulation of truth.
        </p>

        {/* Interactive mystical entry point */}
        <div className="mt-12">
          <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-4">
            <label className="block text-left">
              <span
                className="block text-lg mb-2"
                style={{
                  fontFamily: '"Playfair Display", serif',
                  color: "#2d1810",
                }}
              >
                Enter your email to receive the apotropaic link:
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-[#8B4513]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-white/80 text-[#2d1810]"
                placeholder="you@example.com"
                required
                disabled={status === "sending" || status === "verifying"}
              />
            </label>
            <button
              type="submit"
              className="w-full py-3 rounded-full text-xl font-semibold transition-all duration-300"
              style={{
                background:
                  "linear-gradient(45deg, rgba(0,255,255,0.6), rgba(255,0,255,0.6))",
                color: "#111",
                textShadow: "0 0 6px rgba(0,0,0,0.2)",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
                opacity: status === "sending" || status === "verifying" ? 0.7 : 1,
              }}
              disabled={status === "sending" || status === "verifying"}
            >
              {status === "sending" ? "Summoning link..." : status === "verifying" ? "Verifying..." : "Send me the link"}
            </button>
          </form>

          <div className="mt-6 text-center space-y-2">
            {infoMessage && (
              <p className="text-[#2d1810]" style={{ fontFamily: '"Playfair Display", serif' }}>
                {infoMessage}
              </p>
            )}
            {errorMessage && (
              <p className="text-red-800" style={{ fontFamily: '"Playfair Display", serif' }}>
                {errorMessage}
              </p>
            )}
            {!infoMessage && status !== "verifying" && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setLocation("/otp-login")}
                  className="block w-full text-sm uppercase tracking-[0.2em] text-[#4d2316] hover:text-[#2d1810] transition-colors"
                >
                  Verify via SMS, WhatsApp, or Email →
                </button>
                <button
                  type="button"
                  onClick={() => setLocation("/auth-portal")}
                  className="block w-full text-sm uppercase tracking-[0.3em] text-[#4d2316] hover:text-[#2d1810] transition-colors"
                >
                  Enter through the mystical portal instead →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Newsletter Signup Box - 4th Visual Element */}
        <div className="mt-12">
          <form onSubmit={handleNewsletterSubmit} className="max-w-xl mx-auto">
            <div
              className="p-6 rounded-lg"
              style={{
                background: "rgba(139, 69, 19, 0.3)",
                border: "2px solid rgba(0, 255, 255, 0.3)",
                boxShadow: "0 0 10px rgba(255, 0, 255, 0.2)",
              }}
            >
              <h3
                className="text-2xl mb-3 text-center"
                style={{
                  fontFamily: '"Playfair Display", serif',
                  color: "#2d1810",
                  textShadow: "0 0 4px rgba(0, 255, 255, 0.4)",
                }}
              >
                Subscribe to Our Newsletter
              </h3>
              <p
                className="text-center mb-4 text-sm"
                style={{
                  fontFamily: '"Playfair Display", serif',
                  color: "#2d1810",
                }}
              >
                Receive contemplations and updates (stored encrypted through our secure VPN tunnel)
              </p>

              <div className="space-y-3">
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(event) => setNewsletterEmail(event.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-[#8B4513]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-white/80 text-[#2d1810]"
                  placeholder="your@email.com"
                  required
                  disabled={newsletterStatus === "sending"}
                />
                <button
                  type="submit"
                  className="w-full py-2 rounded-full text-lg font-semibold transition-all duration-300"
                  style={{
                    background: "linear-gradient(45deg, rgba(0,255,255,0.4), rgba(255,0,255,0.4))",
                    color: "#111",
                    textShadow: "0 0 4px rgba(0,0,0,0.2)",
                    boxShadow: "0 5px 15px rgba(0, 0, 0, 0.2)",
                    opacity: newsletterStatus === "sending" ? 0.7 : 1,
                  }}
                  disabled={newsletterStatus === "sending"}
                >
                  {newsletterStatus === "sending" ? "Subscribing..." : "Subscribe"}
                </button>
              </div>

              <div className="mt-3 text-center">
                {newsletterSuccess && (
                  <p className="text-green-800" style={{ fontFamily: '"Playfair Display", serif' }}>
                    {newsletterSuccess}
                  </p>
                )}
                {newsletterError && (
                  <p className="text-red-800" style={{ fontFamily: '"Playfair Display", serif' }}>
                    {newsletterError}
                  </p>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
