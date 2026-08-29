/**
 * One profile, and the way to write to it.
 *
 * Resolves for any profile with a handle, listed or not. Being findable in the
 * directory and being reachable by a handle someone handed you are separate
 * decisions -- see lib/profiles.ts. A profile with no handle has no address and
 * genuinely 404s.
 *
 * The compose box only appears when the owner opted in. When they have not, the
 * page says so rather than rendering a control the API would refuse.
 */

import { Head } from '$fresh/runtime.ts';
import { Handlers, PageProps } from '$fresh/server.ts';
import { increment } from '../../lib/metrics.ts';
import { getProfileByHandle } from '../../lib/profiles.ts';
import { getPublicKey } from '../../lib/messenger.ts';

interface Data {
  handle: string;
  displayName: string | null;
  bio: string | null;
  acceptsMail: boolean;
  /** False when the owner opted in but never finished setting up messaging. */
  hasKey: boolean;
}

export const handler: Handlers<Data> = {
  async GET(_req, ctx) {
    const profile = await getProfileByHandle(ctx.params.handle);

    if (!profile || !profile.handle) {
      increment('profile.view.notfound');
      return ctx.renderNotFound();
    }

    /*
     * The public key is looked up but NOT rendered into the page. The browser
     * fetches it from /api/messenger/send, which requires a proven caller --
     * embedding it here would publish who has messaging set up to anyone who
     * loads a profile, which is the enumeration the opt-in exists to prevent.
     * All this establishes is whether the compose box can work at all.
     */
    const hasKey = profile.acceptsMail ? Boolean(await getPublicKey(profile.emailHash)) : false;

    increment('profile.view');
    return ctx.render({
      handle: profile.handle,
      displayName: profile.displayName,
      bio: profile.bio,
      acceptsMail: profile.acceptsMail,
      hasKey,
    });
  },
};

export default function ProfilePage({ data }: PageProps<Data>) {
  const { handle, displayName, bio, acceptsMail, hasKey } = data;
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
          {bio ? <><br />{bio}</> : null}
        </p>

        {acceptsMail && hasKey
          ? (
            <section class='panel' id='compose' data-handle={handle}>
              <h2>write to {name}</h2>
              <p class='lede'>
                Sealed in this browser before it is sent. The server stores ciphertext and never holds the key.
              </p>

              <label for='body'>message</label>
              <textarea id='body' placeholder={`what would you like to say to ${name}?`}></textarea>

              <div id='lock-row' hidden>
                <label for='passphrase'>your passphrase</label>
                <input id='passphrase' type='password' autocomplete='current-password' />
              </div>

              <button id='send' type='button'>seal and send</button>
              <p class='status' id='status' role='status' aria-live='polite'></p>
            </section>
          )
          : (
            <section class='panel'>
              <p class='empty'>
                {acceptsMail
                  ? `${name} has not finished setting up messaging yet, so nothing can be sealed to them.`
                  : `${name} is not accepting messages.`}
              </p>
            </section>
          )}

        <p class='lede' style='margin-top:2rem'>
          <a href='/messages'>your messages →</a>
        </p>
      </main>
      <script type='module' src='/js/compose.js'></script>
    </>
  );
}
