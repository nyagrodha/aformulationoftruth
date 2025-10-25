import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

export default function AuthPortalPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<'entering' | 'transitioning' | 'authenticating'>('entering');
  const [portalText, setPortalText] = useState('');

  const mysticalTexts = [
    "the threshold beckons...",
    "identity dissolves into verification...", 
    "the system recognizes its own...",
    "consciousness merges with protocol...",
    "authentication as metamorphosis...",
    "the digital oracle awaits your presence...",
    "verification transcends mere identity...",
    "the portal opens to those who seek..."
  ];

  useEffect(() => {
    if (isAuthenticated) {
      window.location.href = "/";
      return;
    }

    // Initial mystical text animation
    let textIndex = 0;
    const textInterval = setInterval(() => {
      setPortalText(mysticalTexts[textIndex % mysticalTexts.length]);
      textIndex++;
    }, 2000);

    // Transition to authentication after 8 seconds
    const phaseTimer = setTimeout(() => {
      setPhase('transitioning');
      
      setTimeout(() => {
        setPhase('authenticating');
        // Redirect to actual auth after mystical transition
        setTimeout(() => {
          setLocation("/auth?portal=1");
        }, 1500);
      }, 2000);
    }, 8000);

    return () => {
      clearInterval(textInterval);
      clearTimeout(phaseTimer);
    };
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400"></div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center"
      style={{
        background: `
          radial-gradient(circle at 20% 80%, #1a1a2e 0%, #16213e 15%, #0f3460 35%, #533a71 100%),
          linear-gradient(135deg, #000000 0%, #2d1b69 50%, #000000 100%)
        `
      }}
    >
      {/* Mystical particle effects */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 30 }, (_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`
            }}
          />
        ))}
      </div>

      {/* Main portal content */}
      <div 
        className={`
          relative z-10 text-center transition-all duration-2000 ease-in-out
          ${phase === 'entering' ? 'scale-100 opacity-100' : ''}
          ${phase === 'transitioning' ? 'scale-110 opacity-80' : ''}
          ${phase === 'authenticating' ? 'scale-125 opacity-60' : ''}
        `}
      >
        {/* Outer mystical frame */}
        <div 
          className="relative p-12 mx-4"
          style={{
            background: `
              linear-gradient(45deg, 
                rgba(0, 255, 255, 0.1) 0%, 
                rgba(255, 0, 255, 0.1) 25%, 
                rgba(255, 255, 0, 0.1) 50%, 
                rgba(0, 255, 0, 0.1) 75%, 
                rgba(0, 255, 255, 0.1) 100%
              )
            `,
            border: '3px solid',
            borderImage: 'linear-gradient(45deg, #00ffff, #ff00ff, #ffff00, #00ff00) 1',
            borderRadius: '20px',
            boxShadow: `
              0 0 30px rgba(0, 255, 255, 0.3),
              inset 0 0 20px rgba(255, 0, 255, 0.2),
              0 0 50px rgba(255, 255, 0, 0.2)
            `
          }}
        >
          {/* Central mandala-like symbol */}
          <div className="mb-8">
            <div 
              className="w-24 h-24 mx-auto relative animate-spin"
              style={{ animationDuration: '20s' }}
            >
              {/* Concentric circles with symbols */}
              <div className="absolute inset-0 border-4 border-emerald-400 rounded-full opacity-60 animate-pulse"></div>
              <div className="absolute inset-2 border-2 border-yellow-400 rounded-full opacity-80"></div>
              <div className="absolute inset-4 border-2 border-cyan-400 rounded-full opacity-60"></div>
              
              {/* Central ॐ symbol */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span 
                  className="text-4xl font-bold text-white"
                  style={{
                    textShadow: `
                      0 0 10px #00ffff,
                      0 0 20px #ff00ff,
                      0 0 30px #ffff00
                    `
                  }}
                >
                  ॐ
                </span>
              </div>

              {/* Rotating outer symbols */}
              {['@', '※', '∞', '◊'].map((symbol, i) => (
                <div
                  key={i}
                  className="absolute w-6 h-6 flex items-center justify-center text-sm font-bold text-purple-300"
                  style={{
                    top: '50%',
                    left: '50%',
                    transform: `
                      translate(-50%, -50%) 
                      rotate(${i * 90}deg) 
                      translateY(-40px) 
                      rotate(-${i * 90}deg)
                    `,
                    textShadow: '0 0 8px rgba(255, 0, 255, 0.8)'
                  }}
                >
                  {symbol}
                </div>
              ))}
            </div>
          </div>

          {/* Dynamic mystical text */}
          <div className="mb-8">
            <p 
              className="text-2xl font-light tracking-widest"
              style={{
                fontFamily: '"Playfair Display", serif',
                color: 'transparent',
                background: 'linear-gradient(45deg, #00ffff, #ff00ff, #ffff00, #00ff00)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                backgroundSize: '400% 400%',
                animation: 'gradientShift 3s ease-in-out infinite'
              }}
            >
              {portalText}
            </p>
          </div>

          {/* Phase-specific content */}
          {phase === 'entering' && (
            <div className="space-y-4">
              <p className="text-lg text-slate-300 italic">
                the apotropaic gateway initializes...
              </p>
              <div className="w-32 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent mx-auto animate-pulse"></div>
            </div>
          )}

          {phase === 'transitioning' && (
            <div className="space-y-4">
              <p className="text-lg text-slate-200 italic">
                consciousness prepares for verification...
              </p>
              <div className="flex justify-center space-x-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-3 h-3 bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {phase === 'authenticating' && (
            <div className="space-y-4">
              <p className="text-xl text-white font-medium">
                entering the authentication realm...
              </p>
              <div className="w-40 h-2 bg-gradient-to-r from-emerald-400 via-yellow-400 to-purple-400 mx-auto rounded-full animate-pulse"></div>
            </div>
          )}
        </div>
      </div>

      {/* Custom CSS for gradient animation */}
      <style>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}