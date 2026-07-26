# Wearable encounters: QR-bearing objects that invite the questionnaire

Date: 2026-07-25
Status: approved in-session (design dialogue); spec for review
Scope: this repo (site) + `heltec-dd-node` (prototype firmware)

## Concept

A wearable (or coffee-table) object displays a QR code. Scanning it opens an
invitation page on aformulationoftruth.com associated with the object's
owner. The scanner is invited to leave an email; they receive a magic link; following
it begins the questionnaire, with the encounter attributed to the owner's
object. Respondents keep full sovereignty over what they later divulge.

Prototype hardware: the "Garden Aura" Heltec WiFi LoRa 32 V4 running the
dd-node QR-billboard firmware (PSK-signed BLE-updatable QR on its OLED),
on LiPo when worn, USB-powered/lipo as the coffee-table variant.

## Privacy principles (constraints, not aspirations)

1. **Email is single-purpose plumbing.** The scanner's email exists to send
   one magic link (existing `magic_links` table). It is never shown to the
   object's owner and is not duplicated into new tables.
2. **Respondent sovereignty.** What a respondent divulges — per answer:
   all, some, none — and whether their profile is public (by degrees) or
   private is their election, made at completion (existing
   `users.profile_visibility` + phase-2 per-answer divulgence). What they
   divulge becomes available to the owner of the object they scanned.
3. **Owner-defined disclosure.** What the invitation page reveals about the
   owner is the owner's choice per object: a display name / chosen name /
   username, or nothing (`display_name` NULL renders the site's own voice:
   "You have encountered a bearer of this questionnaire"). The owner may elect that each scanner of their device may read the owner's own responses to the questionnaire upon the respondent's/scanner's completion of the questionnaire. The scanner may still elect not to divulge their own answers despite being able to see the owner's responses upon completion.
4. **Opaque tokens.** `/w/<token>` names no one. A shared or reposted QR
   URL leaks nothing about the owner.
5. **No new tracking.** The site remains no-JS; the form POST carries the
   email and token, nothing else is collected.

## Data model (SQL migration)

