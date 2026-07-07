/**
 * Profile Choice Page
 *
 * GET /profile-choice
 *
 * Explains the optional public profile path after questionnaire completion.
 */

import LogoMenu from '../components/LogoMenu.tsx';

export default function ProfileChoicePage() {
  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>a formulation of truth</title>
        <meta
          name='description'
          content='Optional public profile creation after completing the questionnaire.'
        />
        <link rel='stylesheet' href='/css/main.css' />
      </head>
      <body>
        <nav>
          <LogoMenu />
          <div class='nav-links'>
            <a href='/about.html'>about</a>
            <a href='/contact.html'>contact</a>
          </div>
        </nav>

        <main>
          <section class='section gate-section' style='min-height: 100vh; display: flex; align-items: center;'>
            <div class='gate-content'>
              <div
                class='gate-icon'
                style='color: var(--neon-emerald); text-shadow: 0 0 20px var(--emerald-glow), 0 0 40px var(--emerald-glow);'
              >
                +
              </div>

              <h2 class='gate-title' style='color: var(--neon-emerald); text-shadow: 0 0 15px var(--emerald-glow);'>
                profile
              </h2>

              <p class='gate-description'>
                A profile is optional. Without one, the questionnaire can end here. With one, a person may choose to
                keep an encrypted private space, or render public some or all answers from the questionnaire they
                completed.
              </p>

              <div class='quote-block' style='text-align: left; max-width: 560px; margin: 2rem auto;'>
                <p>
                  Public means selected answers may be displayed to other visitors. Private means they remain outside
                  the public profile surface.
                </p>
                <cite>choice before publication</cite>
              </div>

              <div style='max-width: 560px; margin: 0 auto 2rem; text-align: left;'>
                <p class='section-text'>
                  The profile path should ask for explicit consent before any answer appears publicly.
                </p>
                <p class='section-text'>
                  The useful controls are simple: create no profile, create a private profile, or create a public
                  profile with per-answer visibility.
                </p>
                <p class='section-text'>
                  A public profile should also include a way to unpublish answers later.
                </p>
                <p class='section-text'>
                  The same profile path can support paid anonymous mail to other folks without requiring the sender to
                  make their own answers public.
                </p>
              </div>

              <div style='display: flex; flex-wrap: wrap; justify-content: center; gap: 1rem;'>
                <a href='/profile-create' class='cta cta-primary'>create a profile</a>
                <a href='/completion' class='cta'>back</a>
                <a href='/' class='cta'>return to the beginning</a>
              </div>
            </div>
          </section>
        </main>

        <footer>
          <div class='footer-inner'>
            <div class='footer-links'>
              <a href='/about.html'>about</a>
              <a href='/contact.html'>contact</a>
              <a href='/privacy.html'>privacy</a>
            </div>
            <p class='footer-copy'>
              Encrypted database hosted in Iceland by{' '}
              <a
                href='https://fobdongle.com'
                target='_blank'
                rel='noopener'
                style='color: var(--neon-emerald); text-decoration: none;'
              >
                FlokiNET
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
