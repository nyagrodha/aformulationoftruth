/**
 * Email Utilities - Apple iCloud SMTP
 *
 * Delivery goes through smtp.mail.me.com (Apple) via authenticated SMTP.
 * SendGrid is intentionally not used.
 *
 * The socket is opened by lib/smtp_send.py, not by this process. denomailer
 * 1.6.0 used to do it here and detached its STARTTLS handshake onto a promise
 * nobody held (client.ts:335); under Deno 2.9 that promise rejected where no
 * try/catch could reach it and took the whole server down 156 times in three
 * days, each time for the unit's RestartSec=10, each time after the answers
 * had already been stored. 1.6.0 is the latest published version, so there was
 * nothing to upgrade to. A child process can fail in every way a socket can
 * and the worst it costs this one is an exit code. See smtp_send.py, and
 * romania/send_mail.py, which reached the same conclusion first.
 *
 * gupta-vidya compliance:
 * - Email addresses used only for delivery
 * - No email address or content is ever logged
 * - Minimal data in email body
 */

// $std/, not the full URL romania/mailer.ts uses: that module runs standalone
// on the key box, which has no deno.json to resolve an import map. This one
// runs inside the app and does.
import { fromFileUrl } from '$std/path/mod.ts';

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Pull the SMTP reply code out of a thrown error, when there is one.
 *
 * Only the integer is ever returned — never the surrounding message, which can
 * echo the envelope and therefore the recipient. The patterns are anchored
 * deliberately: a bare /\d{3}/ search would happily match digits inside an
 * address, and three digits of a recipient is still a fingerprint under the
 * zero-logging policy. Better to report no code than to guess one.
 *
 * Transport failures (refused connection, TLS handshake, timeout) carry no
 * reply code at all — those surface as a kind instead, see smtpFailureKind.
 */
function smtpReplyCode(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : '';
  const match = /^\s*([2-5]\d{2})[\s-]/.exec(message) ||
    /\bgot\s+([2-5]\d{2})\b/i.exec(message) ||
    /\bcode[:=\s]+([2-5]\d{2})\b/i.exec(message);
  return match ? Number(match[1]) : undefined;
}

/**
 * The error's class name — 'ConnectionRefused', 'TimedOut', 'Error'. A
 * constructor name carries no user data, so it is safe to log verbatim and
 * tells transport failures apart from server rejections.
 */
function smtpFailureKind(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'Unknown';
}

/**
 * Clamp a failure kind to something that cannot carry an address.
 *
 * Everything that reaches the log today is already a class name -- Python's
 * type(exc).__name__, or an Error's .name. But `kind` is a plain string on the
 * wire from a subprocess, and the one place it is printed is the one place a
 * mistake becomes a permanent record. An identifier-shaped value passes
 * through; anything else is replaced rather than truncated, because half of a
 * leaked address is still a fingerprint.
 */
function safeKind(kind: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(kind) ? kind : 'Unprintable';
}

/** One message, in the shape lib/smtp_send.py reads. */
export interface MailSpec {
  to: string;
  subject: string;
  text: string;
  html: string;
  from_name: string;
  from_email: string;
}

/**
 * The result of one delivery attempt, already stripped of everything that
 * could identify a recipient -- so the retry loop can log it without having to
 * think about it, and a test can construct one by hand.
 */
export interface TransportOutcome {
  ok: boolean;
  kind: string;
  code?: number;
}

/**
 * A transport never rejects. It reports failure in the return value, because a
 * thrown SMTP error is exactly the thing whose message may echo the envelope.
 */
export type MailTransport = (spec: MailSpec) => Promise<TransportOutcome>;

const SENDER = fromFileUrl(new URL('./smtp_send.py', import.meta.url));

// Longer than smtp_send.py's own 45s socket timeout, so an ordinary stall
// produces structured JSON from the child rather than a SIGKILL with empty
// stdout. This deadline is for a child that has stopped responding at all.
const CHILD_DEADLINE_MS = 60_000;

/**
 * Deliver one message by handing it to lib/smtp_send.py.
 *
 * A subprocess rather than an in-process SMTP client because the previous
 * in-process client took the whole server down with it: see the header of
 * smtp_send.py. A child can fail in every way a socket can and the worst it
 * costs the parent is an exit code.
 *
 * The pattern -- spawn, race a SIGKILL deadline, clear it in a finally -- is
 * lib/session-keys.ts:144-200, not romania/mailer.ts, which has no deadline at
 * all and can wedge on a half-open socket for as long as the kernel allows.
 */
