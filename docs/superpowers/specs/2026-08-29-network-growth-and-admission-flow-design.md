# Network growth and admission flow — design

**Date:** 2026-08-29
**Status:** draft; the two crypto items of §7 are now verified against the code (see §7)
**Verification:** 14-agent sweep of the repo, 2026-08-29; three independent crypto
investigations plus an adversarial refutation, and five section maps each adversarially
verified. Findings are cited file:line throughout.

## Summary

Almost nothing in this design exists yet. That is the single most important fact about
it, and stating it up front is more useful than discovering it section by section. What
exists today is: a two-question gate, a shuffled questionnaire, a magic-link login, a
profile with a public/private setting, a public directory at `/people`, an opaque
wearable token at `/w/:token`, and an append-only `fresh_encounters` log. What does not
exist, in any form — no table, no column, no route, no module, no scheduled job — is
**the queue, admission, capacity, slots, phases, code types, connections, rate settings,
the two fifteen-day clocks, and reminders.**

This document therefore serves as a build specification, not a description. Where a
section describes something already live, it says so and cites it.

---

## §1 Entry

**Intent.** The questionnaire is the gate, not the QR code. Anyone joins by entering an
email and working through thirty-five questions. Empty responses are allowed, but every
question must be passed through. On completion the user is offered a profile. New members
land with an empty graph, but can see members who have chosen a public profile.

**Reality.**

| Assertion | Status | Evidence |
|---|---|---|
| Questionnaire is the gate, not the QR code | **live** | `routes/index.tsx` renders the gate form; `routes/w/[token].tsx` grants no session and funnels to `/` |
| Anyone joins with an email; no allowlist or invite | **live** | `routes/api/gate-submit.ts:36` validates only `z.string().email()`; no invite check on this path |
| Thirty-five questions | **false — 31 are served** | see the defect below |
| Empty responses allowed | **live** | `gate-submit.ts:37-38` defaults answers to `''`; `routes/questionnaire.tsx:198` treats Skip and whitespace identically |
| Every question passed through | **false** | 4 of 35 are never shown; 2 of those are silently dropped at random |
| Completion offers a profile | **live** | `routes/questionnaire.tsx:235-240` → `routes/completion.tsx:130` → `/profile-choice` |
| New members land with an empty graph | **no graph exists** | no edge/connection/follow table in `db/migrations/`; `fresh_encounters` is the nearest thing and is not a member graph (see §2) |
| Can see members with a public profile | **live** | `routes/people.tsx:25` → `listPublicProfiles`, `lib/profiles.ts:146-159` |

### Defect: two questions are silently dropped from every session

This is a live bug in `main`, found while verifying the question count, and it should be
fixed before any of this design is built on top of it.

`generateQuestionOrder(hasGateAnswers = true)` already excludes the gate pair and returns
**33** shuffled indices, Q2–Q34 (`lib/questionnaire.ts:37-41`). In production
`hasGateAnswers` is always true, because `gate-submit` inserts the `fresh_gate_responses`
row before calling `createQuestionnaireSession`, which counts it
(`lib/questionnaire-session.ts:85-92`).

`routes/questionnaire.tsx:112-116` then slices that already-stripped array a second time:

```ts
const questionOrder = parseQuestionOrder(session.questionOrder);
// Questions 2-34 (33 questions total after gate)
const remainingQuestions = questionOrder.slice(2);
```

The comment states the intent correctly and the code contradicts it. `.slice(2)` would be
right only if `questionOrder` held all 35; it holds 33. The respondent is served **31**
questions, and *which* two are lost varies per session because the order is shuffled
first.

The display compounds it: `totalQuestions: 35` is hardcoded into the render payload
(`routes/questionnaire.tsx:140`) while the completion check uses the real local value of
31 (`:116`), and `overallNum = currentIndex + 3` (`:127`) numbers the last question 33.
A respondent is told "35", counted to 33, and asked 31.

