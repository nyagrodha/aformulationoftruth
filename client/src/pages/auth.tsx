import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

export default function AuthPage() {
  const { isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogin = () => {
    window.location.href = "/api/login";
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
        className="relative px-12 py-8 cursor-pointer neon-frame"
        onClick={handleLogin}
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
        <div className="flex justify-center">
          <div
            onClick={() => setLocation("/auth-portal")}
            className="relative cursor-pointer group transition-all duration-500 hover:scale-105"
            style={{
              background:
                "linear-gradient(45deg, rgba(0,255,255,0.2), rgba(255,0,255,0.2), rgba(255,255,0,0.2))",
              border: "2px solid",
              borderImage:
                "linear-gradient(45deg, #00ffff, #ff00ff, #ffff00) 1",
              borderRadius: "50px",
              padding: "20px 40px",
              boxShadow: `
                0 0 20px rgba(0,255,255,0.3),
                inset 0 0 10px rgba(255,0,255,0.2)
              `,
            }}
          >
            <span
              className="text-2xl font-medium tracking-wider group-hover:tracking-widest transition-all duration-300"
              style={{
                fontFamily: '"Playfair Display", serif',
                color: "#2d1810",
                textShadow: `
                  0 0 8px rgba(0,255,255,0.6),
                  0 0 12px rgba(255,0,255,0.4)
                `,
              }}
            >
              ⟐ Begin the questionnaire ⟐
            </span>

            {/* Subtle pulsing border effect */}
            <div
              className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background:
                  "linear-gradient(45deg, rgba(0,255,255,0.1), rgba(255,0,255,0.1))",
                filter: "blur(8px)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