const pythonTransport: MailTransport = async (spec) => {
  // A 0700 directory rather than a bare makeTempFile: writeTextFile's `mode`
  // is applied at creation and silently ignored on a file that already exists,
  // so the directory permission is the one that actually holds. The unit sets
  // no PrivateTmp, so /tmp here is shared with every other process on the box.
  const dir = await Deno.makeTempDir({ prefix: 'a4t-mail-' });
  const specPath = `${dir}/spec.json`;

  try {
    await Deno.writeTextFile(specPath, JSON.stringify(spec), { mode: 0o600 });

    const child = new Deno.Command('python3', {
      // The spec path is the only argument. Nothing about the message and no
      // credential goes on argv, because /proc/<pid>/cmdline is world-readable.
      args: [SENDER, specPath],
      // Merged with the parent environment, so PATH survives. Named explicitly
      // rather than inherited silently, so that a future clearEnv turns this
      // into a visible edit instead of an unconfigured sender.
      env: {
        SMTP_HOST: Deno.env.get('SMTP_HOST') ?? '',
        SMTP_PORT: Deno.env.get('SMTP_PORT') ?? '587',
        SMTP_SECURE: Deno.env.get('SMTP_SECURE') ?? 'false',
        SMTP_USER: Deno.env.get('SMTP_USER') ?? '',
        SMTP_PASS: Deno.env.get('SMTP_PASS') ?? '',
      },
      stdin: 'null',
      stdout: 'piped',
      // Discarded: a Python traceback can quote the envelope. Everything the
      // caller needs is on stdout as PII-free JSON, which makes "empty stdout
      // and a nonzero exit" a distinct and useful signal -- it means the
      // sender itself is broken, not that Apple refused the mail.
      stderr: 'null',
    }).spawn();

    const deadline = setTimeout(() => {
      // The child may have exited between the timer firing and this running.
      try {
        child.kill('SIGKILL');
      } catch {
        // Already gone; nothing to kill.
      }
    }, CHILD_DEADLINE_MS);

    let out: Deno.CommandOutput;
    try {
      out = await child.output();
    } finally {
      // Must clear on the success path too, or the timer holds the event loop
      // open for its full duration after the send has already returned.
      clearTimeout(deadline);
    }

    try {
      const parsed = JSON.parse(new TextDecoder().decode(out.stdout).trim()) as {
        ok: boolean;
        kind?: string;
        code?: number | null;
      };
      return { ok: parsed.ok, kind: parsed.kind ?? 'None', code: parsed.code ?? undefined };
    } catch {
      // exit 2 (bad invocation), 127 (no python3), SIGKILL from the deadline,
      // or a crash before the first print. None of these carry a reply code.
      return { ok: false, kind: out.code === 127 ? 'PythonMissing' : 'SenderFailed' };
    }
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
};

/**
 * Send email via Apple iCloud SMTP.
 *
 * Reads connection settings from the environment:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, FROM_EMAIL
 * SMTP_SECURE=true selects implicit TLS (port 465); otherwise STARTTLS is
 * used (port 587), which is Apple's default submission port.
 */
export async function sendEmail(
  options: SendEmailOptions,
  // Injected in tests. CI runs `deno test` without --allow-run, so the only
  // way to exercise the retry ladder and the never-rejects contract is to
  // substitute the transport -- the same seam as pushIdentity in
  // lib/session-keys.ts:267.
  transport: MailTransport = pythonTransport,
): Promise<EmailResult> {
  /*
   * Stub transport: automated CI/e2e runs have no SMTP server, so delivery is
   * short-circuited and reported as success. This lets end-to-end flows (magic
   * link, newsletter double opt-in) exercise the endpoints without a real one.
   *
   * Keyed on EMAIL_TRANSPORT rather than DENO_ENV, which is what it used to
   * read. DENO_ENV names an environment, not a transport, and every other
   * reader of it treats it as one -- so a host that set DENO_ENV=test for any
   * other purpose silently stopped sending mail while reporting 250 to every
   * caller, and the failure is invisible precisely because the magic link and
   * the double opt-in are the mail nobody on this side is waiting for. Nothing
   * turns this on by accident: EMAIL_TRANSPORT=stub says only this.
   */
  if (Deno.env.get('EMAIL_TRANSPORT') === 'stub') {
    console.log('[email] EMAIL_TRANSPORT=stub: delivery bypassed, reporting success');
    return { success: true, statusCode: 250 };
  }

  // SMTP_PORT and SMTP_SECURE are not read here: the transport passes them
  // straight to the child, which is the only thing that opens a socket. These
  // four are, because they gate the send below.
  const hostname = Deno.env.get('SMTP_HOST');
  const username = Deno.env.get('SMTP_USER');
  const password = Deno.env.get('SMTP_PASS');
  const fromEmail = Deno.env.get('FROM_EMAIL') || username;
  // FROM_NAME as well as SMTP_FROM_NAME: .env has only ever defined the
  // former, so every message so far has gone out under the hardcoded fallback.
  // SMTP_FROM_NAME stays first to avoid changing any host that does set it.
  const fromName = Deno.env.get('SMTP_FROM_NAME') || Deno.env.get('FROM_NAME') ||
    'a formulation of truth';

  if (!hostname || !username || !password || !fromEmail) {
    console.error('[email] SMTP not configured');
    return { success: false, error: 'Email service not configured' };
  }

  // Apple intermittently drops or throttles connections: roughly 1-7 sends a
  // day failed with kind=TimedOut and no reply code, against a far larger
  // number that succeeded. A fresh client per attempt with a short backoff
  // clears it; the failure is transient, not a misconfiguration.
  const MAX_ATTEMPTS = 3;

  const spec: MailSpec = {
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    from_name: fromName,
    from_email: fromEmail,
  };

  let lastCode: number | undefined;
  let lastKind = 'None';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let outcome: TransportOutcome;
    try {
      outcome = await transport(spec);
    } catch (error) {
      // The transport contract says it does not reject, so this is the
      // transport being unable to start at all rather than a refused message:
      // NotCapable when --allow-run is missing, ENOSPC on the temp directory.
      // smtpReplyCode/smtpFailureKind still earn their keep here, on an error
      // minted by Deno rather than by a mail server.
      outcome = { ok: false, kind: smtpFailureKind(error), code: smtpReplyCode(error) };
    }

    if (outcome.ok) {
      // Log successes too. Without this the journal shows only failures, which
      // makes "3 failures out of 3" indistinguishable from "3 out of 300" —
      // and those call for opposite responses. A bare count carries no PII, so
      // the zero-logging policy never required this silence.
      console.log(`[email] sent attempt=${attempt}`);
      return { success: true, statusCode: 250 };
    }

    lastCode = outcome.code;
    lastKind = outcome.kind;

    // A permanent rejection (5xx) will fail identically every time; only
    // retry transport-level faults and Apple's 4xx "try later" codes.
    const worthRetrying = outcome.code === undefined || outcome.code < 500;
    if (attempt < MAX_ATTEMPTS && worthRetrying) {
      console.error(
        `[email] retrying after code=${outcome.code ?? 'none'} kind=${safeKind(outcome.kind)} attempt=${attempt}`,
      );
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      continue;
    }
    break;
  }

  // Zero-logging: never surface the recipient or a raw error string (either can
  // echo the envelope). A reply code and an error class name are both PII-free,
  // and they are the difference between "mail broke" and "Apple threw 421 at us
  // for sending too fast" — which is the whole of the diagnosis.
  console.error(`[email] SMTP send failed code=${lastCode ?? 'none'} kind=${safeKind(lastKind)}`);
  return {
    success: false,
    statusCode: lastCode,
    // A category, not a message. This used to be `error.message`, and one of
    // the two branches upstream threw `${cmd.code}: ${cmd.args}` -- where args
    // on a rejected RCPT TO is the recipient's address. No caller reads this
    // field (all three check only .success), so narrowing it costs nothing and
    // closes a leak that had simply never been printed.
    error: lastCode !== undefined ? 'smtp_rejected' : 'smtp_transport',
  };
}

