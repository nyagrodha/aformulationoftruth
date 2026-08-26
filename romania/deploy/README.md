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
    python3             # send_mail.py — see below

## Mail leaves through a relay

This provider blocks outbound 25/465/587, so the key box cannot reach a
submission service directly. `a4t-smtp-relay.service` opens an ssh forward to
gimbal, and `/etc/hosts` maps `smtp.mail.me.com` to `127.0.0.1` so the client
still _names_ the real host — SNI and certificate verification therefore
succeed, TLS runs end to end between here and Apple, and gimbal forwards bytes
it cannot read. The relay key is restricted at gimbal with
`permitopen="smtp.mail.me.com:587"`, so it can open that one forward and
nothing else.

Sending is `send_mail.py`, not denomailer: denomailer 1.6.0 fails this exact
submission (`invalid cmd`, then `Bad resource ID`) on a socket where Python
smtplib completes STARTTLS and authenticates without complaint.

## The working directory must be tmpfs

`RENDER_WORK_ROOT` defaults to **`/tmp`**, not `/dev/shm`. Deno treats
`/dev/shm` as a special path and refuses every operation there without
`--allow-all` (`NotCapable: Requires all access to ...`), which would mean
un-sandboxing the service to obtain a tmpfs it already has: `/tmp` is tmpfs on
this host, and the unit sets `PrivateTmp=true`, so the service gets a private,
memory-backed `/tmp` that no other process can see.

The decrypted questionnaire and the unprotected PDF exist there for the
duration of one request, and nowhere else in the system. `keystore.shredIdentity` unlinks; it does not securely erase — the
guarantee comes from the pages being memory-backed. **If the key directory or
the work root is ever moved onto persistent storage, that guarantee is gone and
nothing in the code will notice.**

## Environment

    RENDER_TOKEN            required; the service refuses to start without it
    RENDER_BIND             default 127.0.0.1 — expose only over the mesh
    RENDER_PORT             default 8791
    KEYBOX_KEY_DIR          default /home/liar/keybox (0700)
    RENDER_WORK_ROOT        default /tmp (tmpfs + PrivateTmp)
    RENDER_CALLBACK_URL     web tier, to stamp pdf_delivered_at. The service
                            POSTs to `$RENDER_CALLBACK_URL/delivered`, so the
                            path segment matters — the origin alone gives a
                            404, which is exactly how this went unnoticed until
                            2026-08-19. Set it to
                            `http://127.0.0.1:8794/api/responses`: see
                            "The callback comes back down the tunnel" below.
    RENDER_CALLBACK_TOKEN   must equal RENDER_CALLBACK_TOKEN in the web tier's
                            .env, or the callback 401s and the shred clock
                            never starts

## The callback comes back down the tunnel

`a4t-keybox-tunnel.service` on gimbal opens **two** forwards on one
authenticated ssh channel. ssh runs on gimbal and connects to the key box, so
the key box is the ssh *server* and `-R` binds there:

    -L 127.0.0.1:8793:127.0.0.1:8791   binds on gimbal   -> key box render service, to push bundles
    -R 127.0.0.1:8794:127.0.0.1:7268   binds on key box  -> gimbal web tier, to confirm delivery

So the confirmation never crosses the public internet. It used to: the key box
posted to `https://aformulationoftruth.com` from a public IP, through Caddy,
protected by a bearer token alone. Now both directions ride the same channel,
both ends bind loopback only, and `ExitOnForwardFailure=yes` means a tunnel
that cannot establish *both* forwards exits and retries rather than running
half-open with one direction silently dead.

Plain HTTP on 8794 is correct, not an oversight — ssh is the transport
security, and terminating TLS inside an already-encrypted tunnel would buy
nothing.
    SMTP_HOST/PORT/SECURE/USER/PASS, FROM_EMAIL

Port 465 is blocked outbound from some hosts in this fleet; 587/STARTTLS works.

## Shredding

`a4t-keyshred.timer` runs `shredExpired` daily with
`{ afterDelivery: 7, absolute: 30 }`:

- delivered keys die 7 days after the **first** send (re-sends never extend it)
- undelivered keys die 30 days after the **last sign of life**, not after the
  key was minted — a respondent who answers a few questions, closes the tab and
  returns three weeks later must not have their key collected mid-questionnaire
