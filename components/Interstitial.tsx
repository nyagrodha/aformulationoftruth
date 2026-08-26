import { render } from 'preact-render-to-string';
import { increment } from '../lib/metrics.ts';

/**
 * The page shown when someone arrives at a questionnaire route and cannot be
 * let through.
 *
 * Every one of these situations used to be a bare `302` to the landing page.
 * The respondent clicked a link, or came back to a tab they had left open, and
 * arrived at the front of the site with no indication that anything had
 * happened -- not an error, not a prompt, nothing to distinguish it from having
 * mistyped the address. In the retained access logs that happened to 399
 * arrivals at /questionnaire against 299 that saw a question, and to 66 clicks
 * on an emailed link in a day and a half. Nobody who wrote to us about it could
 * describe the problem, because there was nothing to describe.
 *
 * Each reason has exactly one action, and the action works. That is the whole
 * design. A page offering two doors when one of them is broken is what the
 * verification error page was already doing: its only exit went to /login, a
 * form with no method and no action that does nothing at all without
 * JavaScript, and which -- if it did run -- produced a session with no keypair
 * that could never be sent a copy.
 *
 * Styled with /css/main.css and the `.gate-*` vocabulary, so it reads as part
 * of the questionnaire rather than as a browser error.
 */

export type InterstitialReason =
  /** No credentials at all: a cold browser, a new device, or cookies refused. */
  | 'nocookie'
  /** Credentials that have run out -- an expired JWT and no live resume token. */
  | 'expired'
  /** Credentials that verify but name a session no longer in the database. */
  | 'notfound';

// There was a fourth reason, 'finished'. It was unreachable: every caller
// passes an AuthFailure, and a finished session is not an authentication
// failure -- /questionnaire redirects it to /completion, which is a real page
// with the consent form on it and a better destination than any interstitial.
// Removed rather than left as copy nothing can render.

interface Copy {
  title: string;
  body: string;
  href: string;
  action: string;
}

const COPY: Record<InterstitialReason, Copy> = {
  nocookie: {
    title: 'this browser is not carrying your place',
    body:
      'Nothing here identifies you until you begin, so a new browser, a private window, or a device that refuses cookies arrives empty. Your answers are safe where they are. Enter the same address you used before and we will send you back to them.',
    href: '/#begin',
    action: 'Begin again',
  },
  expired: {
    title: 'your place is still kept',
    body:
      'The link that opened this browser has run out. The questionnaire itself has not: your answers are held for thirty days from your last visit, and returning resets the clock. Enter the same address and we will send you a way back in.',
    href: '/#begin',
    action: 'Send me a way back',
  },
  notfound: {
    title: 'we cannot find that questionnaire',
    body:
      'The link verified, but the questionnaire it points at is no longer here. That normally means it has been let go after thirty days without a visit. Beginning again starts a new one.',
    href: '/#begin',
    action: 'Begin again',
  },
};

export function Interstitial(
  { reason, draft }: { reason: InterstitialReason; draft?: string },
) {
  const copy = COPY[reason];

  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>a formulation of truth</title>
        <meta name='robots' content='noindex, nofollow' />
        <link rel='stylesheet' href='/css/main.css' />
      </head>
      <body>
        <nav>
          <a href='/' class='logo'>A4T</a>
        </nav>

        <main>
          <section class='section gate-section' style='min-height: 80vh; display: flex; align-items: center;'>
            <div class='gate-content'>
              <div class='gate-icon'>?</div>
              <h2 class='gate-title'>{copy.title}</h2>
              <p class='gate-description'>{copy.body}</p>

              {
                /*
                Whatever they had just typed, handed back rather than thrown
                away. The POST handler authenticates AFTER reading the body
                precisely so this is possible: it used to authenticate first and
                redirect, which discarded the answer without ever showing it
                again -- the worst thing this application could do to someone
                who had just written something difficult. It cannot be stored
                without a session, so the least it can do is not lose it.
              */
              }
              {draft && draft.trim() !== '' && (
                <div class='form-group'>
                  <label htmlFor='draft'>What you had written -- copy it before you go</label>
                  <textarea id='draft' readOnly rows={8}>{draft}</textarea>
                </div>
              )}

              <div class='form-actions'>
                <a href={copy.href} class='cta cta-primary'>{copy.action}</a>
              </div>
            </div>
          </section>
        </main>

        <footer>
          <div class='footer-inner'>
            <div class='footer-links'>
              <a href='/about'>About</a>
              <a href='/privacy'>Privacy</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

/**
 * Render an interstitial as a Response, counting the reason on the way out.
 *
 * The counter is the point of routing this through one helper: until now these
 * situations produced a redirect indistinguishable from ordinary traffic, so
 * how often each happened could only be recovered by parsing access logs for
 * 302s. The metric name is a fixed category string and carries nothing about
 * the person -- see /var/www/CLAUDE.md.
 *
 * 200, not 4xx: nothing has gone wrong with the request, and a status the
 * browser treats as an error would change how it is cached and reported.
 */
export function interstitialResponse(reason: InterstitialReason, draft?: string): Response {
  increment(`funnel.interstitial.${reason}`);
  if (draft && draft.trim() !== '') increment('funnel.interstitial.with_draft');
  const body = `<!DOCTYPE html>${render(<Interstitial reason={reason} draft={draft} />)}`;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