**Fix:** drop the `.slice(2)` and pass `remainingQuestions.length + 2` as the displayed
total. Both paths need care — on the unreachable `hasGateAnswers = false` branch the
order is all 35 shuffled, so `slice(2)` would drop two *random* questions there too,
possibly including the gate pair.

Corpus coverage after the fix: 35 stored per respondent, 2 at the gate and 33 in the
questionnaire.

---

## §2 Codes

**Intent.** Each profile carries one primary stationary code. Ancillary codes are optional
and secondary. A rotating ephemeral code is also retained, and that one creates a
connection directly. Scanning a stationary code does not create a connection — it opens a
pending slot.

**Reality: one code type exists, and it is permanent.**

- `fresh_wearables` (`db/migrations/003_wearables_encounters.sql`) holds a single shape of
  opaque token: `token` PRIMARY KEY, `owner_email_hash`, `display_name`,
  `share_owner_responses`, `label`, `created_at`, `claimed_at`.
- **No type discriminator exists.** `stationary`, `ancillary`, and `ephemeral` return zero
  hits across every `.ts`/`.tsx`/`.sql`/`.rs` file in the repo.
- **No "primary" designation exists.** There is no `UNIQUE` on `owner_email_hash` and no
  `is_primary`/`rank`/`kind` column, so the schema permits any number of tokens per owner
  with nothing distinguishing them. `label` is a free-text operator note.
- **Nothing rotates.** `token` is the primary key and `fresh_encounters.wearable_token` is
  a foreign key onto it; there is no `expires_at`, no `rotated_at`, and no rotation logic.
  `routes/w/[token].tsx` accepts any token in the table forever. The only 24-hour lifetime
  in the flow is the browser cookie the page plants — not the code.
- **No connection concept exists** to be created directly or deferred.
- The profile↔code link is nominal: `fresh_wearables.owner_email_hash` and
  `fresh_profiles.email_hash` are the same identity anchor, but no foreign key joins them
  and no query anywhere selects a wearable by owner.

**On "scanning a stationary code does not create a connection":** true in letter, and the
one place the intent already half-exists. `/w/:token` plants an HttpOnly `wearable_token`
cookie for 24h (`routes/w/[token].tsx:53-56`); when the scanner later submits their email
at the gate, `gate-submit` reads that cookie back and inserts
`(wearable_token, scanner_email_hash)` into `fresh_encounters` (`:232`), under a silent
cap of 20 per token per hour (`:224-237`).

So the scan itself creates nothing — correct — but the gate submission that follows does
create the system's only scanner→owner edge. Two properties keep it from being a
connection in the sense this design means:

1. The address is **unverified** at that moment. `emailHash` is computed at
   `gate-submit.ts:213` from whatever the visitor typed; the magic link is minted at
   `:210` and is not clicked until `/auth/verify`. The row binds a token to a *claimed*
   address, not to an account.
2. **No capability flows from it.** `share_owner_responses` is `DEFAULT FALSE`
   (`003_wearables_encounters.sql:10`) and nothing reads the row afterwards. There is no
   owner-facing route that reads `fresh_encounters` at all.

**To build:** a `kind` discriminator (`stationary` | `ancillary` | `ephemeral`), a partial
unique index enforcing one stationary code per owner, `expires_at` + rotation for the
ephemeral kind, and a `connections` table — none of which exist.

---

## §3 The scan page

**Intent.** Collect an email before anything else, then branch three ways: no record →
answer the 35 questions; answered before but no profile → offer profile creation; existing
member → straight into the queue. Existing members who gain admission receive a connection
notification, not a magic link.

**Reality: the scan page collects nothing and branches not at all.**

`routes/w/[token].tsx` has only a `GET` handler. The rendered page contains no form, no
input, and no POST target; its sole interactive element is an anchor to `/`. The file's own
header comment says "nothing is collected here." Its four conditionals are a token-shape
404, a row-not-found 404, a greeting that varies on `display_name`, and an extra paragraph
when `share_owner_responses` is true — none of them a branch on who the scanner is,
because at that point nothing about the scanner is known.

