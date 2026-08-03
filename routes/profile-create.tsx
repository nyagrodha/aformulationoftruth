/**
 * Profile Create Page
 *
 * GET /profile-create
 *
 * Landing page after a person chooses to create a profile.
 */

import { Handlers } from '$fresh/server.ts';
import LogoMenu from '../components/LogoMenu.tsx';
import { verifyQuestionnaireJWT } from '../lib/jwt.ts';
import { getSessionById } from '../lib/questionnaire-session.ts';
import { increment } from '../lib/metrics.ts';

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Same magic-link session gate as /profile-choice: a valid `jwt` cookie
 * resolving to an active session, else redirect to the gate at `/`.
 * No PII is read or logged.
 */
export const handler: Handlers = {
  async GET(req, ctx) {
    increment('requests.api');

    const jwtToken = getCookie(req.headers.get('Cookie'), 'jwt');
    if (!jwtToken) {
      return new Response(null, { status: 302, headers: { Location: '/' } });
    }

    const jwtPayload = await verifyQuestionnaireJWT(jwtToken);
    if (!jwtPayload) {
      return new Response(null, { status: 302, headers: { Location: '/' } });
    }

    const session = await getSessionById(jwtPayload.session_id);
    if (!session) {
      return new Response(null, { status: 302, headers: { Location: '/' } });
    }

    return ctx.render();
  },
};

