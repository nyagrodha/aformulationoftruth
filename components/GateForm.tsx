/**
 * The gate form, and the challenge block it shares with /login.
 *
 * One component because the gate is drawn in two places: on the landing page,
 * and again by /api/gate-submit when a challenge answer is wrong -- re-drawn
 * there with the visitor's answers still in it, since the site has no
 * JavaScript to keep them and losing two considered answers to a mistyped
 * digit is the kind of thing that ends a visit.
 *
 * Plain HTML only. Works with JavaScript off and at Tor Browser's "Safest".
 */

import type { Captcha } from '../lib/captcha.ts';
import { CAPTCHA_HEIGHT, CAPTCHA_LENGTH, CAPTCHA_WIDTH } from '../lib/captcha.ts';

export interface GateFormValues {
  answer1?: string;
  answer2?: string;
  email?: string;
}

/**
 * The image, its answer field, the signed token, and the honeypot. Field
 * names are the contract with lib/gate-guard.ts via the two endpoints:
 * captcha_token, captcha, website.
 */
export function CaptchaFields({ captcha }: { captcha: Captcha }) {
  return (
    <>
      <div class='form-group'>
        <label for='captcha'>Type the six digits you see</label>
        <img
          class='gate-captcha-image'
          src={captcha.image}
          width={CAPTCHA_WIDTH}
          height={CAPTCHA_HEIGHT}
          alt='Six digits, drawn as an image to keep automated submissions out.'
        />
        <input type='hidden' name='captcha_token' value={captcha.token} />
        <input
          type='text'
          id='captcha'
          name='captcha'
          class='gate-captcha-input'
          inputMode='numeric'
          autocomplete='off'
          maxLength={CAPTCHA_LENGTH + 4}
          required
          aria-describedby='captcha-note'
        />
        <p class='accessibility-note' id='captcha-note'>
          This keeps scripts from using the site to mail strangers. If you can't read it, reload the page for another,
          or write to the <a href='mailto:formitselfisemptiness@aformulationoftruth.com'>webmaster</a>.
        </p>
      </div>

      <div class='gate-hp' aria-hidden='true'>
        <label for='website'>Leave this field empty</label>
        <input type='text' id='website' name='website' tabIndex={-1} autocomplete='off' />
      </div>
    </>
  );
}

export default function GateForm({ captcha, values = {} }: { captcha: Captcha; values?: GateFormValues }) {
  return (
    <form
      id='gate-form'
      class='gate-form'
      method='POST'
      action='/api/gate-submit'
      enctype='application/x-www-form-urlencoded'
      autocomplete='off'
    >
      <div class='form-group'>
        <label for='answer1'>What is your idea of perfect happiness?</label>
        <textarea
          id='answer1'
          name='answer1'
          rows={4}
          maxLength={20000}
          placeholder='Answer every question in one sitting, or complete the questionnaire over several days… When you return, simply sign in with the same email address you use today.'
          aria-describedby='accessibility-hint'
        >
          {values.answer1 ?? ''}
        </textarea>
      </div>

      <div class='form-group'>
        <label for='answer2'>What is your greatest fear?</label>
        <textarea
          id='answer2'
          name='answer2'
          rows={4}
          maxLength={20000}
          placeholder="You may submit one questionnaire at a time. A waiting period follows each submission; you'll be emailed when you're able to submit another set of responses."
          aria-describedby='accessibility-hint'
        >
          {values.answer2 ?? ''}
        </textarea>
        <p class='accessibility-note' id='accessibility-hint'>
          For voice input, use{' '}
          <a
            href='https://github.com/cjpais/Handy'
            target='_blank'
            rel='noopener noreferrer'
          >
            Handy
          </a>{' '}
          — free offline speech-to-text.
        </p>
      </div>

      <div class='form-group'>
        <label for='email'>Email</label>
        <input
          type='email'
          id='email'
          name='email'
          autocomplete='email'
          required
          placeholder='your.email@example.com'
          value={values.email ?? ''}
        />
        <p class='privacy-notice'>
          Your answers are age-encrypted before storage, and so is your address. The database keeps a SHA-256 hash of
          it, to recognise your session, and an age-encrypted copy that only the key box which mails your finished
          questionnaire can open. We have no wish to see your email address. We use it for three things and nothing
          else: to send you your link, to deliver your answers to you as a PDF, and to remind you, some time later, to
          answer the questions again. Each of those goes out through Apple's mail servers. There is no tracking, no
          profiling, no analytics, and nothing is shared with anyone beyond that delivery.
        </p>
      </div>

      <CaptchaFields captcha={captcha} />

      <button type='submit' id='gate-submit-btn' class='gate-submit'>
        Begin
      </button>
    </form>
  );
}
