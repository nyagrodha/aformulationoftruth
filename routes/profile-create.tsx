/**
 * Profile Create / Edit Page
 *
 * GET  /profile-create   the form, prefilled from the stored profile if any
 * POST /profile-create   intent=save | new-link | delete
 *
 * A plain HTML form that posts back here, so it works without JavaScript. It
 * used to save through an inline <script>, which preact-render-to-string
 * HTML-escaped (`&&` became `&amp;&amp;`), so the save button threw a
 * SyntaxError and did nothing for anyone.
 *
 * A successful POST redirects back here (303) with ?done=..., so a reload does
 * not resubmit. A refused one re-renders the form with what was typed and the
 * reason.
 *
 * Access (lib/profile-access.ts): a guest is sent to the gate; a session that
 * has not proved its address is told to open the emailed link; only a proven
 * session sees or changes the profile. No PII is read into logs.
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import Nav from '../islands/Nav.tsx';
import { NAV_NOSCRIPT_CSS, PAGE_NAV } from '../components/nav-shared.ts';
import { increment } from '../lib/metrics.ts';
import { checkSameOrigin } from '../lib/csrf.ts';
import { noStore, profileAccess, withRefreshedJwt } from '../lib/profile-access.ts';
import {
  BIO_MAX,
  deleteProfile,
  DISPLAY_NAME_MAX,
  getProfile,
  type Profile,
  PROFILE_ERROR_TEXT,
  type ProfileInput,
  rotatePrivateSlug,
  saveProfile,
} from '../lib/profiles.ts';
import TipJar from '../components/TipJar.tsx';

const DONE_TEXT = {
  saved: 'Saved.',
  'new-link': 'Made a new private link. The old one no longer works.',
  deleted: 'Your profile is deleted.',
} as const;
type Done = keyof typeof DONE_TEXT;

export type ProfileCreateData =
  | { state: 'unproven' }
  | {
    state: 'owner';
    /** The values the form shows: what is stored, or what was just typed. */
    values: ProfileInput;
    /** Whether a profile is stored, i.e. whether delete and the link apply. */
    exists: boolean;
    privatePath: string | null;
    done?: Done;
    error?: string;
  };

function emptyValues(): ProfileInput {
  return { handle: null, displayName: null, bio: null, visibility: 'private' };
}

function valuesOf(profile: Profile | null): ProfileInput {
  if (!profile) return emptyValues();
  return {
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio,
    visibility: profile.visibility,
  };
}

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export const handler: Handlers<ProfileCreateData> = {
  async GET(req, ctx) {
    increment('requests.api');

    const access = await profileAccess(req);
    if (access.kind === 'guest') return redirect('/');
    if (access.kind === 'unproven') {
      return noStore(withRefreshedJwt(await ctx.render({ state: 'unproven' }), access.refreshedJwt));
    }

    const profile = await getProfile(access.emailHash);
    const doneParam = new URL(req.url).searchParams.get('done');
    const done = doneParam && doneParam in DONE_TEXT ? doneParam as Done : undefined;

    return noStore(withRefreshedJwt(
      await ctx.render({
        state: 'owner',
        values: valuesOf(profile),
        exists: !!profile,
        privatePath: profile ? `/p/~${profile.privateSlug}` : null,
        done,
      }),
      access.refreshedJwt,
    ));
  },

  async POST(req, ctx) {
    increment('requests.api');

    const access = await profileAccess(req);
    if (access.kind === 'guest') return redirect('/');
    if (access.kind === 'unproven') {
      return noStore(withRefreshedJwt(
        await ctx.render({ state: 'unproven' }, { status: 403 }),
        access.refreshedJwt,
      ));
    }
    const finish = (res: Response) => noStore(withRefreshedJwt(res, access.refreshedJwt));

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      increment('errors.4xx');
      return finish(new Response('Bad request', { status: 400 }));
    }
    const field = (name: string) => {
      const v = form.get(name);
      return typeof v === 'string' ? v : null;
    };

    const stored = await getProfile(access.emailHash);
    const typed: ProfileInput = {
      handle: field('profile-handle'),
      displayName: field('profile-name'),
      bio: field('profile-note'),
      visibility: field('visibility') === 'public' ? 'public' : 'private',
    };
    const refuse = async (error: string, status: number, values = valuesOf(stored)) =>
      finish(
        await ctx.render({
          state: 'owner',
          values,
          exists: !!stored,
          privatePath: stored ? `/p/~${stored.privateSlug}` : null,
          error,
        }, { status }),
      );

    // The page form posts same-origin; anything else is a forged request.
    if (checkSameOrigin(req) !== null) {
      return refuse('This request could not be verified as coming from this site. Reload the page and try again.', 403);
    }

    const intent = field('intent');
    try {
      if (intent === 'delete') {
        if (field('confirm-delete') !== 'yes') {
          return refuse('Tick the box to confirm you want the profile deleted.', 400);
        }
        await deleteProfile(access.emailHash);
        increment('profile.deleted');
        return finish(redirect('/profile-create?done=deleted'));
      }

      if (intent === 'new-link') {
        if (!(await rotatePrivateSlug(access.emailHash))) {
          return refuse('Save a profile first.', 400);
        }
        increment('profile.link_rotated');
        return finish(redirect('/profile-create?done=new-link'));
      }

      const error = await saveProfile(access.emailHash, typed);
      if (error) {
        increment(error === 'failed' ? 'errors.5xx' : 'errors.4xx');
        if (error === 'handle_taken') increment('profile.handle_taken');
        if (error === 'failed') console.error('[profile-create] Failed to save profile');
        return refuse(PROFILE_ERROR_TEXT[error], error === 'failed' ? 500 : 400, typed);
      }
      increment('profile.saved');
      return finish(redirect('/profile-create?done=saved'));
    } catch {
      console.error('[profile-create] Profile request failed');
      increment('errors.5xx');
      return refuse(PROFILE_ERROR_TEXT.failed, 500, typed);
    }
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

            .profile-create-message {
              border: 1px solid var(--neon-emerald);
              color: var(--pearl);
              padding: 0.7rem 0.9rem;
              margin: 1rem 0 0;
              font-size: 0.9rem;
            }

            .profile-create-message.is-error {
              border-color: var(--neon-pink);
            }

            .profile-create-link {
              word-break: break-all;
              color: var(--neon-emerald);
            }

            .profile-create-secondary {
              display: grid;
              gap: 1.2rem;
              margin-top: 1.5rem;
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
                  {data.state === 'unproven' ? <UnprovenNotice /> : <OwnerForm data={data} />}
                </div>

                <aside class='profile-create-side'>
                  <h2>before anything leaves the room</h2>
                  <ol>
                    <li>private is a complete choice.</li>
                    <li>public answers require explicit selection.</li>
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
          <TipJar />
        </footer>
      </body>
    </html>
  );
}