Email is collected later and elsewhere, on the landing page's gate form
(`routes/index.tsx:294-360`) — and not even first there: the two gate-answer textareas
precede the email field.

Every accepted gate submission mails a magic link, unconditionally
(`gate-submit.ts:210, 271`). There is no membership check, no prior-history lookup, and no
notification path — `lib/email.ts` exports `sendMagicLinkEmail` and
`sendNewsletterConfirmationEmail` and nothing else. (Two further outbound-mail paths exist
outside that module — `romania/mailer.ts:65 sendDelivery()` for PDF delivery and
`rust-server/src/email.rs:7 send_magic_link` — but neither is a connection notification.)

The three-way branch requires a lookup the entry flow never performs: nothing in
`gate-submit` reads `fresh_profiles` or prior `fresh_questionnaire_sessions` to decide
anything.

**To build:** move email collection onto the scan page, add the identity lookup, and add
the two non-questionnaire branches. Note that branch 2 ("answered before, no profile") is
constrained by key expiry — see §7.

---

## §4 & §6 Queue, capacity, admission rate

**Intent.** Depth seventeen, capped per profile rather than per code. Directory requests
route through the same queue. Admission is capacity-based and automatic, no per-request
approval. Rate is user-set, floor two per day, ceiling five, zero not permitted. Scanners
see that they are pending and which phase they are in. Slots with a questionnaire still in
progress do not count against the seventeen; that outer pool is unbounded and self-clears
by expiry. Queue order derives from completion time, not scan time.

**Reality: none of this exists.** Greps for queue / pending / admission / admit / capacity
/ waitlist / slot across the tree return only an unrelated, never-built PDF-delivery retry
queue (`lib/delivery-queue.ts`, `lib/delivery-worker.ts`) and prose comments.

Specific notes worth carrying into the build:

- **The one existing cap is on the wrong axis.** `gate-submit.ts:224-237` counts
  `fresh_encounters` rows `WHERE wearable_token = $1` over the last hour and silently
  declines past 20. It is keyed on the **code**, precisely the axis this design rules out,
  and it is an anti-abuse throttle rather than an admission cap.
- **"Automatic, no per-request approval" is already true, for the wrong reason.** Nobody
  approves anything because there is nothing to approve: `gate-submit` runs straight
  through and returns 303 to `/check-email` in a single request.
- **There is no worker process.** `main.ts` starts only the Fresh server. The sole
  installed scheduled job in the repo is `deploy/systemd/qr-salt-prune.timer`. A
  capacity-drainer needs a scheduler that does not yet exist.
- **`fresh_profiles` has no settings surface for a rate.** Its complete column list is
  `email_hash, handle, display_name, bio_public, visibility, accepts_anonymous_mail,
  created_at, updated_at` (`006_profiles.sql:10-20`), and `ProfileSchema`
  (`routes/api/profile.ts:58-64`) is the entire settable surface. A `daily_admission_rate
  SMALLINT NOT NULL DEFAULT 2 CHECK (BETWEEN 2 AND 5)` column is new work.
- **Scanners currently see the opposite of pending.** They get a "begin" link, then
  `/check-email`, then a magic link. Nothing communicates waiting.
- **There is no phase concept.** The only occurrences of "phase" in the repo are a
  rotation variable in a canvas animation (`islands/QuaternarySpheroid.tsx`).
- **No directory request exists.** `/people` links straight to `/p/<handle>`; the only
  branch is whether the owner set `accepts_anonymous_mail`. Routing directory requests
  "through the same queue" means building both the request and the queue.
- **Both timestamps §6 contrasts already exist** — `fresh_questionnaire_sessions.completed_at`
  (`lib/questionnaire-session.ts:330-338`) and `fresh_encounters.created_at` — but no query
  anywhere orders by either. Ordering by completion time is therefore cheap to implement
  once a queue exists.
