/**
 * Completion Page
 *
 * GET /completion
 *
 * Shown after questionnaire submission.
 */

export default function CompletionPage() {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>a formulation of truth</title>
        <meta name="description" content="An apparatus for attention. Self-inquiry through the Proust Questionnaire." />
        <link rel="stylesheet" href="/css/main.css" />
      </head>
      <body>
        <nav>
          <a href="/" class="logo">A4T</a>
          <div class="nav-links">
            <a href="/about.html">About</a>
            <a href="/contact.html">Contact</a>
          </div>
        </nav>

        <main>
          <section class="section gate-section" style="min-height: 100vh; display: flex; align-items: center;">
            <div class="gate-content">
              <div class="gate-icon" style="color: var(--neon-emerald); text-shadow: 0 0 20px var(--emerald-glow), 0 0 40px var(--emerald-glow);">
                *
              </div>

              <h2 class="gate-title" style="color: var(--neon-emerald); text-shadow: 0 0 15px var(--emerald-glow);">
                Complete
              </h2>

              <p class="gate-description">
                Your responses have been received and encrypted.
              </p>

              <div class="quote-block" style="text-align: left; max-width: 500px; margin: 2rem auto;">
                <p>"Our intonations contain our philosophy of life."</p>
                <cite>Marcel Proust</cite>
              </div>

              <p class="section-text" style="max-width: 500px; margin: 0 auto 2rem; text-align: center;">
                The questionnaire you completed is inspired by the famous
                Proust Questionnaire, a form of self-inquiry that reveals
                the interior landscape of a person.
              </p>

              <a href="/" class="cta cta-primary">Return to the beginning</a>
            </div>
          </section>
        </main>

        <footer>
          <div class="footer-inner">
            <div class="footer-links">
              <a href="/about.html">About</a>
              <a href="/contact.html">Contact</a>
              <a href="/privacy.html">Privacy</a>
            </div>
            <p class="footer-copy">
              Encrypted database hosted in Iceland by <a href="https://fobdongle.com" target="_blank" rel="noopener" style="color: var(--neon-emerald); text-decoration: none;">FlokiNET</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
