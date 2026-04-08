import { type FormEvent, useState } from 'react';
import { useLocation } from 'wouter';

type Status = 'idle' | 'sending' | 'sent' | 'error';

interface FormData {
  senderName: string;
  senderEmail: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  message: string;
}

const EMPTY_FORM: FormData = {
  senderName: '',
  senderEmail: '',
  recipientName: '',
  recipientEmail: '',
  subject: '',
  message: '',
};

export default function HomePage() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);

    try {
      const res = await fetch('/api/thanks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderName: form.senderName || undefined,
          senderEmail: form.senderEmail,
          recipientName: form.recipientName,
          recipientEmail: form.recipientEmail,
          subject: form.subject || undefined,
          message: form.message,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Something went wrong' }));
        throw new Error(body.message || 'Something went wrong');
      }

      setStatus('sent');
      setLocation('/sent');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ background: 'linear-gradient(160deg, #faf7f0 0%, #eef4ee 100%)' }}>

      {/* Header */}
      <header className="text-center mb-12">
        <h1 className="font-serif text-5xl text-sage-dark" style={{ color: '#4a6a4a' }}>
          a way to say thanks
        </h1>
        <div className="divider" />
        <p className="text-lg text-gray-500 max-w-md mx-auto mt-4" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
          Send a heartfelt thank-you to someone who has touched your life.
          A few words of gratitude can mean everything.
        </p>
      </header>

      {/* Form card */}
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8"
        style={{ border: '1px solid #e8d5a3' }}>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Recipient section */}
          <fieldset className="space-y-4">
            <legend className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              Who are you thanking?
            </legend>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Their name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.recipientName}
                onChange={update('recipientName')}
                required
                placeholder="Jordan"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sage-500 text-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Their email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={form.recipientEmail}
                onChange={update('recipientEmail')}
                required
                placeholder="jordan@example.com"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-300 text-gray-800"
              />
            </div>
          </fieldset>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Your message <span className="text-red-400">*</span>
            </label>
            <textarea
              value={form.message}
              onChange={update('message')}
              required
              rows={6}
              minLength={10}
              maxLength={2000}
              placeholder="Dear Jordan, I wanted to take a moment to thank you for…"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 text-gray-800 resize-none"
              style={{ fontFamily: 'Georgia, serif', lineHeight: '1.7' }}
            />
            <p className="text-xs text-gray-400 text-right mt-1">
              {form.message.length} / 2000
            </p>
          </div>

          {/* Optional subject */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Subject line <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={form.subject}
              onChange={update('subject')}
              maxLength={200}
              placeholder="A note of gratitude"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 text-gray-800"
            />
          </div>

          {/* Sender section */}
          <fieldset className="space-y-4 pt-2 border-t border-gray-100">
            <legend className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              From (optional — you can remain anonymous)
            </legend>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Your name
              </label>
              <input
                type="text"
                value={form.senderName}
                onChange={update('senderName')}
                placeholder="Alex"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 text-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Your email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={form.senderEmail}
                onChange={update('senderEmail')}
                required
                placeholder="alex@example.com"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 text-gray-800"
              />
              <p className="text-xs text-gray-400 mt-1">
                Used as the reply-to address. Never shared publicly.
              </p>
            </div>
          </fieldset>

          {/* Error */}
          {error && (
            <p className="text-red-600 text-sm text-center">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={status === 'sending'}
            className="w-full py-3 rounded-full text-white font-medium text-lg transition-opacity"
            style={{
              background: 'linear-gradient(135deg, #7c9a7c, #4a6a4a)',
              opacity: status === 'sending' ? 0.7 : 1,
              cursor: status === 'sending' ? 'wait' : 'pointer',
            }}
          >
            {status === 'sending' ? 'Sending…' : 'Send your thanks ✦'}
          </button>
        </form>
      </div>

      <footer className="mt-10 text-xs text-gray-400 text-center">
        awaytosaythanks.com — gratitude, delivered.
      </footer>
    </div>
  );
}