- **The unbounded outer pool is true in effect, false as design.** Nothing limits open
  sessions; `createQuestionnaireSession` inserts unconditionally. It does enforce one
  active session per person, by marking any prior incomplete session complete
  (`lib/questionnaire-session.ts:101-110`).

§6's fairness point — that a later scanner who answers promptly is admitted ahead of an
earlier one who dawdles — should indeed be stated in the copy, and is worth stating twice:
once on the scan page and once on the waiting page, since those are seen by different
people at different times.

---

## §5 Clocks

**Intent.** Two fifteen-day windows, sequential, never concurrent. First: fifteen days from
questionnaire start to finish it, with a reminder and start-over as recovery. Second: on
completion, an admission clock of fifteen days measured from when the slot becomes
reachable, not when it was created.

**Reality: neither window exists. One different clock does.**

- **No fifteen-day interval exists anywhere in the repo.** The only `15` is
  `TOKEN_VALIDITY_MS = 15 * 60 * 1000` — a fifteen-*minute* magic-link validity.
- **The implemented questionnaire clock is 30 days from last activity, not 15 from
  start.** `cleanupExpiredSessions` deletes on `updated_at < NOW() - INTERVAL '30 days'`,
  and `updated_at` is bumped on every answer or skip (`lib/questionnaire-session.ts:295,
  317`). The in-file comment explicitly rejects measuring from creation. Moving to "15 days
  from start" is a reversal of a deliberate decision, not a parameter change — and it will
  interact with key expiry (§7), which is also activity-based in intent.
- **No reminder exists and nothing could send one.** Zero hits for `remind`; no
  `Deno.cron`, no scheduler.
- **Start-over is unconditional and destructive, not a recovery path.** Every re-entry
  through `createQuestionnaireSession` stamps any incomplete session complete and inserts a
  fresh row with a newly shuffled order, `answered_questions = []`, `current_index = 0`.
  A respondent who returns mid-questionnaire loses their position silently. If start-over
  is to be *the* recovery path, this needs to become explicit and consented.
- **Nothing begins on completion.** `completeSession` sets `completed_at` and
  `updated_at`; no other code reads `completed_at`.
- **The schema cannot express either window.** `fresh_questionnaire_sessions` has no
  `expires_at`, `deadline_at`, `reminder_sent_at`, `admitted_at`, or `reachable_at`.

Worth noting: the created-vs-reachable distinction §5 asks for is already implemented in
the repo — for keys rather than admissions. `romania/keystore.ts:122-127` takes the
minimum of an absolute ceiling and an event-triggered clock. That is the shape to copy.

**On the directory:** `/people` and `/p/[handle]` are open to anyone, unauthenticated
(`routes/people.tsx`, `routes/p/[handle].tsx:27`). The page states "Nothing on this page is
private." Authentication is required only to *write* a profile. §1's "new members can see
public profiles" is therefore true but understated — everyone can, member or not.

---

## §7 Cryptography

Both open items are now resolved. **One is the opposite of what the design doc implies,
and the section's central privacy claim does not hold.**

### Item 1: the key lifetime is two clocks, not one

Not "roughly thirty days". `ShredPolicy` (`romania/keystore.ts:83-88`, instantiated
`romania/shred.ts:9-12`):

| clock | value | env var |
|---|---|---|
| after first successful PDF send | **7 days** | `SHRED_AFTER_DELIVERY_DAYS` (default `'7'`) |
| absolute ceiling | **30 days** | `SHRED_ABSOLUTE_DAYS` (default `'30'`) |

Whichever comes first wins; delivery only ever *shortens* the deadline
(`Math.min`, `keystore.ts:127`), and a re-send never extends it because the `delivered`
marker is write-once (`createNew: true`, `keystore.ts:61-63`). The 30 days you recalled is
the ceiling for keys that are never delivered against; anyone who actually receives their
PDF has a 7-day key.

