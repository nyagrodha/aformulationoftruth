# ZK Lotto — Poseidon + Noir SNARK Design

**Date:** 2026-04-02
**Status:** Draft
**Scope:** Hash migration, Noir circuit, SNARK verification, template redesign, Zcash payout

## Overview

Upgrade the commit-reveal lotto protocol from SHA-256 hashes with manual Merkle proof verification to a real zero-knowledge system using Poseidon hashes and Noir SNARK proofs verified via Barretenberg. Add shielded Zcash address binding so winners can claim payouts without revealing identity until claim time.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Hash function | Poseidon (BN254) | ZK-circuit-friendly, matches Noir's `std::hash::poseidon` |
| Proving system | Noir / Barretenberg (UltraPLONK) | Best DX, single `nargo` binary for users |
| Client tooling | Downloadable Noir project | `nargo` handles both commitment generation and proof generation |
| Server verification | `bb verify` subprocess | Canonical verifier, ~100-500ms per call, acceptable for once-per-round claims |
| Merkle tree depth | Fixed 8 (max 256 entries) | Simple circuit, generous for `lotto_min_participants: 15` |
| Template approach | Phase-based guided walkthrough | Show only relevant UI for current round state |
| Payout address | Shielded Zcash (z-addr), bound into commitment | Full unlinkability until claim |

## 1. Hash Migration: SHA-256 to Poseidon

### What changes

The backend currently uses SHA-256 for three things:

1. **Leaf hashes** in the Merkle tree (`_leaf_hash`) — switches to Poseidon
2. **Internal Merkle tree nodes** (`_hash_bytes`) — switches to Poseidon
3. **Anchor hash and winner index derivation** — stays SHA-256

Items 1 and 2 must use Poseidon because the ZK circuit recomputes them. Item 3 is a public computation that never enters the circuit — SHA-256 is fine and universal.

### Poseidon in Python

- Use a Python Poseidon implementation over BN254 scalar field with parameters matching Noir's `std::hash::poseidon`
- Add `poseidon_hash(*inputs) -> Field` to `app/crypto.py`
- Commitments become BN254 field element strings (decimal or 0x-prefixed hex)
- Replace `_leaf_hash` and `_build_merkle_root` internals in `app/lotto.py`

### Breaking change

Existing SHA-256 commitments are incompatible. Since `LOTTO_ENABLED` is `False` and the lotto has never been live, this is a clean break with no migration needed. Clear any test data before enabling.

## 2. Noir Circuit

### Project location

`circuits/a4m_lotto/` — contains `Nargo.toml`, `src/main.nr`, and a README with participation instructions.

### Public inputs (6)

| Input | Type | Description |
|-------|------|-------------|
| `merkle_root` | `Field` | Round's Merkle root |
| `nullifier` | `Field` | Derived from secret, prevents double-claim |
| `commitment` | `Field` | The winning leaf |
| `round_id` | `Field` | Binds proof to a specific lotto round |
| `anchor` | `Field` | `Poseidon(merkle_root, round_id)` — ties root to round |
| `address_hash` | `Field` | `Poseidon(zcash_address_fields)` — binds payout address |

### Private inputs (4)

| Input | Type | Description |
|-------|------|-------------|
| `secret` | `Field` | User's random secret |
| `address_hash_preimage` | `Field[]` | Zcash address bytes as field elements |
| `path_indices` | `[u1; 8]` | Left(0) or right(1) at each tree level |
| `path_siblings` | `[Field; 8]` | Sibling hash at each level |

### Constraints

1. `nullifier == Poseidon(secret, 0)` — nullifier derives deterministically from secret, domain-separated with 0
2. `commitment == Poseidon(secret, nullifier, address_hash)` — 3-arity Poseidon, binds secret + nullifier + payout address
3. `anchor == Poseidon(merkle_root, round_id)` — round binding
4. `address_hash == Poseidon(address_hash_preimage)` — address preimage check
5. **Merkle path verification** — starting from `commitment`, walk up 8 levels using `path_indices` and `path_siblings`, hashing pairs with Poseidon, arriving at `merkle_root`

### Fixed tree depth

- 8 levels, max 256 entries per round
- Rounds with fewer entries pad empty leaves with `Field(0)`
- Zero-leaf cascades: `Poseidon(0, 0)` for empty pairs at each level

## 3. Client Workflow

Users install `nargo` (single binary) and use the provided Noir project.

### Step 1: Generate commitment (before round closes)

```toml
# circuits/a4m_lotto/Prover.toml
secret = "0x<random_256bit>"
zcash_address = "zs1..."
```

```bash
cd circuits/a4m_lotto
nargo execute generate
# Outputs: commitment, nullifier, address_hash
```

### Step 2: Submit commitment

Paste the commitment value into the form at `/lotto/commit`. The Zcash address and secret stay local.

### Step 3: After draw, generate proof

