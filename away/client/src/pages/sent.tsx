import { useLocation } from 'wouter';

export default function SentPage() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 text-center"
      style={{ background: 'linear-gradient(160deg, #faf7f0 0%, #eef4ee 100%)' }}
    >
      <div className="max-w-md">
        {/* Leaf / gratitude icon */}
        <div className="text-6xl mb-6">🌿</div>

        <h1
          className="font-serif text-4xl mb-4"
          style={{ color: '#4a6a4a', fontFamily: 'Playfair Display, Georgia, serif' }}
        >
          Your thanks is on its way.
        </h1>

        <div className="divider" />

        <p
          className="text-gray-500 text-lg mt-4 mb-8 leading-relaxed"
          style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
        >
          A small act of gratitude can ripple further than we imagine.
          Thank you for taking the time to say something kind.
        </p>

        <button
          onClick={() => setLocation('/')}
          className="px-8 py-3 rounded-full text-white font-medium transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #7c9a7c, #4a6a4a)' }}
        >
          Send another thank-you
        </button>
      </div>

      <footer className="mt-16 text-xs text-gray-400">
        awaytosaythanks.com — gratitude, delivered.
      </footer>
    </div>
  );
}