The private key is never in Postgres — it is a `0600` file on the key box. Postgres holds
only `session_pubkey`, `encrypted_email`, and `pdf_delivered_at`
(`010_session_keys.sql:11-21`).

*Caveat:* neither env var appears in `romania/deploy/README.md`'s Environment section, and
the `EnvironmentFile` (`/home/liar/keybox.env`) is not in the repo. The live values cannot
be confirmed from source. The defaults match both the README and the test policy.

### Item 2: it is a scheduled sweep, not a per-key expiry stamp

**This is the correction that matters.** Nothing is stamped with an expiry at issuance. The
deadline is recomputed from scratch on every sweep, in TypeScript over a filesystem
directory listing — there is no SQL and no `expires_at` column for keys anywhere
(`romania/keystore.ts:112-134`):

```ts
const info = await Deno.stat(`${dir}/${entry.name}`);
const lastSeen = await readStamp(markerPath(dir, sessionId, 'seen'));
const born = info.mtime?.getTime() ?? 0;
let deadline = (lastSeen ?? born) + policy.absolute * DAY;
const delivered = await readStamp(markerPath(dir, sessionId, 'delivered'));
if (delivered !== null) {
  deadline = Math.min(deadline, delivered + policy.afterDelivery * DAY);
}
if (now.getTime() >= deadline) { await shredIdentity(dir, sessionId); }
```

The only per-key files are *event markers written after issuance* — `<id>.delivered` and
`<id>.seen` — not expiry stamps.

**Boundary behaviour.** The comparison is inclusive, so a key dies on the first sweep at or
after its deadline. The sweep is a daily systemd timer
(`OnCalendar=*-*-* 03:30:00`, `Persistent=true`, `AccuracySec=5min`), so the real ceiling
is nominal deadline **+ up to ~24h**: a delivered key can live ~8 days, an undelivered one
~31. This is exactly the boundary difference you flagged as mattering, and it lands on the
sweep side.

**Three caveats that bear on the design:**

1. **The activity clock is dead code.** `touchActivity` (`keystore.ts:79`) has no
   production caller — only its test. `romania/render-service.ts:201-202` serves exactly
   one route, `POST /render`, so no network path reaches it. `lastSeen` is therefore always
   null and the ceiling always falls back to file mtime, i.e. **30 days from issuance, not
   from last visit.** `romania/deploy/README.md:69-71` and
   `lib/questionnaire-session.ts:455-457` both describe last-visit behaviour the deployment
   does not have. The test that appears to cover this passes only because the test itself
   writes the marker.
2. **The shred timer is not enabled on the web tier.** `systemctl list-timers --all` shows
   23 timers with no `a4t-keyshred`, and `/etc/systemd/system` has no such unit. The units
   exist in the repo but the key box is a separate host; enablement there could not be
   verified from this machine. Unlike `qr-salt-prune`, `romania/deploy/README.md` gives no
   install-and-verify commands. **Verify this on the key box before relying on any expiry
   claim.**
3. **Deletion is `Deno.remove`, an unlink — explicitly not secure erasure.** The guarantee
   rests on the key directory being tmpfs (`keystore.ts:38-43`).

### The claim that does not hold: "unreadable to everyone, the operator included"

Shredding the session key removes **one of at least two** decryption paths.

- Every ciphertext is encrypted to **two** recipients: the session key *and*
  `breakglassRecipient()` — `routes/api/gate-submit.ts:136` and
  `routes/api/responses/deliver.ts:194`. An absent break-glass key is a **fatal** error
  (`lib/session-keys.ts:112-120`), by design, precisely so that shredding cannot make data
  unrecoverable.
- A global identity at `/root/.a4t/gate-identity.txt` decrypts everything, read by
  `scripts/read-gate-answers.ts`.