function UnprovenNotice() {
  return (
    <>
      <p class='section-text'>
        A profile is tied to your address, so it can only be made by someone who has shown they can read mail sent
        there.
      </p>
      <p class='profile-create-message is-error' role='status'>
        Open the link we emailed you, then come back to this page.
      </p>
      <div class='profile-create-actions'>
        <a href='/completion' class='cta'>back</a>
      </div>
    </>
  );
}

function OwnerForm({ data }: { data: Extract<ProfileCreateData, { state: 'owner' }> }) {
  const { values, exists, privatePath, done, error } = data;

  return (
    <>
      <p class='section-text'>
        {exists
          ? 'This is your profile. Change anything below and save it again.'
          : 'You selected create a profile. This can be private, public, or some awkward middle interval you adjust later.'}
      </p>

      {done ? <p class='profile-create-message' role='status'>{DONE_TEXT[done]}</p> : null}
      {error ? <p class='profile-create-message is-error' role='alert'>{error}</p> : null}

      <form class='profile-create-form' method='post' action='/profile-create'>
        <input type='hidden' name='intent' value='save' />
        <fieldset class='profile-create-fieldset'>
          <legend>visibility</legend>
          <div class='profile-create-radio'>
            <input
              type='radio'
              id='private'
              name='visibility'
              value='private'
              checked={values.visibility !== 'public'}
            />
            <label for='private'>
              private. not listed.
              <p class='profile-create-note'>
                Nobody finds it by browsing or by handle. Only people you give your private link to can see it.
              </p>
            </label>
          </div>
          <div class='profile-create-radio'>
            <input
              type='radio'
              id='public'
              name='visibility'
              value='public'
              checked={values.visibility === 'public'}
            />
            <label for='public'>
              list my profile in the directory.
              <p class='profile-create-note'>
                Your name, handle, and note will be public at /p/your-handle. Your answers stay private.
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
              maxLength={DISPLAY_NAME_MAX}
              value={values.displayName ?? ''}
              placeholder='one self among many'
            />
          </div>
          <div class='profile-create-row'>
            <label for='profile-handle'>handle</label>
            <input
              id='profile-handle'
              name='profile-handle'
              maxLength={64}
              autocapitalize='none'
              spellcheck={false}
              value={values.handle ?? ''}
              placeholder='weather-report'
            />
            <p class='profile-create-note'>Lowercase letters, digits and hyphens. Needed for a public profile.</p>
          </div>
          <div class='profile-create-row'>
            <label for='profile-note'>small statement</label>
            <textarea
              id='profile-note'
              name='profile-note'
              maxLength={BIO_MAX}
              placeholder='Write the thing that may or may not belong under your name.'
            >
              {values.bio ?? ''}
            </textarea>
          </div>
        </fieldset>

        <p class='profile-create-note'>Publishing answers on your profile is not available yet.</p>

        <div class='profile-create-actions'>
          <button type='submit' class='cta cta-primary'>save this profile</button>
          <a href='/completion' class='cta'>not tonight</a>
        </div>
      </form>

      {exists && privatePath
        ? (
          <div class='profile-create-secondary'>
            <fieldset class='profile-create-fieldset'>
              <legend>private link</legend>
              <p class='profile-create-note'>
                Anyone with this link can see your profile, even while it is private:{' '}
                <a class='profile-create-link' href={privatePath}>{privatePath}</a>
              </p>
              <form method='post' action='/profile-create'>
                <input type='hidden' name='intent' value='new-link' />
                <button type='submit' class='cta'>make a new link</button>
                <p class='profile-create-note'>The current link stops working straight away.</p>
              </form>
            </fieldset>

            <fieldset class='profile-create-fieldset'>
              <legend>delete</legend>
              <form method='post' action='/profile-create'>
                <input type='hidden' name='intent' value='delete' />
                <div class='profile-create-radio'>
                  <input type='checkbox' id='confirm-delete' name='confirm-delete' value='yes' required />
                  <label for='confirm-delete'>delete my profile: name, handle, statement and private link.</label>
                </div>
                <button type='submit' class='cta'>delete profile</button>
              </form>
            </fieldset>
          </div>
        )
        : null}
    </>
  );
}
