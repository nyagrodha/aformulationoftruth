/**
 * Privacy — GET /privacy
 *
 * Ported from the former public/privacy.html, which carried the old
 * western-theme.css look (Rye, wheat gradients, brown rules) that no other
 * page still uses. Copy is the site owner's and is preserved verbatim,
 * including the July 2026 revision that corrected the questionnaire section:
 * answers go to the server and are age-encrypted there, they are not held in
 * localStorage as the previous text claimed.
 *
 * /privacy.html needs a 301 to /privacy in Caddy, as was done for about.html.
 */
import { Ornament, PageShell } from '../components/PageShell.tsx';

export default function PrivacyPage() {
  return (
    <PageShell
      title='Privacy - a formulation of truth'
      description='Privacy policy and practices for a formulation of truth'
    >
      <div class='about-header'>
        <h1>Privacy First</h1>
        <p>Your thoughts remain yours</p>
      </div>

      <div class='about-content'>
        <h2>Our Commitment to Privacy</h2>

        <p class='lead'>
          We believe citizens of a free society must be able to choose privacy. This is not merely a policy—it is a{' '}
          foundational principle. In a world increasingly hostile to individual privacy, this space is designed to be
          {' '}
          different.
        </p>

        <p class='callout'>
          <strong>Core Principle:</strong>{' '}
          Your data belongs to you. Not to us. Not to advertisers. Not to algorithms designed to manipulate your{' '}
          attention.
        </p>

        <h2>What We Collect</h2>

        <h3>Newsletter Subscriptions</h3>
        <p>If you choose to subscribe to our newsletter, we collect only your email address. This data is:</p>
        <ul class='about-links'>
          <li>
            <strong>Never stored as an address.</strong>{' '}
            We keep only a SHA-256 hash of it; the address itself is discarded once your mail is sent
          </li>
          <li>
            <strong>Never shared</strong> with third parties, beyond the mail servers that carry the message to you
          </li>
          <li>
            <strong>Never sold</strong> or monetized in any way
          </li>
          <li>
            <strong>Used solely</strong> for sending you occasional updates about new content
          </li>
        </ul>

        <h3>Questionnaire Responses</h3>
        <p>When you answer the Proust Questionnaire or any other self-inquiry tools on this site:</p>
        <ul class='about-links'>
          <li>
            Your responses <strong>are sent to our server</strong> — they are not kept in your browser
          </li>
          <li>
            They are <strong>age-encrypted on arrival</strong>, by a separate service that holds the only write path
            {' '}
            for answer text
          </li>
          <li>
            <strong>No plaintext is stored.</strong>{' '}
            The columns that once held answer text are deliberately written empty, and nothing reads them
          </li>
          <li>
            The encryption <strong>fails closed</strong>: if that service is unavailable your submission is refused{' '}
            outright rather than stored in the clear
          </li>
          <li>
            You are identified only by a <strong>SHA-256 hash of your email address</strong>{' '}
            — the address itself is never stored
          </li>
          <li>
            Clearing your browser <strong>does not remove them</strong>. There is no self-service deletion yet; write
            {' '}
            to us and we will erase your answers
          </li>
        </ul>

        <h2>What We Don't Collect</h2>

        <ul class='about-links'>
          <li>
            <strong>No tracking cookies:</strong> We do not use tracking cookies or similar technologies
          </li>
          <li>
            <strong>No analytics:</strong> No Google Analytics, no Facebook Pixel, no third-party analytics services
          </li>
          <li>
            <strong>No fingerprinting:</strong> We do not attempt to identify you across sessions or devices
          </li>
          <li>
            <strong>No behavioral profiling:</strong> We do not build profiles of your interests or behaviors
          </li>
          <li>
            <strong>No advertising networks:</strong> We do not participate in ad networks or retargeting
          </li>
        </ul>

        <Ornament />

        <h2>Technical Details</h2>

        <h3>Server Logs</h3>
        <p>
          Like all web servers, our server maintains basic access logs for operational purposes (debugging,{' '}
          preventing abuse). These logs contain:
        </p>
        <ul class='about-links'>
          <li>Request timestamps</li>
          <li>Requested URLs</li>
          <li>HTTP status codes</li>
          <li>How long each request took to serve</li>
        </ul>
        <p>
          <strong>Not IP addresses.</strong>{' '}
          The server discards the address before the log line is written. Request headers and response cookies are
          discarded the same way.
        </p>
        <p>
          We keep an aggregate estimate of visits, and nothing else. No identifier for you is kept — what is written
          down is a number. We do not track.
        </p>
        <p>These logs are never used for tracking or profiling and are retained only for operational security.</p>

        <h3>Encryption</h3>
        <p>
          All data transmission occurs over HTTPS (TLS 1.3). Newsletter email addresses are encrypted at rest using{' '}
          AES-256-GCM with keys stored separately from the encrypted data.
        </p>

        <h2>Your Rights</h2>

        <p>You have the right to:</p>
        <ul class='about-links'>
          <li>
            <strong>Access your data:</strong> Request a copy of any data we store about you
          </li>
          <li>
            <strong>Delete your data:</strong> Request deletion of your email address from our newsletter database
          </li>
          <li>
            <strong>Export your data:</strong> Receive your data in a portable format
          </li>
          <li>
            <strong>Opt-out:</strong> Unsubscribe from the newsletter at any time via the link in any email
          </li>
        </ul>

        <Ornament />

        <h2>Philosophy</h2>

        <p>
          This privacy policy reflects a philosophical commitment, not just a legal obligation. The self-inquiry{' '}
          encouraged by the questionnaire requires a safe, private space. Without privacy, honest self-reflection{' '}
          becomes performative—shaped by the imagined gaze of others.
        </p>

        <figure class='epigraph'>
          <blockquote>
            <p>
              “The freedom of the uninterrupted delight of I-consciousness is completely independent of any reference
              {' '}
              to anything else.”
            </p>
          </blockquote>
          <figcaption>Abhinavagupta</figcaption>
        </figure>

        <p>This freedom requires privacy. We are committed to providing it.</p>

        <h2>Changes to This Policy</h2>

        <p>
          If we make changes to this privacy policy, we will update this page and note the revision date below.{' '}
          Significant changes will be announced to newsletter subscribers.
        </p>

        <p class='policy-revised'>Last updated: July 28, 2026</p>

        <h2>Contact</h2>

        <p>
          Questions, concerns, or requests regarding your privacy? Visit our <a href='/contact.html'>contact page</a>.
        </p>
      </div>
    </PageShell>
  );
}
