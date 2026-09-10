/**
 * Profile Create Page
 *
 * GET /profile-create
 *
 * Landing page after a person chooses to create a profile.
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import Nav from '../islands/Nav.tsx';
import { NAV_NOSCRIPT_CSS, PAGE_NAV } from '../components/nav-shared.ts';
import { increment } from '../lib/metrics.ts';
import { identityFromRequest } from '../lib/profile-session.ts';
import {
  emptyToNull,
  formVisibilityToSchema,
  getProfile,
  PROFILE_BIO_MAX,
  PROFILE_DISPLAY_NAME_MAX,
  profileAfterSavePath,
  ProfileFieldsSchema,
  saveProfile,
} from '../lib/profiles.ts';

interface ProfileCreateData {
  visibilityChoice: 'private' | 'selected' | 'anonymous-mail';
  displayName: string;
  handle: string;
  bio: string;
  error?: string;
}

function visibilityChoiceFromProfile(
  visibility: 'private' | 'public',
  acceptsMail: boolean,
): ProfileCreateData['visibilityChoice'] {
  if (visibility === 'public') return 'selected';
  if (acceptsMail) return 'anonymous-mail';
  return 'private';
}

/**
 * Same identity as /profile-choice, including a finished questionnaire.
 */
export const handler: Handlers<ProfileCreateData> = {
  async GET(req, ctx) {
    increment('requests.api');

    const identity = await identityFromRequest(req);
    if (!identity) {
      return new Response(null, { status: 302, headers: { Location: '/' } });
    }

    const existing = await getProfile(identity.emailHash);
    return ctx.render({
      visibilityChoice: existing ? visibilityChoiceFromProfile(existing.visibility, existing.acceptsMail) : 'private',
      displayName: existing?.displayName ?? '',
      handle: existing?.handle ?? '',
      bio: existing?.bio ?? '',
    });
  },

  async POST(req, ctx) {
    increment('requests.api');

    const identity = await identityFromRequest(req);
    if (!identity) {
      return new Response(null, { status: 302, headers: { Location: '/' } });
    }

    const form = await req.formData();
    const choice = String(form.get('visibility') ?? 'private');
    const mapped = formVisibilityToSchema(choice);
    const displayNameRaw = String(form.get('profile-name') ?? '');
    const handleRaw = String(form.get('profile-handle') ?? '');
    const bioRaw = String(form.get('profile-note') ?? '');

    const parsed = ProfileFieldsSchema.safeParse({
      handle: handleRaw,
      displayName: displayNameRaw,
      bio: bioRaw,
      visibility: mapped.visibility,
      acceptsAnonymousMail: mapped.acceptsAnonymousMail,
    });
    if (!parsed.success) {
      increment('errors.4xx');
      const issue = parsed.error.issues[0];
      return ctx.render(
        {
          visibilityChoice: choice === 'selected' || choice === 'anonymous-mail' ? choice : 'private',
          displayName: displayNameRaw,
          handle: handleRaw,
          bio: bioRaw,
          error: issue?.message ?? 'Check the profile fields.',
        },
        { status: 400 },
      );
    }

    const displayName = emptyToNull(parsed.data.displayName);
    const handle = emptyToNull(parsed.data.handle);
    const bio = emptyToNull(parsed.data.bio);

    const result = await saveProfile(identity.emailHash, {
      handle,
      displayName,
      bio,
      visibility: parsed.data.visibility,
      acceptsAnonymousMail: parsed.data.acceptsAnonymousMail,
    });

    if (!result.ok) {
      if (result.status === 409) increment('profile.handle_taken');
      else if (result.status >= 500) increment('errors.5xx');
      else increment('errors.4xx');
      return ctx.render(
        {
          visibilityChoice: choice === 'selected' || choice === 'anonymous-mail' ? choice : 'private',
          displayName: displayName ?? '',
          handle: handle ?? '',
          bio: bio ?? '',
          error: result.error,
        },
        { status: result.status },
      );
    }

    increment('profile.saved');
    return new Response(null, {
      status: 302,
      headers: { Location: profileAfterSavePath(result.visibility, result.handle) },
    });
  },
};