/**
 * Send magic link email for questionnaire access
 */
export async function sendMagicLinkEmail(email: string, magicLinkUrl: string): Promise<EmailResult> {
  const subject = Deno.env.get('EMAIL_SUBJECT') || 'Your link to a formulation of truth';

  const text = `
You requested access to a formulation of truth.

Click here to continue your questionnaire:
${magicLinkUrl}

This link expires in 15 minutes and can only be used once.

If you didn't request this, you can safely ignore this email.

---
a formulation of truth
https://aformulationoftruth.com
`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Georgia', serif;
      background: #000;
      color: #ccc;
      margin: 0;
      padding: 40px 20px;
    }
    .container {
      max-width: 520px;
      margin: 0 auto;
      background: #0a0a0a;
      border: 1px solid #222;
      padding: 40px;
    }
    h1 {
      font-size: 18px;
      font-weight: normal;
      color: #fff;
      margin: 0 0 30px 0;
      letter-spacing: 0.05em;
    }
    p {
      line-height: 1.7;
      margin: 0 0 20px 0;
      color: #999;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #ff69b4 0%, #ff8c42 100%);
      color: #000 !important;
      text-decoration: none;
      padding: 14px 32px;
      font-size: 14px;
      font-weight: bold;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin: 20px 0;
    }
    .link {
      word-break: break-all;
      color: #666;
      font-size: 12px;
      font-family: monospace;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #222;
      font-size: 12px;
      color: #555;
    }
    .tamil {
      font-family: 'Noto Serif Tamil', serif;
      color: #ff69b4;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>a formulation of truth</h1>

    <p>You requested access to continue your questionnaire.</p>

    <p>
      <a href="${magicLinkUrl}" class="button">Continue Questionnaire</a>
    </p>

    <p>Or copy this link:</p>
    <p class="link">${magicLinkUrl}</p>

    <p style="color: #666; font-size: 13px;">
      This link expires in 15 minutes and can only be used once.
    </p>

    <div class="footer">
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p><span class="tamil">உண்மை</span> &mdash; truth</p>
    </div>
  </div>
</body>
</html>
`;

  return await sendEmail({
    to: email,
    subject,
    text: text.trim(),
    html,
  });
}

/**
 * Send newsletter confirmation email (double opt-in)
 */
export async function sendNewsletterConfirmationEmail(
  email: string,
  confirmUrl: string,
  unsubscribeUrl: string,
): Promise<EmailResult> {
  const subject = 'Confirm your subscription to a formulation of truth';

  const text = `
Please confirm your subscription to the a formulation of truth newsletter.

Click here to confirm:
${confirmUrl}

This link expires in 24 hours.

If you didn't subscribe, you can safely ignore this email or unsubscribe here:
${unsubscribeUrl}

---
a formulation of truth
https://aformulationoftruth.com
`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Georgia', serif;
      background: #000;
      color: #ccc;
      margin: 0;
      padding: 40px 20px;
    }
    .container {
      max-width: 520px;
      margin: 0 auto;
      background: #0a0a0a;
      border: 1px solid #222;
      padding: 40px;
    }
    h1 {
      font-size: 18px;
      font-weight: normal;
      color: #fff;
      margin: 0 0 30px 0;
      letter-spacing: 0.05em;
    }
    p {
      line-height: 1.7;
      margin: 0 0 20px 0;
      color: #999;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #00ff88 0%, #0af 100%);
      color: #000 !important;
      text-decoration: none;
      padding: 14px 32px;
      font-size: 14px;
      font-weight: bold;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin: 20px 0;
      border-radius: 4px;
    }
    .link {
      word-break: break-all;
      color: #666;
      font-size: 12px;
      font-family: monospace;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #222;
      font-size: 12px;
      color: #555;
    }
    .footer a {
      color: #888;
    }
    .tamil {
      font-family: 'Noto Serif Tamil', serif;
      color: #00ff88;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>a formulation of truth</h1>

    <p>Please confirm your subscription to our newsletter.</p>

    <p>
      <a href="${confirmUrl}" class="button">Confirm Subscription</a>
    </p>

    <p>Or copy this link:</p>
    <p class="link">${confirmUrl}</p>

    <p style="color: #666; font-size: 13px;">
      This link expires in 24 hours.
    </p>

    <div class="footer">
      <p>If you didn't subscribe, you can safely ignore this email.</p>
      <p>Or <a href="${unsubscribeUrl}">unsubscribe here</a>.</p>
      <p><span class="tamil">உண்மை</span> &mdash; truth</p>
    </div>
  </div>
</body>
</html>
`;

  return await sendEmail({
    to: email,
    subject,
    text: text.trim(),
    html,
  });
}