- **The ciphertext is never deleted.** The Rust gate exposes only `/health` and
  `/api/store`, with no delete route (`rust-server/src/main.rs:297-298`). Answers persist
  indefinitely.

So shredding bounds *who can decrypt with the key box's copy*, and for how long that
particular copy exists. It does not make the ciphertext unreadable, and it does not put the
plaintext beyond the operator. §7 must be rewritten to say so; the current wording is a
stronger privacy promise than the system delivers, and this project has a documented
history of exactly that error (see the 2026-08-10 design's own note on reversing the
`encrypted_email` promise).

### Consequences, revised

- **"No mailing a PDF copy of prior answers" is false as stated.** An approved design whose
  entire purpose is mailing a PDF copy of prior answers exists at
  `docs/superpowers/specs/2026-08-10-decryptable-questionnaire-pdf-design.md`, with Tasks
  1–3 implemented. The correct statement is narrower: *a PDF can be delivered inside the
  key window; after it, the key box can no longer render one.*
- **The "answered before, no profile" branch (§3) is bounded by the key window**, and the
  window is 7 days after a delivery or 30 from issuance — not 30 flat. Past it, that branch
  degrades to a fresh start. Given §5 proposes a 15-day questionnaire window, note the
  interaction: a respondent can exhaust a 15-day questionnaire window and still be inside
  the 30-day key ceiling, but a respondent who received a PDF on day 1 has only 7.

---

## §8 Copy

Current draft:

> aformulationoftruth.com opens with thirty-five questions. Answer them and you're in, with
> an empty graph and a code of your own. Every connection starts with a scan — yours, or
> someone's from the directory. Room opens a few at a time, so arriving takes a moment.
> You'll see where you stand while you wait.

Three of these five sentences are not currently true, and one is unfixable by copy alone:

- "thirty-five questions" — 31 are served today. Fix the bug, then the number is honest.
- "an empty graph and a code of your own" — no graph exists, and codes are minted by an
  operator CLI (`tools/seed-wearable.ts`), not issued on joining.
- "Room opens a few at a time … you'll see where you stand" — describes the queue, which
  does not exist. This is aspirational copy and should not ship before §4 does.

Per §6, the copy should also state that order derives from completion time. Suggested
addition: *"Your place is set when you finish, not when you scan — so answering promptly
is the only way to move up."*

---

## Build order

The dependency chain is strict; §4 cannot be built first.

1. **Fix the `.slice(2)` defect** (§1). Everything downstream counts questions.
2. **Correct the §7 privacy language** wherever it appears publicly, and verify the shred
   timer is enabled on the key box. Both are truthfulness fixes, independent of the rest.
3. **Codes** (§2): `kind` discriminator, one-stationary-per-owner index, `expires_at` and
   rotation for ephemeral.
4. **Connections** (§2): the table §1's "graph" and §3's notification both require.
5. **Queue and capacity** (§4/§6): the queue table, the per-profile cap of 17, the
   `daily_admission_rate` column with its 2–5 constraint, and — new infrastructure — a
   scheduled drainer, since the repo has no worker process.
6. **Scan-page branching** (§3): needs the identity lookup and the queue to branch into.
7. **Clocks** (§5): needs `reachable_at` on the queue row, plus a reminder sender and the
   scheduler from step 5.

## Open items

- Confirm `SHRED_AFTER_DELIVERY_DAYS` / `SHRED_ABSOLUTE_DAYS` in `/home/liar/keybox.env`
  on the key box match the `7`/`30` defaults.
- Confirm `a4t-keyshred.timer` is enabled and firing on the key box.
- Decide whether `touchActivity` should be wired up (making the ceiling last-visit-based as
  documented) or removed along with the docs that describe it. Right now the code and the
  documentation disagree.
- Decide whether §5's 15-day-from-start window really should replace the deliberate
  30-day-from-last-activity rule, given the comment in `lib/questionnaire-session.ts`
  arguing against measuring from creation.
