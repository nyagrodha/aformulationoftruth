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

interface Data {
  handle: string;
  displayName: string | null;
  bio: string | null;
  acceptsMail: boolean;
  /** False when the owner opted in but never finished setting up messaging. */
}

export const handler: Handlers<Data> = {
  async GET(_req, ctx) {
    const profile = await getProfileByHandle(ctx.params.handle);

    if (!profile || !profile.handle) {
      increment('profile.view.notfound');
      return ctx.renderNotFound();
    }

    /*
     * Whether this person has a keypair is NOT resolved here, and must not be.
     *
     * An earlier version looked it up, kept the key server-side, and passed a
     * `hasKey` boolean to the page -- on the reasoning that withholding the key
     * itself was what mattered. It was not: the boolean is the whole of the
     * fact worth enumerating. Anyone could walk /people, load each profile
     * unauthenticated, and read off exactly who has messaging set up, which is
     * the enumeration the opt-in exists to prevent. The key was never the
     * secret; its existence was.
     *
     * The compose box renders from acceptsMail, which its owner published on
     * purpose. If they accept mail without a keypair, the send attempt fails at
     * /api/messenger/send -- which requires a proven caller, so the same fact
     * costs an address someone can read mail at.
     */
    increment('profile.view');
    return ctx.render({
      handle: profile.handle,
      displayName: profile.displayName,
      bio: profile.bio,
      acceptsMail: profile.acceptsMail,
    });
  },
};

export default function ProfilePage({ data }: PageProps<Data>) {
  const { handle, displayName, bio, acceptsMail } = data;
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

        {acceptsMail
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
              <p class='empty'>{`${name} is not accepting messages.`}</p>
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
