import { Head } from '$fresh/runtime.ts';
import { Handlers, PageProps } from '$fresh/server.ts';
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
    <>
      <Head>
        <title>{name} · a formulation of truth</title>
        <meta name='description' content={`The profile of ${name}.`} />
        <link rel='stylesheet' href='/css/tool.css' />
      </Head>
      <main>
        <a class='pill' href='/people'>← people</a>
        <p class='eyebrow'>profile</p>
        <h1>{name}</h1>
        <p class='lede'>
          <span class='handle'>@{handle}</span>
          {bio
            ? (
              <>
                <br />
                {bio}
              </>
            )
            : null}
        </p>
      </main>
    </>
  );
}
