/**
 * The directory: profiles that chose to be listed.
 *
 * Server-rendered rather than fetched, because a list of people is content and
 * should exist without scripting. The only thing here that needs a browser is
 * the link to write to someone, and that is an anchor.
 *
 * Nothing on this page is private. Every row is a profile whose owner set
 * visibility='public', which routes/api/profile.ts only accepts alongside a
 * handle. Whether that person also accepts messages is a separate flag, and the
 * card says which rather than offering a button that would be refused.
 */

import { Head } from '$fresh/runtime.ts';
import { Handlers, PageProps } from '$fresh/server.ts';
import { increment } from '../lib/metrics.ts';
import { listPublicProfiles, type Profile } from '../lib/profiles.ts';

interface Data {
  people: Array<Pick<Profile, 'handle' | 'displayName' | 'bio' | 'acceptsMail'>>;
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
        acceptsMail: p.acceptsMail,
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
      </Head>
      <main>
        <a class='pill' href='/'>← home</a>
        <p class='eyebrow'>directory · opt-in only</p>
        <h1>people</h1>
        <p class='lede'>
          Everyone who chose to be listed. Messages are sealed in your browser and stored as ciphertext —
          the server keeps what it cannot read.
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
                    {p.acceptsMail
                      ? <a class='pill' href={`/p/${p.handle}`}>message</a>
                      : <span class='closed'>not accepting messages</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </main>
    </>
  );
}
