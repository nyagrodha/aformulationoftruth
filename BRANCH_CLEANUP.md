# Repository streamlining → two branches: `dev` and `prod`

Decision (chosen by repo owner): **`main` is the prod base** — it is the clean,
completed Deno Fresh migration. `a4ot` was the *legacy* React/Node architecture
(which `main`/`dev` deliberately deleted) with only one piece of genuinely-new
work: the **zk-lotto + encrypted messenger** (PR #71), which already existed in
Deno Fresh form. That feature has been **forward-ported onto `main`** on this
branch. `dev` will branch from `prod`.

## What this branch (`claude/repository-streamlining-myjlam`) contains

It is `origin/main` + the forward-ported lotto/messenger feature. This tree is
the intended **`prod`** content. Ported (paths remapped to main's layout):

| from `a4ot` (`fresh-questionnaire/…`) | to `main` layout            |
|---------------------------------------|-----------------------------|
| `utils/lotto.ts`                      | `lib/lotto.ts`              |
| `routes/api/lotto/{close,commit,draw,verify}.ts` | same (import `../../../lib/lotto.ts`) |
| `routes/lotto.tsx`                    | `routes/lotto.tsx`          |
| `routes/messenger.tsx`               | `routes/messenger.tsx`      |
| `routes/encrypted-messenger.tsx`     | `routes/encrypted-messenger.tsx` |
| `static/js/lotto.js`, `static/js/messenger.js` | `public/js/…` (main's `staticDir: ./public`) |

`fresh.gen.ts` was updated to register the 7 new routes. `main`'s import map
already had `grammy` + `@age/age-encryption`, so no dependency changes were
needed. Verified statically: all imports resolve (`$fresh` builtins + 12 names
exported by `lib/lotto.ts`, which is dependency-free). `deno check` could **not**
be run in this environment (no Deno binary) — run `deno task check` locally
before promoting.

## Finalizing from your machine (this environment can't create/delete branches)

The session git proxy only permits pushes to `claude/repository-streamlining-myjlam`
(branch deletes return HTTP 403, and there is no delete-branch API tool). So run
the promotion locally:

```bash
git fetch origin

# 1. Archive the divergent lines as tags before removing them (recoverable history)
git tag archive/a4ot        origin/a4ot
git tag archive/production   origin/production
git tag archive/dev-legacy   origin/dev
git tag archive/main-premerge origin/main
git push origin --tags

# 2. prod = this reconciled branch (main + ported lotto/messenger)
git checkout -B prod origin/claude/repository-streamlining-myjlam
git push -u origin prod

# 3. dev = branched from prod
git checkout -B dev prod
git push -f origin dev        # replaces the stale legacy dev (archived above)

# 4. (GitHub UI or gh) set `prod` as the default branch, then delete `main`,
#    `a4ot`, `production` once you've confirmed prod builds & deploys.
```

## Safe-to-delete branches (merged PRs — work already preserved elsewhere)

These 15 had their PR merged, so nothing is lost. Delete locally:

```bash
git push origin --delete \
  add-claude-github-actions-1768862315338 \
  coderabbitai/docstrings/25380cd \
  coderabbitai/utg/4ce4e44 \
  codex/deploy-tor-dns-service-with-uptime-monitoring \
  codex/deploy-zk-lotto-and-encrypted-messenger \
  feat/onion-auth feat/onion-captcha feat/onion-config-update feat/onion-crypto \
  feat/onion-db-module feat/onion-middleware feat/onion-questions feat/onion-templates \
  feat/site-nav-assets feature/completion-screen
```

Recovery (restore any): `git push origin <sha>:refs/heads/<name>`

```
add-claude-github-actions-1768862315338              30bb663e80e355fcac10e3648505f1926b5ca294
coderabbitai/docstrings/25380cd                      62c4bbb9de5f0ff1d740c880fb2385c013cb3c7a
coderabbitai/utg/4ce4e44                             92eddd6d754ffbaf04dcc380170662869d7527cb
codex/deploy-tor-dns-service-with-uptime-monitoring  7cb267276834dd46a425a60af30196ab84fd0278
codex/deploy-zk-lotto-and-encrypted-messenger        965533e5c6852bae7e1d3cde6424e1984b5cfa84
feat/onion-auth                                      222716e56403b79e7efa691d6cf8e61c47d4bbbf
feat/onion-captcha                                   d3006178c0bb47826aa78c81acf3ec2e1f1c7abf
feat/onion-config-update                             170e33464013b45a0b12755373509bc49118e7de
feat/onion-crypto                                    f0207c781568b85822cfcebcf8a6ccada037270a
feat/onion-db-module                                 0b9f6ffae91eb9f997fde9b6caef9b78bd69f64d
feat/onion-middleware                                fb3bff3d4aba441d22b0660d7302e51c1d5df96c
feat/onion-questions                                 b655e1e0cffe7c162757b3c713c986f27d483aa5
feat/onion-templates                                 434c0792af07d0609295642e8242d89ca8bfa0af
feat/site-nav-assets                                 ec40ed1a9338f8b923f961ac87aebaae22c8efa1
feature/completion-screen                            16df06c8a7ba93d1b3f0aca7181741e31312d62e
```

## Branches with OPEN PRs — close/merge against `prod` first, then delete (17)

claude/deploy-age-encrypted-messaging-oc2uY (#70), claude/fetch-messaging-service-gGzri (#69),
claude/secure-messaging-rollout-rnH1u (#68), coderabbitai/utg/a396287 (#58),
codex/brainstorm-website-concept-for-aformulationiontruth.com (#56),
codex/outline-ai-agent-for-user-questionnaire-analysis (#52),
codex/regional-language-defaults (#62), copilot/cleanup-repo-branches (#61),
dependabot/npm_and_yarn/npm_and_yarn-f00f32c71b (#60), dev-lotto-clean (#34),
feat/frontend-pages-and-crypto (#66), feat/paid-tier-api-endpoints (#65),
feat/payment-codes (#63), feat/user-profile-service (#64),
sync/a4ot-with-main-v2 (#51), zero-logging-compliance (#55), zk-lotto (#54)

Note: several of these (secure-messaging, paid-tier, payment-codes, user-profile)
may contain work you still want — review before closing.

## No PR / closed-without-merge — review before deleting (7)

claude/rate-limit-questionnaire-b0J3l, copilot/add-responsive-layout,
copilot/continue-with-task, copilot/create-new-repository-away (#59 closed unmerged),
copilot/separate-awaytosaythanks-code, fix-github-actions, pr-3

## End state

After steps above: **`prod`** (main + lotto/messenger) and **`dev`** (from prod) —
plus any open-PR branches you keep working, which collapse into the two as they
merge or close.
