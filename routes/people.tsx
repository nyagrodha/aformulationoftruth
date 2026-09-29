/**
 * The directory: profiles that chose to be listed.
 *
 * Nothing on this page is private. Every row is a profile whose owner set
 * visibility='public', which routes/api/profile.ts only accepts alongside a
 * handle. Profile links work without scripting.
 */

import { Head } from '$fresh/runtime.ts';
import { Handlers, PageProps } from '$fresh/server.ts';
import { increment } from '../lib/metrics.ts';
import { listPublicProfiles, type Profile } from '../lib/profiles.ts';
import TipJar from '../components/TipJar.tsx';
import Nav from '../islands/Nav.tsx';
import { NAV_NOSCRIPT_CSS, PAGE_NAV } from '../components/nav-shared.ts';

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
    <>
      <Head>
        <title>people · a formulation of truth</title>
        <meta name='description' content='Profiles that have chosen to be listed.' />
        <link rel='stylesheet' href='/css/tool.css' />
        <link rel='stylesheet' href='/css/nav-mark.css' />
        {/* The toggle is inert without JS, so leave the fan open instead. */}
        <noscript>
          <style>{NAV_NOSCRIPT_CSS}</style>
        </noscript>
      </Head>
      <header class='site-header'>
        <Nav items={PAGE_NAV} current='/people' />
      </header>
      <main>
        <p class='eyebrow'>directory · opt-in only</p>
        <h1>people</h1>
        <p class='lede'>
          Everyone who chose to be listed.
        </p>

        {people.length === 0
          ? (
            <div class='panel'>
              <p class='empty'>
                Nobody is listed yet. A profile appears here once its owner sets it to public.{' '}
                <a href='/profile-create'>Create yours</a>.
              </p>
            </div>
          )
          : (
            <ul class='people'>
              {people.map((p) => (
                <li class='person' key={p.handle}>
                  <h3>{p.displayName || p.handle}</h3>
                  <span class='handle'>@{p.handle}</span>
                  {p.bio ? <p class='bio'>{p.bio}</p> : null}
                  <div class='foot'>
                    <a class='pill' href={`/p/${p.handle}`}>view profile</a>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </main>
      <TipJar />
    </>
  );
}
