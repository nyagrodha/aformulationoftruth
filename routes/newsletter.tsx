/**
 * Newsletter result — GET /newsletter?status=…
 *
 * Where the contact page's subscribe form lands when it is posted without
 * JavaScript. routes/api/newsletter/subscribe.ts still answers a script's
 * fetch with JSON, but a plain form post gets a 303 here, so a visitor with
 * scripting off can read what happened.
 *
 * The keys must match the statuses subscribe.ts redirects with. Change one,
 * change both — tests/newsletter_form_test.ts compares them.
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import { PageShell } from '../components/PageShell.tsx';

export const NEWSLETTER_MESSAGES: Record<string, string> = {
  check: 'Check your inbox: a confirmation link is on its way. Nothing is sent until you follow it.',
  subscribed: 'That address is already subscribed.',
  invalid: "That address doesn't look valid. Try a different one.",
  error: 'Something went wrong and nothing was saved. Please try again in a moment.',
};

interface NewsletterData {
  message: string;
}

export const handler: Handlers<NewsletterData> = {
  GET(req, ctx) {
    const status = new URL(req.url).searchParams.get('status') ?? '';
    const message = NEWSLETTER_MESSAGES[status];
    // No recognised outcome means nobody was sent here by the form.
    if (!message) return new Response(null, { status: 303, headers: { Location: '/contact.html#newsletter' } });
    return ctx.render({ message });
  },
};

export default function NewsletterPage({ data }: PageProps<NewsletterData>) {
  return (
    <PageShell title='newsletter - a formulation of truth' description='Newsletter subscription'>
      <p role='status'>{data.message}</p>
      <p style='margin-top: 1.5em;'>
        <a href='/contact.html#newsletter'>back to the contact page</a>
      </p>
    </PageShell>
  );
}
