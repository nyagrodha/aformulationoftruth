/**
 * One profile, addressed at /p/<handle>.
 *
 * Resolves for any profile with that handle, listed or not. Being findable in
 * the directory and being reachable by a handle someone handed you are
 * separate decisions.
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import Nav from '../../islands/Nav.tsx';
import { NAV_NOSCRIPT_CSS, PAGE_NAV } from '../../components/nav-shared.ts';
import { increment } from '../../lib/metrics.ts';
import { getProfileByHandle } from '../../lib/profiles.ts';

interface Data {
  handle: string;
  displayName: string | null;
  bio: string | null;
}

export const handler: Handlers<Data> = {
  async GET(_req, ctx) {
    const profile = await getProfileByHandle(ctx.params.handle);

    if (!profile || !profile.handle) {
      increment('profile.view.notfound');
      return ctx.renderNotFound();
    }

    increment('profile.view');
    return ctx.render({
      handle: profile.handle,
      displayName: profile.displayName,
      bio: profile.bio,
    });
  },
};

export default function ProfilePage({ data }: PageProps<Data>) {
  const { handle, displayName, bio } = data;
  const name = displayName || handle;

  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>{name} · a formulation of truth</title>
        <meta name='description' content={`The profile of ${name}.`} />
        <link rel='stylesheet' href='/css/main.css' />
        <link rel='stylesheet' href='/css/nav-mark.css' />
        <noscript>
          <style>{NAV_NOSCRIPT_CSS}</style>
        </noscript>
      </head>
      <body>
        <header class='site-header'>
          <Nav items={PAGE_NAV} />
        </header>
        <main>
          <section class='section' style='padding-top: 7rem;'>
            <div class='gate-content' style='max-width: 640px; margin: 0 auto;'>
              <p>
                <a href='/people'>← people</a>
              </p>
              <h1 class='gate-title'>{name}</h1>
              <p class='gate-description'>@{handle}</p>
              {bio ? <p class='section-text'>{bio}</p> : null}
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
