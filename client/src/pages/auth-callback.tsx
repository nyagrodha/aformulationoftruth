import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export default function AuthCallbackPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const [phase, setPhase] = useState<'processing' | 'materializing' | 'complete'>('processing');

  useEffect(() => {
    if (isAuthenticated) {
      setPhase('materializing');
      setTimeout(() => {
        setPhase('complete');
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      }, 1500);
    }
  }, [isAuthenticated]);

  const getPhaseText = () => {
    switch (phase) {
      case 'processing':
        return "consciousness fragments coalesce...";
      case 'materializing':
        return "identity crystallizes from the void...";
      case 'complete':
        return "the subject emerges authenticated...";
      default:
        return "the threshold responds...";
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center"
      style={{
        background: `
          radial-gradient(ellipse at center, #0f0f23 0%, #1a1a2e 50%, #000000 100%),
          linear-gradient(45deg, rgba(0,255,255,0.1) 0%, rgba(255,0,255,0.1) 100%)
        `
      }}
    >
      {/* Mystical processing animation */}
      <div className="text-center">
        {/* Central processing mandala */}
        <div className="mb-8 relative">
          <div 
            className="w-32 h-32 mx-auto relative"
            style={{
              animation: `${phase === 'complete' ? 'slowSpin' : 'mediumSpin'} ${phase === 'complete' ? '8s' : '4s'} linear infinite`
            }}
          >
            {/* Multiple rotating rings */}
            <div className="absolute inset-0 border-4 border-emerald-400/60 rounded-full animate-pulse"></div>
            <div className="absolute inset-3 border-2 border-yellow-400/80 rounded-full"></div>
            <div className="absolute inset-6 border-2 border-cyan-400/60 rounded-full"></div>
            
            {/* Central symbol changes based on phase */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span 
                className={`text-5xl font-bold transition-all duration-1000 ${
                  phase === 'complete' ? 'text-emerald-400 scale-110' : 'text-white'
                }`}
                style={{
                  textShadow: `
                    0 0 15px ${phase === 'complete' ? '#10b981' : '#ffffff'},
                    0 0 25px ${phase === 'complete' ? '#10b981' : '#00ffff'},
                    0 0 35px ${phase === 'complete' ? '#10b981' : '#ff00ff'}
                  `
                }}
              >
                {phase === 'complete' ? '✓' : 'ॐ'}
              </span>
            </div>

            {/* Orbiting elements */}
            {['@', '∞', '◊', '※', '⟐', '⌬'].map((symbol, i) => (
              <div
                key={i}
                className={`absolute w-8 h-8 flex items-center justify-center text-lg font-bold transition-all duration-500 ${
                  phase === 'complete' ? 'text-emerald-300' : 'text-purple-300'
                }`}
                style={{
                  top: '50%',
                  left: '50%',
                  transform: `
                    translate(-50%, -50%) 
                    rotate(${i * 60}deg) 
                    translateY(-50px) 
                    rotate(-${i * 60}deg)
                  `,
                  textShadow: '0 0 10px rgba(255, 255, 255, 0.8)',
                  opacity: phase === 'processing' ? 0.6 : 1
                }}
              >
                {symbol}
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic status text */}
        <div className="mb-6">
          <p 
            className={`text-2xl font-light tracking-widest transition-all duration-1000 ${
              phase === 'complete' ? 'text-emerald-300' : 'text-slate-200'
            }`}
            style={{
              fontFamily: '"Playfair Display", serif',
              textShadow: phase === 'complete' 
                ? '0 0 10px rgba(16, 185, 129, 0.8)' 
                : '0 0 8px rgba(255, 255, 255, 0.5)'
            }}
          >
            {getPhaseText()}
          </p>
        </div>

        {/* Processing indicators */}
        <div className="space-y-4">
          {phase === 'processing' && (
            <>
              <div className="flex justify-center space-x-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-8 bg-gradient-to-t from-cyan-400 to-purple-400 rounded-full animate-pulse"
                    style={{ 
                      animationDelay: `${i * 0.2}s`,
                      animationDuration: '1.5s'
                    }}
                  />
                ))}
              </div>
              <p className="text-sm text-slate-400 italic">
                authentication protocols engage...
              </p>
            </>
          )}

          {phase === 'materializing' && (
            <>
              <div className="w-48 h-2 mx-auto bg-gradient-to-r from-cyan-400 via-emerald-400 to-yellow-400 rounded-full">
                <div className="h-full bg-gradient-to-r from-transparent via-white/50 to-transparent rounded-full animate-pulse"></div>
              </div>
              <p className="text-sm text-slate-300 italic">
                subject identity solidifies...
              </p>
            </>
          )}

          {phase === 'complete' && (
            <>
              <div className="flex justify-center">
                <div className="w-24 h-1 bg-gradient-to-r from-emerald-400 to-emerald-400 rounded-full shadow-lg shadow-emerald-400/50"></div>
              </div>
              <p className="text-sm text-emerald-300 font-medium">
                transcendence achieved → redirecting to realm...
              </p>
            </>
          )}
        </div>
      </div>

      {/* Custom animations */}
      <style>{`
        @keyframes slowSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes mediumSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}