export default function ProfileCreatePage() {
  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>a formulation of truth</title>
        <meta name='description' content='Create an optional profile after completing the questionnaire.' />
        <link rel='stylesheet' href='/css/main.css' />
        <style>
          {`
            .profile-create-wrap {
              width: min(980px, calc(100% - 2rem));
              margin: 0 auto;
              padding: 7rem 0 4rem;
            }

            .profile-create-panel {
              border: 1px solid var(--ghost);
              background:
                linear-gradient(180deg, rgba(0, 255, 170, 0.055), rgba(255, 255, 255, 0.015)),
                var(--obsidian);
              box-shadow: 0 0 40px rgba(0, 255, 170, 0.08);
              padding: clamp(1rem, 3vw, 2rem);
            }

            .profile-create-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
              gap: 2rem;
              align-items: start;
            }

            .profile-create-title {
              font-family: 'Orbitron', ui-sans-serif, system-ui, sans-serif;
              font-size: clamp(1.7rem, 4vw, 3.6rem);
              line-height: 1.05;
              color: var(--neon-emerald);
              text-shadow: 0 0 18px var(--emerald-glow);
              margin: 0 0 1rem;
            }

            .profile-create-form {
              display: grid;
              gap: 1.2rem;
              margin-top: 1.5rem;
            }

            .profile-create-fieldset {
              border: 1px dashed var(--ghost);
              padding: 1rem;
              margin: 0;
            }

            .profile-create-fieldset legend {
              padding: 0 0.5rem;
              color: var(--neon-orange);
              font-family: 'Orbitron', ui-sans-serif, system-ui, sans-serif;
              font-size: 0.78rem;
              text-transform: lowercase;
            }

            .profile-create-row {
              display: grid;
              gap: 0.45rem;
              margin-bottom: 0.85rem;
            }

            .profile-create-row:last-child {
              margin-bottom: 0;
            }

            .profile-create-row label,
            .profile-create-radio label {
              color: var(--pearl);
              font-size: 0.86rem;
            }

            .profile-create-row input,
            .profile-create-row textarea {
              width: 100%;
              box-sizing: border-box;
              border: 1px solid rgba(255, 255, 255, 0.22);
              background: #08080c;
              color: var(--pearl);
              font: 0.95rem 'Courier New', monospace;
              padding: 0.7rem;
              border-radius: 0;
              outline: none;
            }

            .profile-create-row textarea {
              min-height: 8rem;
              resize: vertical;
            }

            .profile-create-row input:focus,
            .profile-create-row textarea:focus {
              border-color: var(--neon-emerald);
              box-shadow: 0 0 0 2px rgba(0, 255, 170, 0.16);
            }

            .profile-create-radio {
              display: grid;
              grid-template-columns: 1rem minmax(0, 1fr);
              gap: 0.55rem;
              align-items: start;
              margin: 0.55rem 0;
            }

            .profile-create-radio input {
              margin-top: 0.2rem;
              accent-color: #00ffaa;
            }

            .profile-create-note {
              font-size: 0.78rem;
              color: var(--mist);
              line-height: 1.7;
              margin: 0.45rem 0 0;
            }

            .profile-create-side {
              border-left: 1px solid var(--ghost);
              padding-left: 1.5rem;
            }

            .profile-create-side h2 {
              color: var(--neon-pink);
              font-size: 1rem;
              margin: 0 0 1rem;
              font-family: 'Orbitron', ui-sans-serif, system-ui, sans-serif;
              text-shadow: 0 0 14px var(--pink-glow);
            }

            .profile-create-side ol {
              color: var(--pearl);
              padding-left: 1.25rem;
              line-height: 1.8;
              font-size: 0.9rem;
            }

            .profile-create-actions {
              display: flex;
              flex-wrap: wrap;
              gap: 1rem;
              align-items: center;
              margin-top: 1rem;
            }

            @media (max-width: 820px) {
              .profile-create-grid {
                grid-template-columns: 1fr;
              }

              .profile-create-side {
                border-left: 0;
                border-top: 1px solid var(--ghost);
                padding-left: 0;
                padding-top: 1.5rem;
              }
            }
          `}
        </style>
      </head>
      <body>
        <nav>
          <LogoMenu />        </nav>

        <main>
          <section class='profile-create-wrap'>
            <div class='profile-create-panel'>
              <div class='profile-create-grid'>
                <div>
                  <h1 class='profile-create-title'>make a small room</h1>
                  <p class='section-text'>
                    You selected create a profile. This can be private, public, or some awkward middle interval you
                    adjust later.
                  </p>

                  <form class='profile-create-form'>
                    <fieldset class='profile-create-fieldset'>
                      <legend>visibility</legend>
                      <div class='profile-create-radio'>
                        <input type='radio' id='private' name='visibility' value='private' checked />
                        <label for='private'>
                          private encrypted space. no public answers.
                          <p class='profile-create-note'>The profile exists for you; other visitors do not see it.</p>
                        </label>
                      </div>
                      <div class='profile-create-radio'>
                        <input type='radio' id='selected' name='visibility' value='selected' />
                        <label for='selected'>
                          selected answers may become public.
                          <p class='profile-create-note'>Nothing appears publicly until you choose the answers.</p>
                        </label>
                      </div>
                      <div class='profile-create-radio'>
                        <input type='radio' id='anonymous-mail' name='visibility' value='anonymous-mail' />
                        <label for='anonymous-mail'>
                          private profile plus anonymous mail.
                          <p class='profile-create-note'>
                            A paid channel for leaving mail without making yourself public.
                          </p>
                        </label>
                      </div>
                    </fieldset>

                    <fieldset class='profile-create-fieldset'>
                      <legend>nameplate</legend>
                      <div class='profile-create-row'>
                        <label for='profile-name'>display name</label>
                        <input id='profile-name' name='profile-name' placeholder='one self among many' />
                      </div>
                      <div class='profile-create-row'>
                        <label for='profile-handle'>handle</label>
                        <input id='profile-handle' name='profile-handle' placeholder='weather-report' />
                      </div>
                      <div class='profile-create-row'>
                        <label for='profile-note'>small statement</label>
                        <textarea
                          id='profile-note'
                          name='profile-note'
                          placeholder='Write the thing that may or may not belong under your name.'
                        >
                        </textarea>
                      </div>
                    </fieldset>

                    <fieldset class='profile-create-fieldset'>
                      <legend>public answers</legend>
                      <div class='profile-create-radio'>
                        <input type='radio' id='answers-none' name='answers' value='none' checked />
                        <label for='answers-none'>publish none for now</label>
                      </div>
                      <div class='profile-create-radio'>
                        <input type='radio' id='answers-review' name='answers' value='review' />
                        <label for='answers-review'>take me to a per-answer review screen</label>
                      </div>
                      <div class='profile-create-radio'>
                        <input type='radio' id='answers-all' name='answers' value='all' />
                        <label for='answers-all'>make all answers public after one more confirmation</label>
                      </div>
                    </fieldset>

                    <div class='profile-create-actions'>
                      <button type='button' id='profile-save-btn' class='cta cta-primary'>save this profile</button>
                      <a href='/completion' class='cta'>not tonight</a>
                    </div>
                    <p id='profile-save-status' class='profile-create-note' role='status' aria-live='polite'></p>
                  </form>
                </div>

                <aside class='profile-create-side'>
                  <h2>before anything leaves the room</h2>
                  <ol>
                    <li>private is a complete choice.</li>
                    <li>public answers require explicit selection.</li>
                    <li>anonymous mail is separate from answer visibility.</li>
                    <li>unpublishing should remain available later.</li>
                  </ol>

                  <div class='quote-block' style='margin-top: 2rem;'>
                    <p>
                      The profile does not prove the questionnaire. It only gives the finished work somewhere else to
                      sit.
                    </p>
                    <cite>optional by design</cite>
                  </div>
                </aside>
              </div>
            </div>
          </section>
        </main>

        <footer>
          <div class='footer-inner'>
            <div class='footer-links'>
              <a href='/about'>about</a>
              <a href='/contact.html'>contact</a>
              <a href='/privacy'>privacy</a>
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

        <script>{`
          // Progressive enhancement: POST the profile metadata to /api/profile.
          // Per-answer publishing (the "public answers" fieldset) is deferred,
          // so only visibility, nameplate, and anonymous-mail are sent here.
          (function () {
            var btn = document.getElementById('profile-save-btn');
            if (!btn) return;
            var status = document.getElementById('profile-save-status');
            function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
            function radio(name) {
              var el = document.querySelector('input[name="' + name + '"]:checked');
              return el ? el.value : '';
            }
            function say(msg) { if (status) { status.textContent = msg; } }

            btn.addEventListener('click', async function () {
              var vis = radio('visibility');
              // Map the form's visibility choice onto the profile schema.
              var visibility = vis === 'selected' ? 'public' : 'private';
              var acceptsAnonymousMail = vis === 'anonymous-mail';
              var handle = val('profile-handle').toLowerCase();

              if (visibility === 'public' && !handle) {
                say('A public profile needs a handle.');
                return;
              }

              var original = btn.textContent;
              btn.disabled = true;
              btn.textContent = 'saving…';
              say('');

              try {
                var res = await fetch('/api/profile', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    visibility: visibility,
                    acceptsAnonymousMail: acceptsAnonymousMail,
                    displayName: val('profile-name'),
                    bio: val('profile-note'),
                    handle: handle,
                  }),
                });
                var data = await res.json().catch(function () { return {}; });
                if (res.ok) {
                  window.location.href = '/completion';
                } else {
                  say(data.error || 'Could not save your profile.');
                  btn.disabled = false;
                  btn.textContent = original;
                }
              } catch (e) {
                say('Network error. Please try again.');
                btn.disabled = false;
                btn.textContent = original;
              }
            });
          })();
        `}</script>
      </body>
    </html>
  );
}
