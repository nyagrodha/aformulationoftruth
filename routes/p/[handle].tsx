/**
 * One profile.
 *
 *   /p/<handle>   a PUBLIC profile. A private one answers 404 here, the same
 *                 404 as a handle nobody holds, so handles cannot be probed.
 *   /p/~<slug>    any profile, by its owner's private link (lib/profiles.ts).
 *                 Never indexed: the URL is the only thing keeping it private.
 */

import { Head } from '$fresh/runtime.ts';
import { Handlers, PageProps } from '$fresh/server.ts';
import { increment } from '../../lib/metrics.ts';
import { getProfileBySlug, getPublicProfileByHandle } from '../../lib/profiles.ts';
import TipJar from '../../components/TipJar.tsx';

interface Data {
  handle: string | null;
  displayName: string | null;
  bio: string | null;
  /** Reached through a private link rather than by handle. */
  viaPrivateLink?: boolean;
}

export const handler: Handlers<Data> = {
  async GET(_req, ctx) {
    const param = ctx.params.handle;
    const viaPrivateLink = param.startsWith('~');
    const profile = viaPrivateLink ? await getProfileBySlug(param.slice(1)) : await getPublicProfileByHandle(param);

    // A private-link profile needs no handle; a handle-addressed one has one by
    // construction, but a public row predating that rule is still refused.
    if (!profile || (!viaPrivateLink && !profile.handle)) {
      increment('profile.view.notfound');
      return ctx.renderNotFound();
    }

    increment(viaPrivateLink ? 'profile.view.private_link' : 'profile.view');
    const response = await ctx.render({
      handle: profile.handle,
      displayName: profile.displayName,
      bio: profile.bio,
      viaPrivateLink,
    });
    if (viaPrivateLink) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
      response.headers.set('Cache-Control', 'no-store');
    }
    return response;
  },
};

export default function ProfilePage({ data }: PageProps<Data>) {
  const { handle, displayName, bio, viaPrivateLink } = data;
  const name = displayName || handle || 'a private profile';

  return (
    <>
      <Head>
        <title>{name} · a formulation of truth</title>
        <meta name='description' content={`The profile of ${name}.`} />
        {viaPrivateLink ? <meta name='robots' content='noindex, nofollow' /> : null}
        <link rel='stylesheet' href='/css/tool.css' />
      </Head>
      <main>
        <a class='pill' href='/people'>← people</a>
        <p class='eyebrow'>{viaPrivateLink ? 'profile · shared privately' : 'profile'}</p>
        <h1>{name}</h1>
        <p class='lede'>
          {handle ? <span class='handle'>@{handle}</span> : null}
          {bio
            ? (
              <>
                {handle ? <br /> : null}
                {bio}
              </>
            )
            : null}
        </p>
      </main>
      <TipJar />
    </>
  );
}