```toml
# Update Prover.toml with round data from /lotto/audit/{round_id}
merkle_root = "0x..."
round_id = "7"
path_indices = [0, 1, 0, 1, 0, 0, 1, 0]
path_siblings = ["0x...", "0x...", ...]
```

```bash
nargo prove
# Produces proof file in proofs/
```

### Step 4: Claim

Submit via `/lotto/claim`: base64-encoded proof + shielded Zcash address.

## 4. Server-Side Verification

### Flow for `/lotto/claim`

1. Request contains: `round_id`, `proof` (base64), `zcash_address`
2. Server reconstructs public inputs from DB: `merkle_root`, `winner_commitment`, plus `round_id`
3. Server computes: `nullifier` (from proof public inputs), `anchor = Poseidon(merkle_root, round_id)`, `address_hash = Poseidon(zcash_address_fields)`
4. Server writes public inputs + proof to temp files
5. Subprocess: `bb verify -p /tmp/proof -k /path/to/vkey`
6. Exit code 0 = valid, else reject
7. Application-level checks: commitment matches winner, nullifier not spent, claim window open
8. On success: store `claim_zcash_address`, mark round claimed

### What the SNARK replaces

- The old `_verify_merkle_proof` Python function is removed
- The old `merkle_proof` list and `leaf_index` claim fields are removed
- The circuit proves Merkle path validity, nullifier derivation, address binding, and round binding — all in one proof

### Server dependencies

- `bb` binary at configurable path (`LOTTO_BB_PATH`, default `/usr/local/bin/bb`)
- Verification key at configurable path (`LOTTO_VKEY_PATH`, default `/etc/lib/gate/lotto_vkey`)
- Both are static artifacts generated once from the compiled circuit
- 10-second subprocess timeout, temp files cleaned up in `finally` block

### New config

```python
lotto_bb_path: str = "/usr/local/bin/bb"
lotto_vkey_path: str = "/etc/lib/gate/lotto_vkey"
```

## 5. Database Changes

### `lotto_rounds` table

Add column:
- `claim_zcash_address TEXT` — populated at claim time only, alongside existing `claim_nullifier`

No other schema changes. `lotto_commits.commitment` stores text, works for both old hex and new field element strings.

## 6. Template Redesign

### Phase-based display

The template renders different sections based on round state using Jinja conditionals. Zero JS.

#### No active round (collecting commitments)

- Commitment count: "N commitments waiting"
- Commitment form (paste commitment hash)
- Instructions: install `nargo`, generate commitment
- Link to download circuit project

#### Round closed (waiting for draw)

- Round metadata: merkle root, entry count, anchor hash, operator signature
- "Waiting for drand beacon round #X"
- No forms

#### Round drawn (claim window open)

- Winner commitment displayed
- Claim form: paste base64 proof + Zcash shielded address
- Instructions: how to run `nargo prove`
- Claim deadline (rendered as date)

#### Round claimed (complete)

- Full round summary: winner, nullifier, timestamps, payout address
- Link to audit endpoint
- Pending commitments count for next round

### Persistent sections

- Protocol explainer in `<details>/<summary>` (native HTML, no JS)
- Step-by-step participation guide
- Link to circuit source and audit endpoint

### New CSS classes

- `.lotto-phase` — wrapper for each state section
- `.lotto-step` — numbered step in the guide
- `.lotto-hash` — monospace truncated hash display

Follows existing brutalist monochrome theme.

## 7. File Changes Summary

### New files

| File | Purpose |
|------|---------|
| `circuits/a4m_lotto/Nargo.toml` | Noir project config |
| `circuits/a4m_lotto/src/main.nr` | The ZK circuit |
| `circuits/a4m_lotto/README.md` | User-facing participation guide |

### Modified files

| File | Changes |
|------|---------|
| `app/crypto.py` | Add `poseidon_hash()` using BN254 parameters matching Noir |
| `app/lotto.py` | Poseidon Merkle tree, `bb verify` subprocess, remove SHA-256 Merkle code, phase-aware template context |
| `app/config.py` | Add `lotto_bb_path`, `lotto_vkey_path` settings |
| `app/templates/lotto.html` | Phase-based redesign |
| `app/static/style.css` | New `.lotto-phase`, `.lotto-step`, `.lotto-hash` classes |
| `app/db.py` or `app/lotto.py` | Add `claim_zcash_address` column to schema creation |

### Server setup (one-time)

1. Install `bb` binary
2. Compile circuit: `nargo compile` in `circuits/a4m_lotto/`
3. Generate verification key: `bb write_vk` → deploy to `LOTTO_VKEY_PATH`
4. Set env vars: `LOTTO_BB_PATH`, `LOTTO_VKEY_PATH`
5. Install Python Poseidon library (or vendor it)

## 8. Not In Scope

- On-chain verification (server-verified ZK only)
- Automated `nargo` distribution or installation
- Prize payout automation (manual payout to revealed z-addr)
- Zcash node integration
