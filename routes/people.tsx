/**
 * Profiles that chose to be listed.
 *
 * Server-rendered: a directory should exist without scripting.
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import Nav from '../islands/Nav.tsx';
import { NAV_NOSCRIPT_CSS, PAGE_NAV } from '../components/nav-shared.ts';
import { increment } from '../lib/metrics.ts';
import { listPublicProfiles, type Profile } from '../lib/profiles.ts';

interface Data {
  people: Array<Pick<Profile, 'handle' | 'displayName' | 'bio'>>;
}

export const handler: Handlers<Data> = {
  async GET(_req, ctx) {
    const profiles = await listPublicProfiles({ limit: 100 });
    increment('people.listed');
    return ctx.render({
      people: profiles.map((p) => ({
        handle: p.handle,
        displayName: p.displayName,
        bio: p.bio,
      })),
    });
  },
};

export default function PeoplePage({ data }: PageProps<Data>) {
  const { people } = data;

  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>people · a formulation of truth</title>
        <meta name='description' content='Profiles that have chosen to be listed.' />
        <link rel='stylesheet' href='/css/main.css' />
        <link rel='stylesheet' href='/css/nav-mark.css' />
        <noscript>
          <style>{NAV_NOSCRIPT_CSS}</style>
        </noscript>
        <style>
          {`
            .people-list { list-style: none; padding: 0; }
            .people-list li { margin: 0 0 1.5rem; }
            .people-list a {
              color: var(--neon-emerald);
              text-decoration: none;
              text-shadow: 0 0 12px var(--emerald-glow);
            }
            .people-list a:hover { text-decoration: underline; }
          `}
        </style>
      </head>
      <body>
        <header class='site-header'>
          <Nav items={PAGE_NAV} />
        </header>
        <main>
          <section class='section' style='padding-top: 7rem;'>
            <div class='gate-content' style='max-width: 640px; margin: 0 auto;'>
              <h1 class='gate-title'>people</h1>
              <p class='gate-description'>Everyone who chose to be listed.</p>

              {people.length === 0
                ? (
                  <p class='section-text'>
                    Nobody is listed yet. <a href='/profile-create'>Create yours</a>.
                  </p>
                )
                : (
                  <ul class='people-list'>
                    {people.map((p) => (
                      <li key={p.handle}>
                        <a href={`/p/${p.handle}`}>{p.displayName || p.handle}</a>
                        <div class='section-text'>@{p.handle}</div>
                        {p.bio ? <p class='section-text'>{p.bio}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
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
          </div>
        </footer>
      </body>
    </html>
  );
}
