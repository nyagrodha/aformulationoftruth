import { Head } from "$fresh/runtime.ts";

export default function LottoPage() {
  return (
    <>
      <Head>
        <title>zk lotto · a formulation of truth</title>
        <style>
          {`
          :root { color-scheme: dark; --bg:#08070b; --panel:#15111d; --ink:#f7efe1; --muted:#b8a98e; --line:#4a3b61; --gold:#d9af62; --violet:#9b7cff; }
          * { box-sizing: border-box; }
          body { margin:0; min-height:100vh; font:16px/1.55 ui-serif, Georgia, serif; color:var(--ink); background:radial-gradient(circle at 20% 0%, #25143c 0, transparent 34rem), var(--bg); }
          main { width:min(980px, calc(100% - 2rem)); margin:0 auto; padding:4rem 0; }
          .eyebrow { color:var(--gold); letter-spacing:.24em; text-transform:uppercase; font:700 .78rem ui-sans-serif, system-ui; }
          h1 { font-size:clamp(2.5rem, 8vw, 6rem); line-height:.9; margin:.5rem 0 1rem; }
          .grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); margin-top:2rem; }
          section { background:color-mix(in srgb, var(--panel) 88%, transparent); border:1px solid var(--line); border-radius:24px; padding:1.25rem; box-shadow:0 24px 70px rgb(0 0 0 / .35); }
          label { display:block; margin:.75rem 0 .25rem; color:var(--muted); font:700 .78rem ui-sans-serif, system-ui; text-transform:uppercase; letter-spacing:.08em; }
          input, textarea { width:100%; border:1px solid var(--line); border-radius:14px; background:#0d0a12; color:var(--ink); padding:.85rem; font:14px ui-monospace, SFMono-Regular, Menlo, monospace; }
          textarea { min-height:8rem; resize:vertical; }
          button, a.pill { display:inline-block; margin-top:.9rem; border:0; border-radius:999px; background:linear-gradient(135deg, var(--gold), var(--violet)); color:#09060d; padding:.8rem 1.15rem; font-weight:800; cursor:pointer; text-decoration:none; }
          output, pre { display:block; white-space:pre-wrap; overflow-wrap:anywhere; background:#0d0a12; border:1px solid var(--line); border-radius:14px; padding:1rem; min-height:3rem; }
          a { color:var(--gold); }
        `}
        </style>
      </Head>
      <main>
        <a class="pill" href="/">← home</a>
        <p class="eyebrow">publicly auditable · private entries</p>
        <h1>zk lotto</h1>
        <p>
          Commit locally, reveal only when you choose, and verify inclusion
          against a Merkle anchor. The Deno endpoint accepts 32-byte commitment
          hashes; draw finality is tied to a drand round.
        </p>
        <div class="grid">
          <section>
            <h2>1 · make commitment</h2>
            <label for="secret">secret phrase</label>
            <input id="secret" placeholder="keep this private" />
            <label for="salt">salt</label>
            <input id="salt" placeholder="random salt" />
            <button id="commit" type="button">hash commitment</button>
            <label>commitment</label>
            <output id="commitment"></output>
            <button id="submit" type="button">submit commitment</button>
            <label>receipt</label>
            <output id="receipt"></output>
          </section>
          <section>
            <h2>2 · verify proof</h2>
            <label for="verifyCommitment">commitment</label>
            <input id="verifyCommitment" placeholder="64 hex characters" />
            <label for="proof">proof hashes, one per line</label>
            <textarea id="proof"></textarea>
            <label for="leafIndex">leaf index</label>
            <input id="leafIndex" type="number" min="0" value="0" />
            <label for="entryCount">entry count</label>
            <input id="entryCount" type="number" min="1" value="1" />
            <label for="root">merkle root</label>
            <input id="root" placeholder="64 hex characters" />
            <button id="verify" type="button">verify inclusion</button>
            <label>verification</label>
            <output id="verification"></output>
          </section>
          <section>
            <h2>3 · audit recipe</h2>
            <pre>{`anchor_hash = sha256(merkle_root + ':' + entry_count + ':' + drand_round)

leaf = sha256(0x00 + commitment)          # leaves and nodes are tagged apart
node = sha256(0x01 + left + right)        # a lone node is carried up unchanged

draw   = int(drand_randomness, 16)
window = 2^256 - (2^256 mod entry_count)  # largest exact multiple of the pool
n      = 0
while draw >= window:                     # re-drawn, never folded
    if n == 128: fail                     # bound only; unreachable at 2^256
    draw = int(sha256('lotto/winner/v1:' + drand_randomness + ':' + n), 16)
    n   += 1
winner_index = draw mod entry_count`}</pre>
            <p>
              Operator close is served by{" "}
              <code>/api/lotto/close</code>; membership is checked at{" "}
              <code>/api/lotto/verify</code>.
            </p>
          </section>
        </div>
      </main>
      <script src="/js/lotto.js"></script>
    </>
  );
}
