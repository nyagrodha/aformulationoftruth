/**
 * Index Route - Landing Page
 *
 * GET /
 *
 * Full landing page with hero, philosophy section, and gate preview.
 */

import { Handlers } from '$fresh/server.ts';

export const handler: Handlers = {
  GET(_req, ctx) {
    return ctx.render();
  },
};

export default function Home() {
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
          <section class="hero">
            <div class="hero-content">
              <p class="tagline">An apparatus for attention</p>
              <h1 class="title">
                a formulation
                <span>of truth</span>
              </h1>
              <p class="subtitle">
                You are not one self. This is not a tragedy.
                It is more like the weather.
              </p>
              <div class="cta-group">
                <a href="/gate" class="cta cta-primary">Begin Inquiry</a>
                <a href="/about.html" class="cta">Learn More</a>
              </div>
            </div>
            <div class="scroll-indicator">
              <span></span>
            </div>
          </section>

          <section class="section">
            <div class="section-inner">
              <span class="section-label">Philosophy</span>
              <h2 class="section-title">The questionnaire as mirror</h2>
              <p class="section-text">
                The Proust Questionnaire is not a test and not a profile.
                It is a mechanic for making the past legible in the present.
                <em>A selfie taken from within.</em>
              </p>
              <p class="section-text">
                Answer. Forget your responses. Wait. The site enforces waiting.
                We'll notify with an email or a telegram message if you'd prefer.
                The mechanic works to the degree we don't perform but as
                subtly powerful users of language translate the memory any one question may conjure.
                Delight therein or maybe struggle a bit to capture wisely with word this artifact.
                Truth resides in the reconstruction those events without precedent in our world,
                where nothing ever repeats itself exactly.
              </p>

              <div class="quote-block">
                <p>
                  "We say that the hour of death cannot be forecast, but when we say this
                  we imagine that hour as placed in an obscure and distant future."
                </p>
                <cite>Marcel Proust</cite>
              </div>
            </div>
          </section>

          <section id="begin" class="section gate-section">
            <div class="gate-content">
              <div class="gate-icon">?</div>
              <h2 class="gate-title">What is your idea of perfect happiness?</h2>
              <p class="gate-description">
                These are not polite questions. They are holes in the ice.
                If you answer them honestly, something cold touches your feet.
              </p>

              <form action="/gate" method="GET" class="gate-form">
                <div class="form-group">
                  <label for="answer">Your reflection</label>
                  <div class="textarea-wrapper">
                    <div class="watermark">truth</div>
                    <textarea
                      id="answer"
                      name="preview"
                      placeholder="Take your time..."
                      aria-describedby="accessibility-hint"
                    ></textarea>
                  </div>
                  <p class="accessibility-note" id="accessibility-hint">
                    For voice input, use <a href="https://github.com/cjpais/Handy" target="_blank" rel="noopener">Handy</a> - free offline speech-to-text
                  </p>
                </div>
                <button type="submit" class="cta cta-primary" style="width: 100%;">
                  Continue
                </button>
              </form>
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

        <script>{`
          // Smooth scroll for anchor links
          document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
              e.preventDefault();
              const target = document.querySelector(this.getAttribute('href'));
              if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            });
          });

          // Intersection Observer for scroll animations
          const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
          };

          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
              }
            });
          }, observerOptions);

          // Observe sections
          document.querySelectorAll('.section-inner, .gate-content').forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
            observer.observe(el);
          });
        `}</script>
      </body>
    </html>
  );
}
