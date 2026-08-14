# Key box deployment

The render service runs on the key box — the machine that holds session
identities and **no database**. That separation is the design: compromising the
database yields ciphertext nobody can read, compromising this box yields keys
with nothing to apply them to.

Currently: `aformulationiontruth.com:2078`, Debian 13, user `liar`.

## Requirements

    typst 0.15.1        # rendering; --root scoping, json() relative to it
    qpdf 11.7+          # AES-256; --user-password=, --bits=, @argfile
    poppler-utils       # pdftotext, used by the tests
    fonts-noto-core     # Noto Serif
    fonts-noto-extra    # Noto Sans Tamil, Noto Sans Devanagari
    deno 2.x

## The working directory must be tmpfs

`RENDER_WORK_ROOT` defaults to `/dev/shm`. The decrypted questionnaire and the
unprotected PDF exist there for the duration of one request, and nowhere else in
the system. `keystore.shredIdentity` unlinks; it does not securely erase — the
guarantee comes from the pages being memory-backed. **If the key directory or
the work root is ever moved onto persistent storage, that guarantee is gone and
nothing in the code will notice.**

## Environment

    RENDER_TOKEN            required; the service refuses to start without it
    RENDER_BIND             default 127.0.0.1 — expose only over the mesh
    RENDER_PORT             default 8791
    KEYBOX_KEY_DIR          default /home/liar/keybox (0700)
    RENDER_WORK_ROOT        default /dev/shm
    RENDER_CALLBACK_URL     web tier, to stamp pdf_delivered_at
    RENDER_CALLBACK_TOKEN
    SMTP_HOST/PORT/SECURE/USER/PASS, FROM_EMAIL

Port 465 is blocked outbound from some hosts in this fleet; 587/STARTTLS works.

## Shredding

`a4t-keyshred.timer` runs `shredExpired` daily with
`{ afterDelivery: 7, absolute: 30 }`:

- delivered keys die 7 days after the **first** send (re-sends never extend it)
- undelivered keys die 30 days after the **last sign of life**, not after the
  key was minted — a respondent who answers a few questions, closes the tab and
  returns three weeks later must not have their key collected mid-questionnaire
