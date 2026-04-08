import { useLocation } from 'wouter';

export default function NotFoundPage() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 text-center"
      style={{ background: 'linear-gradient(160deg, #faf7f0 0%, #eef4ee 100%)' }}
    >
      <h1
        className="font-serif text-5xl mb-4"
        style={{ color: '#4a6a4a', fontFamily: 'Playfair Display, Georgia, serif' }}
      >
        404
      </h1>
      <p className="text-gray-500 mb-8">Page not found.</p>
      <button
        onClick={() => setLocation('/')}
        className="px-6 py-2 rounded-full text-white"
        style={{ background: '#7c9a7c' }}
      >
        Go home
      </button>
    </div>
  );
}