export default function ProfileCreatePage({ data }: PageProps<ProfileCreateData>) {
  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>a formulation of truth</title>
        <meta name='description' content='Create an optional profile after completing the questionnaire.' />
        <link rel='stylesheet' href='/css/main.css' />
        <link rel='stylesheet' href='/css/nav-mark.css' />
        {/* The toggle is inert without JS, so leave the menu open instead. */}
        <noscript>
          <style>{NAV_NOSCRIPT_CSS}</style>
        </noscript>
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
        <header class='site-header'>
          <Nav items={PAGE_NAV} />
        </header>

        <main>
          <section class='profile-create-wrap'>
            <div class='profile-create-panel'>
              <div class='profile-create-grid'>
                <div>
                  <h1 class='profile-create-title'>make a small room</h1>
                  <p class='section-text'>
                    You selected create a profile. The nameplate can stay private, be listed, or accept anonymous mail.
                    Questionnaire answers stay encrypted. Per-answer publishing is not on this form.
                  </p>

                  <form class='profile-create-form' method='post' action='/profile-create'>
                    <fieldset class='profile-create-fieldset'>
                      <legend>visibility</legend>
                      <div class='profile-create-radio'>
                        <input
                          type='radio'
                          id='private'
                          name='visibility'
                          value='private'
                          checked={data.visibilityChoice === 'private'}
                        />
                        <label for='private'>
                          private encrypted space. not listed.
                          <p class='profile-create-note'>The profile exists for you; other visitors do not see it.</p>
                        </label>
                      </div>
                      <div class='profile-create-radio'>
                        <input
                          type='radio'
                          id='selected'
                          name='visibility'
                          value='selected'
                          checked={data.visibilityChoice === 'selected'}
                        />
                        <label for='selected'>
                          listed nameplate. handle, name, and statement appear in /people and at /p/handle.
                          <p class='profile-create-note'>
                            Questionnaire answers stay encrypted. Per-answer publishing is not available yet.
                          </p>
                        </label>
                      </div>
                      <div class='profile-create-radio'>
                        <input
                          type='radio'
                          id='anonymous-mail'
                          name='visibility'
                          value='anonymous-mail'
                          checked={data.visibilityChoice === 'anonymous-mail'}
                        />
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
                        <input
                          id='profile-name'
                          name='profile-name'
                          maxlength={PROFILE_DISPLAY_NAME_MAX}
                          placeholder='one self among many'
                          value={data.displayName}
                        />
                      </div>
                      <div class='profile-create-row'>
                        <label for='profile-handle'>handle</label>
                        <input
                          id='profile-handle'
                          name='profile-handle'
                          maxlength={64}
                          autocomplete='username'
                          spellcheck={false}
                          placeholder='weather-report'
                          value={data.handle}
                        />
                      </div>
                      <div class='profile-create-row'>
                        <label for='profile-note'>small statement</label>
                        <textarea
                          id='profile-note'
                          name='profile-note'
                          maxlength={PROFILE_BIO_MAX}
                          placeholder='Write the thing that may or may not belong under your name.'
                        >
                          {data.bio}
                        </textarea>
                      </div>
                    </fieldset>

                    <p class='profile-create-note'>
                      Per-answer publishing is not available yet. Visibility only controls the nameplate (handle, name,
                      statement), not questionnaire answers.
                    </p>

                    <div class='profile-create-actions'>
                      <button type='submit' id='profile-save-btn' class='cta cta-primary'>save this profile</button>
                      <a href='/completion' class='cta'>not tonight</a>
                    </div>
                    <p id='profile-save-status' class='profile-create-note' role='status' aria-live='polite'>
                      {data.error ?? ''}
                    </p>
                  </form>
                </div>

                <aside class='profile-create-side'>
                  <h2>before anything leaves the room</h2>
                  <ol>
                    <li>private is a complete choice.</li>
                    <li>listing a nameplate does not publish answers.</li>
                    <li>anonymous mail is separate from listing.</li>
                    <li>you can change the nameplate later.</li>
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

        <script src='/js/profile-create.js'></script>
      </body>
    </html>
  );
}