```sql
CREATE TABLE wearables (
  token        VARCHAR PRIMARY KEY,          -- URL-safe random, >=16 chars
  owner_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,                          -- NULL = pure mystery
  share_owner_responses BOOLEAN NOT NULL DEFAULT FALSE,  -- owner's reciprocity election
  label        VARCHAR NOT NULL,              -- e.g. 'garden-aura-proto'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at   TIMESTAMPTZ                    -- NULL until gifting flow exists
);

CREATE TABLE encounters (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wearable_token VARCHAR NOT NULL REFERENCES wearables(token) ON DELETE CASCADE,
  magic_link_id  UUID REFERENCES magic_links(id),
  created_user_id VARCHAR REFERENCES users(id),  -- stamped on link consumption
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

No scanner email in `encounters` — the magic-link row already holds it for
its own lifecycle.

Seed: one wearable row for the originary member (owner = site owner user),
label `garden-aura-proto`, display_name per owner's choice at seed time.

## Routes (Fresh, server-rendered, no JS)

- `GET /w/:token` — invitation page. Greeting per `display_name` (or the
  site's voice when NULL). When `share_owner_responses` is TRUE, the page
  states the reciprocity enticement: upon completing the questionnaire,
  the scanner will be able to read the owner's own responses. (The scanner
  remains free to divulge nothing of their own.) One email input, one
  submit. A plain-language line: the email is used to send a single link
  to begin, nothing else. Unknown/invalid token → normal 404 (no oracle).
- Reciprocity fulfillment (must exist before the flag is ever TRUE, so the
  invitation never over-promises): on questionnaire completion, a user
  whose encounter came via a share-enabled wearable can view that owner's
  responses (server-encrypted responses only; if the owner's responses are
  client-encrypted the flag cannot be enabled). Per-answer granularity of
  what the owner shares is phase 2 — MVP is all-or-nothing by the owner's
  flag.
- `POST /w/:token` — validate email shape, create the magic link via the
  existing flow, insert `encounters` row referencing it, send the email,
  render "your link is on its way" (no redirect chains, no reflection of
  the email back into the page).
- Abuse posture: server-side insert-count guard — max 20 encounters per
  token per hour (one COUNT query before insert); over the cap, render the
  same "link is on its way" page without inserting (no oracle for abusers,
  no lockout page to grief).

## Attribution

Where the existing magic-link consumption creates/loads the user, one
addition: if the link has an associated encounter row, stamp
`encounters.created_user_id`. Questionnaire flow otherwise untouched.

## Owner's view (MVP-minimal)

An authenticated page (or section) showing, per owned wearable: encounters
begun (rows) and completed (joined via created_user_id → responses
completion), as counts only. No emails, no identities, no response content
in this phase.

## Prototype firmware (heltec-dd-node repo)

New env `heltec_v4_badge`, extending the base V4 env:

- `-D DD_NO_WIFI` (new guard around `dd::beginWifi`) and `-D DD_NO_LORA`
  (new guard around SX1262 init + mesh loop): the badge is OLED + BLE only.
  Battery-facing rationale: no always-on RX, no WiFi scanning while worn.
- `DD_QR_DEFAULT_TEXT="aformulationoftruth.com/w/<token>"` (~40 bytes,
  fits the display's 53-byte QR v3 ceiling).
- PSK-signed BLE QR updates (`tools/qrctl.py` + `tools/qr_ble_send.py`)
  keep working — the owner can repoint the badge without a cable.
- Same firmware on USB power = the coffee-table model. No separate build.

## Candidate production hardware (post-prototype)

All BLE-capable ESP32-family boards with integrated color displays — the
badge firmware concept (QR + BLE-signed updates, no LoRa/WiFi) ports:

| Board | Display | Notes for this product |
|---|---|---|
| Waveshare ESP32-S3 1.43" AMOLED round | 466x466 capacitive touch, 16.7M colors | Most wearable-shaped (round, AMOLED contrast for QR); touch enables on-device consent/interaction later |
| Waveshare ESP32-S3 1.69" touch LCD | 240x280, 262K colors, accelerometer + gyroscope | IMU enables wake-on-motion (screen off in a pocket, on when presented — big battery win); same S3 toolchain as the Heltec |
| Waveshare ESP32-C6 1.47" LCD | 172x320, 262K colors, RISC-V, WiFi 6 | Lowest-cost option for gifting at scale; RISC-V core means a toolchain port (ESP-IDF/Arduino support exists) |
| LILYGO T-Watch line (Ultra: 2.06" AMOLED; S3: 1.54" IPS) or e-ink T-Echo | color touch / e-ink | The LoRa-carrying option (SX1262, same silicon as the Heltec fleet) for a future roaming-mesh wearable |

QR rendering at these resolutions supports higher QR versions and softer
aesthetics (colored quiet zones, owner theming) than the 128x64 OLED.

## Build boundary (what shipped tonight)

Shipped: schema (`fresh_wearables` + `fresh_encounters`), `/w/:token`
invitation page (both greeting modes + reciprocity enticement text),
encounter attribution at gate-submit (pseudonymous, hash-only, silent rate
cap), the seed tool. `share_owner_responses` exists and defaults FALSE.

Deferred to phase 2 (below): the reciprocity **fulfillment view** — a
completed scanner reading the owner's responses. Until it exists,
`share_owner_responses` must stay FALSE (enabling it would make the invite
page promise a reveal that cannot happen). Reading another person's
responses is consent-sensitive enough to design unhurried rather than ship
under a time-box.

## Concept: the brooch twinkles when the magic link opens

When a scanner opens the emailed magic link (their private commitment to
begin), the LEDs on the owner's brooch twinkle — the wearer feels, in the
world, that the encounter took. A closed loop: encounter → email → link
opened → the object responds. The firmware already has the NeoPixel driver
(`dd_ring`); the "twinkle" is an animation, not new hardware.

The hard part is the signal path back to a worn object, and it decides the
radio question the badge build otherwise closes:

- **Mesh path (fits the LoRa wearable variant).** `/auth/verify` (link
  opened) → the site notifies fobdongle (it already POSTs telemetry to the
  ingest API; this is the reverse edge) → fobdongle emits a signed DD1/DD2
  addressed to the brooch's sender_id → the brooch, still a mesh node,
  hears it and twinkles. Reuses the entire existing mesh + PSK trust. Cost:
  the wearable keeps its SX1262 on (the LILYGO T-Watch / roaming-mesh
  variant), not pure badge mode. Range is the mesh's range, not the room's.
- **Owner's-phone relay (fits pure badge mode).** The paired phone (already
  the BLE QR-update channel) gets a push/poll from the site and forwards a
  BLE "twinkle" command. Keeps DD_NO_LORA/DD_NO_WIFI, but only twinkles when
  the owner's phone is present and a companion app/PWA is running.
- **WiFi path.** Brooch holds a poll/WebSocket to the site; simplest logic,
  worst battery, only near known APs.

Privacy note: the twinkle must carry NO scanner identity — it is a bare
"someone you met opened the door" pulse, nothing about who. The mesh packet
would address the brooch, not name the scanner.

This is the strongest argument yet for the LoRa-carrying wearable (T-Watch
class): it turns the mesh the fleet already runs into the nervous system of
the encounter.

## Phase 2 (explicit non-goals tonight)

- Gifting/claiming flow (wearable arrives unclaimed; recipient signs up
  and claims token; `claimed_at` stamps).
- Per-answer divulgence election (all/some/none) at completion, and the
  owner-facing view of divulged responses. Consent UX designed unhurried.
- On-device touch interactions (candidate hardware).
- Brooch twinkle on magic-link open (see the Concept above; signal path
  TBD — leans toward the mesh/LoRa wearable variant).

## Deploy

- Site: this branch (`feat/wearable-encounters` off `origin/production`)
  → PR → on `fob` (`/var/www/aformulationoftruth`, the Reykjavik server,
  185.146.234.144): reconcile the dirty working tree (stash, keep), pull,
  run migration, restart `aformulationoftruth-fresh.service`.
- Firmware: build `heltec_v4_badge`, flash Garden Aura over USB, verify
  the phone-scanned QR lands on the live `/w/<token>` page end to end.

## Testing

- Migration idempotent (IF NOT EXISTS patterns matching repo convention).
- Route tests following existing patterns (magic-link flow has precedent
  scripts): GET renders both greeting modes; POST creates link + encounter;
  bad token 404s; malformed email re-renders without insert.
- Live: scan → email → link → questionnaire begins; encounter stamped;
  owner count increments.
