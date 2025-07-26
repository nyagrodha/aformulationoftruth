import { useAuth } from "@/hooks/useAuth";

export default function AuthPage() {
  const { isLoading } = useAuth();

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
        `
      }}
    >
      <div 
        className="relative px-12 py-8 cursor-pointer transition-all duration-300 ease-in-out transform hover:scale-105 neon-frame"
        onClick={handleLogin}
        style={{
          background: 'rgba(212, 175, 55, 0.8)',
          border: '12px solid #8B4513',
          borderRadius: '16px',
          boxShadow: `
            0 0 20px #00ffff,
            inset 0 0 15px #ff00ff,
            0 0 30px #9400d3
          `
        }}
      >
        <div className="text-center mb-6">
          <span 
            className="block lowercase text-5xl"
            style={{
              fontFamily: '"Playfair Display", serif',
              color: '#111',
              textShadow: `
                0 0 8px #00ffff,
                0 0 12px #ff00ff,
                0 0 4px rgba(0, 255, 255, 0.8),
                0 0 8px rgba(255, 0, 255, 0.8)
              `
            }}
          >
            you are this moment।
          </span>
          <span 
            className="block lowercase text-5xl mt-2"
            style={{
              fontFamily: '"Playfair Display", serif',
              color: '#111',
              textShadow: `
                0 0 8px #00ffff,
                0 0 12px #ff00ff,
                0 0 4px rgba(0, 255, 255, 0.8),
                0 0 8px rgba(255, 0, 255, 0.8)
              `
            }}
          >
            ॥ a formulation of truth ॥
          </span>
        </div>
        
        <p 
          className="text-center text-lg leading-relaxed max-w-2xl mx-auto"
          style={{
            fontFamily: '"Playfair Display", serif',
            color: '#2d1810',
            textShadow: `
              0 0 4px rgba(0, 255, 255, 0.3),
              0 0 6px rgba(255, 0, 255, 0.3)
            `
          }}
        >
          A practice in self-inquiry these questions invite a reflective state of awareness. 
          Persons who craft authentic responses stand to expose some of the inner machinations 
          constituting the subject's personhood, its formulation of truth today.
        </p>
      </div>
    </div>
  );
}