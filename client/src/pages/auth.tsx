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
      className="min-h-screen overflow-hidden flex items-center justify-center"
      style={{
        background: '#111 url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23222" fill-opacity="0.4"%3E%3Ccircle cx="30" cy="30" r="4"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E") center/cover no-repeat'
      }}
    >
      <div 
        className="relative px-12 py-8 cursor-pointer transition-all duration-300 ease-in-out transform hover:scale-105 neon-frame"
        onClick={handleLogin}
        style={{
          background: 'rgba(0,0,0,0.6)',
          border: '12px solid #d4af37',
          borderRadius: '16px',
          boxShadow: `
            0 0 20px #00ffff,
            inset 0 0 15px #ff00ff,
            0 0 30px #9400d3
          `
        }}
      >
        <span 
          className="block text-center lowercase text-5xl"
          style={{
            fontFamily: '"Playfair Display", serif',
            color: '#f7f3e8',
            textShadow: `
              0 0 8px #00ffff,
              0 0 12px #ff00ff
            `
          }}
        >
          you are this moment; a formulation of truth
        </span>
      </div>
    </div>
  );
}