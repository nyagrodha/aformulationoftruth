/**
 * The gate, re-drawn after a wrong or expired challenge answer.
 *
 * Also used when the address's domain cannot receive mail (lib/mail-domain.ts).
 *
 * Rendered by /api/gate-submit as the direct response to the POST (not via a
 * redirect), because the answers the visitor wrote exist nowhere but in that
 * request: nothing is stored until the challenge passes, and the site has no
 * JavaScript to hold them. Rendering here is what lets them come back filled in.
 *
 * Deliberately minimal -- no islands, since this is rendered outside Fresh's
 * page pipeline and nothing would hydrate them.
 */

import { render } from 'preact-render-to-string';
import GateForm, { type GateFormValues } from './GateForm.tsx';
import type { Captcha } from '../lib/captcha.ts';

export type RetryReason = 'captcha' | 'email';

const REASONS: Record<RetryReason, string> = {
  captcha: "That didn't match, or the challenge had expired. Your answers are kept below; answer the new image or " +
    'question and begin again.',
  email: "That address's domain doesn't accept mail, so a link sent there would never arrive. Check it for a typo; " +
    'your answers are kept below.',
};

export function GateRetryPage(
  { captcha, values, reason }: { captcha: Captcha; values: GateFormValues; reason: RetryReason },
) {
  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <meta name='robots' content='noindex, nofollow' />
        <title>a gate — a formulation of truth</title>
        <link rel='icon' href='/favicon.ico' sizes='any' />
        <link rel='stylesheet' href='/css/prolegomenon.css' />
      </head>
      <body>
        <main>
          <section id='begin' class='gate-section' style='border-top: 0;'>
            <div class='gate-content'>
              <p class='gate-eyebrow'>a gate:</p>
              <h2 class='gate-title'>Once more, at the gate</h2>
              <div class='gate-error' role='alert'>{REASONS[reason]}</div>
              <GateForm captcha={captcha} values={values} />
              <p class='accessibility-note'>
                <a href='/'>Return to the beginning</a>
              </p>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}

export function renderGateRetry(captcha: Captcha, values: GateFormValues, reason: RetryReason): string {
  return '<!DOCTYPE html>' + render(<GateRetryPage captcha={captcha} values={values} reason={reason} />);
}
