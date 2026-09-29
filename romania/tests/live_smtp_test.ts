/**
 * Live SMTP: the one test that really sends mail. Off unless asked for.
 *
 *   A4T_LIVE_SMTP=1 A4T_TEST_EMAIL=<your address> \
 *     deno test --allow-read --allow-write --allow-run --allow-env --allow-net romania/tests/live_smtp_test.ts
 *
 * Run it on the key box with keybox.env loaded (FROM_EMAIL / SMTP_*): it drives
 * the real sendDelivery through the real send_mail.py and the SMTP relay, and
 * delivers a one-page placeholder PDF -- no questionnaire data -- to
 * A4T_TEST_EMAIL. It is how to prove the mail path end to end without a
 * respondent's copy riding on it.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { sendDelivery } from '../mailer.ts';

const LIVE = Deno.env.get('A4T_LIVE_SMTP') === '1';
const TO = Deno.env.get('A4T_TEST_EMAIL') || '';

Deno.test({
  name: 'live SMTP - sendDelivery reaches A4T_TEST_EMAIL',
  ignore: !LIVE,
  async fn() {
    if (!TO) throw new Error('A4T_LIVE_SMTP=1 needs A4T_TEST_EMAIL; refusing to guess a recipient');
    const dir = await Deno.makeTempDir({ prefix: 'live-smtp-' });
    try {
      // A minimal valid PDF: one blank page.
      const pdf = new TextEncoder().encode(
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
          '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
      );
      await sendDelivery({ to: TO, pdf, filename: 'a4t-smtp-test.pdf', protected: false, workDir: dir });
      assertEquals([...Deno.readDirSync(dir)], [], 'nothing may remain after a send');
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
