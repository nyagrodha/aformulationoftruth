import { Head } from "$fresh/runtime.ts";

export default function EncryptedMessengerPage() {
  return (
    <>
      <Head>
        <title>encrypted messenger · a formulation of truth</title>
        <style>
          {`
          :root { color-scheme: dark; --bg:#05070a; --panel:#101820; --ink:#eef7f2; --muted:#9fb8ad; --line:#27433a; --green:#65e3ad; --blue:#7ca7ff; }
          * { box-sizing:border-box; }
          body { margin:0; min-height:100vh; font:16px/1.55 ui-sans-serif, system-ui; color:var(--ink); background:radial-gradient(circle at 80% 5%, #133c4f 0, transparent 34rem), var(--bg); }
          main { width:min(1040px, calc(100% - 2rem)); margin:0 auto; padding:4rem 0; }
          .eyebrow { color:var(--green); letter-spacing:.24em; text-transform:uppercase; font-weight:800; font-size:.76rem; }
          h1 { font-size:clamp(2.5rem, 8vw, 5.6rem); line-height:.92; margin:.5rem 0 1rem; }
          .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:1rem; margin-top:2rem; }
          section { background:color-mix(in srgb, var(--panel) 88%, transparent); border:1px solid var(--line); border-radius:24px; padding:1.25rem; box-shadow:0 24px 70px rgb(0 0 0 / .35); }
          label { display:block; margin:.75rem 0 .25rem; color:var(--muted); font-size:.78rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
          textarea, input { width:100%; border:1px solid var(--line); border-radius:14px; background:#071015; color:var(--ink); padding:.85rem; font:14px ui-monospace, SFMono-Regular, Menlo, monospace; }
          textarea { min-height:10rem; resize:vertical; }
          button, a.pill { display:inline-block; margin-top:.9rem; border:0; border-radius:999px; background:linear-gradient(135deg, var(--green), var(--blue)); color:#03100b; padding:.8rem 1.15rem; font-weight:900; cursor:pointer; text-decoration:none; }
          output, pre { display:block; white-space:pre-wrap; overflow-wrap:anywhere; background:#071015; border:1px solid var(--line); border-radius:14px; padding:1rem; min-height:3rem; }
        `}
        </style>
      </Head>
      <main>
        <a class="pill" href="/">← home</a>
        <p class="eyebrow">client side · AES-GCM · no server plaintext</p>
        <h1>encrypted messenger</h1>
        <p>
          Compose sealed notes in the browser. The passphrase never leaves this
          page; ciphertext can be copied into any channel and reopened here.
        </p>
        <div class="grid">
          <section>
            <h2>seal a message</h2>
            <label for="plain">plaintext</label>
            <textarea
              id="plain"
              placeholder="write what only the holder of the passphrase should read"
            />
            <label for="passphrase">passphrase</label>
            <input
              id="passphrase"
              type="password"
              autoComplete="new-password"
            />
            <button id="encrypt" type="button">encrypt</button>
            <label>sealed envelope</label>
            <output id="cipher"></output>
          </section>
          <section>
            <h2>open a message</h2>
            <label for="sealed">sealed envelope</label>
            <textarea
              id="sealed"
              placeholder='paste {"v":1,"kdf":"PBKDF2-SHA256",...}'
            />
            <label for="openPassphrase">passphrase</label>
            <input
              id="openPassphrase"
              type="password"
              autoComplete="current-password"
            />
            <button id="decrypt" type="button">decrypt</button>
            <label>plaintext</label>
            <output id="opened"></output>
          </section>
          <section>
            <h2>format</h2>
            <pre>{`{
  "v": 1,
  "kdf": "PBKDF2-SHA256",
  "iterations": 250000,
  "cipher": "AES-GCM",
  "salt": "base64",
  "iv": "base64",
  "data": "base64"
}`}</pre>
          </section>
        </div>
      </main>
      <script src="/js/messenger.js"></script>
    </>
  );
}
