"""Lotto routes: commit, close, draw, claim, and audit."""

import base64
import hashlib
import json
import secrets
import string
import urllib.request
from datetime import date, datetime, timedelta, timezone

import asyncpg
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.auth import get_current_user
from app.config import settings
from app.db import get_pool

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


def _wants_json(request: Request) -> bool:
    accept = request.headers.get("accept", "")
    content_type = request.headers.get("content-type", "")
    return "application/json" in accept or "application/json" in content_type


def _normalize_token(value: str, field_name: str, max_len: int = 256) -> str:
    token = (value or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    if len(token) > max_len:
        raise HTTPException(status_code=400, detail=f"{field_name} is too long")
    return token


def _normalize_hash_hex(value: str, field_name: str) -> str:
    token = (value or "").strip().lower()
    if token.startswith("0x"):
        token = token[2:]
    if len(token) != 64:
        raise HTTPException(status_code=400, detail=f"{field_name} must be 32-byte hex")
    if any(ch not in string.hexdigits for ch in token):
        raise HTTPException(status_code=400, detail=f"{field_name} must be hex")
    return token


def _parse_int(value: object, field_name: str) -> int:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field_name} must be an integer")


def _hash_bytes(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def _leaf_hash(commitment: str) -> bytes:
    return _hash_bytes(commitment.encode("utf-8"))


def _build_merkle_root(commitments: list[str]) -> str:
    if not commitments:
        raise HTTPException(status_code=400, detail="No commitments available")

    level = [_leaf_hash(commitment) for commitment in commitments]
    while len(level) > 1:
        next_level: list[bytes] = []
        for i in range(0, len(level), 2):
            left = level[i]
            right = level[i + 1] if i + 1 < len(level) else level[i]
            next_level.append(_hash_bytes(left + right))
        level = next_level
    return level[0].hex()


def _verify_merkle_proof(
    commitment: str,
    proof_hashes: list[str],
    leaf_index: int,
    merkle_root: str,
) -> bool:
    current = _leaf_hash(commitment)
    idx = leaf_index
    for sibling_hex in proof_hashes:
        sibling = bytes.fromhex(_normalize_hash_hex(sibling_hex, "merkle_proof item"))
        if idx % 2 == 0:
            current = _hash_bytes(current + sibling)
        else:
            current = _hash_bytes(sibling + current)
        idx //= 2
    return current.hex() == merkle_root.lower()


def _load_operator_keypair() -> tuple[str, Ed25519PrivateKey]:
    key_b64 = settings.lotto_operator_signing_key_b64.strip()
    if not key_b64:
        raise HTTPException(status_code=503, detail="Operator signing key is not configured")

    try:
        raw = base64.b64decode(key_b64)
    except (ValueError, TypeError):
        raise HTTPException(status_code=500, detail="Operator signing key is invalid base64")

    if len(raw) != 32:
        raise HTTPException(status_code=500, detail="Operator signing key must be 32 bytes")

    private_key = Ed25519PrivateKey.from_private_bytes(raw)
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return base64.b64encode(public_key).decode("ascii"), private_key


def _require_operator(request: Request) -> None:
    expected = settings.lotto_operator_token.strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Operator token is not configured")

    provided = request.headers.get("x-operator-token", "")
    if not provided or not secrets.compare_digest(expected, provided):
        raise HTTPException(status_code=403, detail="Operator authorization failed")


def _compute_anchor_hash(merkle_root: str, entry_count: int, drand_round_target: int) -> str:
    payload = f"{merkle_root}:{entry_count}:{drand_round_target}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _sign_anchor(anchor_hash: str) -> tuple[str, str]:
    pubkey_b64, private_key = _load_operator_keypair()
    signature = private_key.sign(bytes.fromhex(anchor_hash))
    return pubkey_b64, base64.b64encode(signature).decode("ascii")


def _fetch_drand_randomness(round_target: int) -> str:
    url = settings.lotto_drand_url_template.format(round=round_target)
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch drand beacon: {exc}")

    randomness = payload.get("randomness")
    if not isinstance(randomness, str) or not randomness:
        raise HTTPException(status_code=502, detail="Invalid drand response: missing randomness")
    return randomness.lower()


async def _read_payload(request: Request) -> dict:
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            payload = await request.json()
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="JSON body must be an object")
        return payload

    form = await request.form()
    return dict(form)


async def _ensure_lotto_schema(pool: asyncpg.Pool) -> None:
    required = {"lotto_rounds", "lotto_commits", "lotto_nullifiers_spent"}
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        found = {row["tablename"] for row in rows}
        missing = required - found
        if not missing:
            return

        try:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS lotto_rounds (
                  id BIGSERIAL PRIMARY KEY,
                  status TEXT NOT NULL DEFAULT 'closed'
                    CHECK (status IN ('closed', 'drawn', 'claimed')),
                  merkle_root TEXT NOT NULL,
                  entry_count INTEGER NOT NULL CHECK (entry_count > 0),
                  drand_round_target BIGINT NOT NULL,
                  anchor_hash TEXT NOT NULL,
                  operator_pubkey TEXT NOT NULL,
                  operator_signature TEXT NOT NULL,
                  beacon TEXT,
                  winner_idx INTEGER,
                  winner_commitment TEXT,
                  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                  drawn_at TIMESTAMPTZ,
                  claim_deadline TIMESTAMPTZ,
                  claimed_at TIMESTAMPTZ,
                  claim_nullifier TEXT,
                  claim_commitment TEXT
                )
                """
            )
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS lotto_commits (
                  id BIGSERIAL PRIMARY KEY,
                  commitment TEXT NOT NULL UNIQUE,
                  committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                  round_id BIGINT REFERENCES lotto_rounds(id)
                )
                """
            )
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS lotto_nullifiers_spent (
                  nullifier TEXT PRIMARY KEY,
                  round_id BIGINT NOT NULL REFERENCES lotto_rounds(id),
                  spent_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_lotto_commits_round_id ON lotto_commits(round_id)"
            )
            await conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_lotto_nullifiers_round_id
                ON lotto_nullifiers_spent(round_id)
                """
            )
        except asyncpg.InsufficientPrivilegeError:
            raise HTTPException(
                status_code=500,
                detail="Lotto tables are missing and cannot be created by this DB role",
            )


@router.get("/lotto", response_class=HTMLResponse)
async def lotto_page(
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
):
    user = await get_current_user(request, pool)
    if not user:
        return RedirectResponse("/login", status_code=303)

    await _ensure_lotto_schema(pool)

    async with pool.acquire() as conn:
        pending_entries = await conn.fetchval(
            "SELECT COUNT(*) FROM lotto_commits WHERE round_id IS NULL"
        )
        latest_round = await conn.fetchrow(
            """
            SELECT id, status, merkle_root, entry_count, drand_round_target, anchor_hash,
                   operator_pubkey, operator_signature, beacon, winner_idx, winner_commitment,
                   claim_deadline, closed_at, drawn_at, claimed_at
            FROM lotto_rounds
            ORDER BY id DESC
            LIMIT 1
            """
        )

    start_date = date.today()
    draw_date = start_date + timedelta(days=settings.lotto_window_days)

    return templates.TemplateResponse(
        request,
        "lotto.html",
        {
            "start_date": start_date.isoformat(),
            "draw_date": draw_date.isoformat(),
            "min_participants": settings.lotto_min_participants,
            "window_days": settings.lotto_window_days,
            "claim_window_days": settings.lotto_claim_window_days,
            "video_path": "/static/lotto-draw-clip.mov",
            "pending_entries": int(pending_entries or 0),
            "latest_round": dict(latest_round) if latest_round else None,
            "ok": request.query_params.get("ok", ""),
            "err": request.query_params.get("err", ""),
        },
    )


@router.post("/lotto/commit")
async def lotto_commit(
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
):
    user = await get_current_user(request, pool)
    if not user:
        if _wants_json(request):
            raise HTTPException(status_code=401, detail="Authentication required")
        return RedirectResponse("/login", status_code=303)

    await _ensure_lotto_schema(pool)
    payload = await _read_payload(request)
    commitment = _normalize_token(str(payload.get("commitment", "")), "commitment")

    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO lotto_commits (commitment)
                VALUES ($1)
                RETURNING committed_at
                """,
                commitment,
            )
            committed_at = row["committed_at"].isoformat()
            created = True
        except asyncpg.UniqueViolationError:
            row = await conn.fetchrow(
                "SELECT committed_at FROM lotto_commits WHERE commitment = $1",
                commitment,
            )
            committed_at = row["committed_at"].isoformat() if row else None
            created = False

    if _wants_json(request):
        return JSONResponse(
            {
                "ok": created,
                "duplicate": not created,
                "commitment": commitment,
                "committed_at": committed_at,
            }
        )

    if created:
        return RedirectResponse("/lotto?ok=commit", status_code=303)
    return RedirectResponse("/lotto?err=duplicate", status_code=303)


@router.post("/lotto/close")
async def lotto_close(
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
):
    _require_operator(request)
    await _ensure_lotto_schema(pool)

    payload = await _read_payload(request)
    requested_target = payload.get("drand_round_target", settings.lotto_default_drand_round_target)
    drand_round_target = _parse_int(requested_target, "drand_round_target")
    if drand_round_target <= 0:
        raise HTTPException(status_code=400, detail="drand_round_target must be > 0")

    async with pool.acquire() as conn:
        async with conn.transaction():
            rows = await conn.fetch(
                """
                SELECT id, commitment
                FROM lotto_commits
                WHERE round_id IS NULL
                ORDER BY commitment ASC
                """
            )
            if len(rows) < settings.lotto_min_participants:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Need at least {settings.lotto_min_participants} participants, "
                        f"currently {len(rows)}"
                    ),
                )

            commitments = [row["commitment"] for row in rows]
            merkle_root = _build_merkle_root(commitments)
            anchor_hash = _compute_anchor_hash(merkle_root, len(commitments), drand_round_target)
            operator_pubkey, operator_signature = _sign_anchor(anchor_hash)

            round_id = await conn.fetchval(
                """
                INSERT INTO lotto_rounds (
                  status, merkle_root, entry_count, drand_round_target,
                  anchor_hash, operator_pubkey, operator_signature
                )
                VALUES ('closed', $1, $2, $3, $4, $5, $6)
                RETURNING id
                """,
                merkle_root,
                len(commitments),
                drand_round_target,
                anchor_hash,
                operator_pubkey,
                operator_signature,
            )

            commit_ids = [row["id"] for row in rows]
            await conn.execute(
                "UPDATE lotto_commits SET round_id = $1 WHERE id = ANY($2::bigint[])",
                round_id,
                commit_ids,
            )

    return JSONResponse(
        {
            "ok": True,
            "round_id": round_id,
            "root": merkle_root,
            "entry_count": len(commitments),
            "drand_round_target": drand_round_target,
            "anchor_hash": anchor_hash,
            "operator_pubkey": operator_pubkey,
            "operator_signature": operator_signature,
        }
    )


@router.post("/lotto/draw/{round_id}")
async def lotto_draw(
    round_id: int,
    pool: asyncpg.Pool = Depends(get_pool),
):
    await _ensure_lotto_schema(pool)

    async with pool.acquire() as conn:
        async with conn.transaction():
            round_row = await conn.fetchrow(
                """
                SELECT id, status, merkle_root, entry_count, drand_round_target,
                       winner_idx, winner_commitment, beacon, claim_deadline
                FROM lotto_rounds
                WHERE id = $1
                FOR UPDATE
                """,
                round_id,
            )
            if not round_row:
                raise HTTPException(status_code=404, detail="Round not found")

            if round_row["status"] in {"drawn", "claimed"} and round_row["beacon"]:
                return JSONResponse(
                    {
                        "ok": True,
                        "round_id": round_id,
                        "status": round_row["status"],
                        "beacon": round_row["beacon"],
                        "winner_idx": round_row["winner_idx"],
                        "winner_commitment": round_row["winner_commitment"],
                        "claim_deadline": (
                            round_row["claim_deadline"].isoformat()
                            if round_row["claim_deadline"]
                            else None
                        ),
                    }
                )

            beacon = _fetch_drand_randomness(int(round_row["drand_round_target"]))
            entropy = f"{round_row['merkle_root']}:{beacon}".encode("utf-8")
            winner_idx = int.from_bytes(hashlib.sha256(entropy).digest(), "big") % int(
                round_row["entry_count"]
            )

            winner_commitment = await conn.fetchval(
                """
                SELECT commitment
                FROM lotto_commits
                WHERE round_id = $1
                ORDER BY commitment ASC
                OFFSET $2
                LIMIT 1
                """,
                round_id,
                winner_idx,
            )
            if not winner_commitment:
                raise HTTPException(status_code=500, detail="Winner commitment not found")

            claim_deadline = datetime.now(timezone.utc) + timedelta(
                days=settings.lotto_claim_window_days
            )
            await conn.execute(
                """
                UPDATE lotto_rounds
                SET status = 'drawn',
                    beacon = $2,
                    winner_idx = $3,
                    winner_commitment = $4,
                    drawn_at = now(),
                    claim_deadline = $5
                WHERE id = $1
                """,
                round_id,
                beacon,
                winner_idx,
                winner_commitment,
                claim_deadline,
            )

    return JSONResponse(
        {
            "ok": True,
            "round_id": round_id,
            "beacon": beacon,
            "winner_idx": winner_idx,
            "winner_commitment": winner_commitment,
            "claim_deadline": claim_deadline.isoformat(),
        }
    )


@router.post("/lotto/claim")
async def lotto_claim(
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
):
    await _ensure_lotto_schema(pool)
    payload = await _read_payload(request)

    if payload.get("snark_proof") is not None:
        raise HTTPException(
            status_code=501,
            detail="snark proof verification is not yet implemented on this server",
        )

    round_id = _parse_int(payload.get("round_id"), "round_id")
    commitment = _normalize_token(str(payload.get("commitment", "")), "commitment")
    nullifier = _normalize_token(str(payload.get("nullifier", "")), "nullifier")
    leaf_index = _parse_int(payload.get("leaf_index"), "leaf_index")
    if leaf_index < 0:
        raise HTTPException(status_code=400, detail="leaf_index must be >= 0")

    raw_proof = payload.get("merkle_proof", [])
    if isinstance(raw_proof, str):
        proof_hashes = [item.strip() for item in raw_proof.split(",") if item.strip()]
    elif isinstance(raw_proof, list):
        proof_hashes = [str(item).strip() for item in raw_proof if str(item).strip()]
    else:
        raise HTTPException(status_code=400, detail="merkle_proof must be a list of hashes")

    async with pool.acquire() as conn:
        async with conn.transaction():
            round_row = await conn.fetchrow(
                """
                SELECT id, status, merkle_root, winner_commitment, claim_deadline
                FROM lotto_rounds
                WHERE id = $1
                FOR UPDATE
                """,
                round_id,
            )
            if not round_row:
                raise HTTPException(status_code=404, detail="Round not found")
            if round_row["status"] == "claimed":
                raise HTTPException(status_code=409, detail="Prize already claimed")
            if round_row["status"] != "drawn":
                raise HTTPException(status_code=400, detail="Round is not ready for claiming")
            if round_row["claim_deadline"] and datetime.now(timezone.utc) > round_row["claim_deadline"]:
                raise HTTPException(status_code=410, detail="Claim window has closed")
            if commitment != round_row["winner_commitment"]:
                raise HTTPException(status_code=403, detail="Commitment is not the winning leaf")

            if not _verify_merkle_proof(
                commitment=commitment,
                proof_hashes=proof_hashes,
                leaf_index=leaf_index,
                merkle_root=round_row["merkle_root"],
            ):
                raise HTTPException(status_code=400, detail="Invalid Merkle proof")

            try:
                await conn.execute(
                    """
                    INSERT INTO lotto_nullifiers_spent (nullifier, round_id)
                    VALUES ($1, $2)
                    """,
                    nullifier,
                    round_id,
                )
            except asyncpg.UniqueViolationError:
                raise HTTPException(status_code=409, detail="Nullifier already spent")

            await conn.execute(
                """
                UPDATE lotto_rounds
                SET status = 'claimed',
                    claimed_at = now(),
                    claim_nullifier = $2,
                    claim_commitment = $3
                WHERE id = $1
                """,
                round_id,
                nullifier,
                commitment,
            )

    return JSONResponse(
        {
            "ok": True,
            "round_id": round_id,
            "commitment": commitment,
            "nullifier_spent": True,
            "message": "Claim accepted. Release prize through your payout workflow.",
        }
    )


@router.get("/lotto/audit/{round_id}")
async def lotto_audit(
    round_id: int,
    pool: asyncpg.Pool = Depends(get_pool),
):
    await _ensure_lotto_schema(pool)

    async with pool.acquire() as conn:
        round_row = await conn.fetchrow(
            """
            SELECT id, status, merkle_root, entry_count, drand_round_target, anchor_hash,
                   operator_pubkey, operator_signature, beacon, winner_idx, winner_commitment,
                   closed_at, drawn_at, claim_deadline, claimed_at, claim_nullifier
            FROM lotto_rounds
            WHERE id = $1
            """,
            round_id,
        )
        if not round_row:
            raise HTTPException(status_code=404, detail="Round not found")

        commitment_rows = await conn.fetch(
            """
            SELECT commitment
            FROM lotto_commits
            WHERE round_id = $1
            ORDER BY commitment ASC
            """,
            round_id,
        )
        nullifier_rows = await conn.fetch(
            """
            SELECT nullifier, spent_at
            FROM lotto_nullifiers_spent
            WHERE round_id = $1
            ORDER BY spent_at ASC
            """,
            round_id,
        )

    commitments = [row["commitment"] for row in commitment_rows]
    recomputed_root = _build_merkle_root(commitments)
    winner_idx_check = None
    winner_idx_matches = None
    if round_row["beacon"]:
        entropy = f"{round_row['merkle_root']}:{round_row['beacon']}".encode("utf-8")
        winner_idx_check = int.from_bytes(hashlib.sha256(entropy).digest(), "big") % int(
            round_row["entry_count"]
        )
        winner_idx_matches = winner_idx_check == round_row["winner_idx"]

    return JSONResponse(
        {
            "round": {
                "id": round_row["id"],
                "status": round_row["status"],
                "root": round_row["merkle_root"],
                "entry_count": round_row["entry_count"],
                "drand_round_target": round_row["drand_round_target"],
                "anchor_hash": round_row["anchor_hash"],
                "operator_pubkey": round_row["operator_pubkey"],
                "operator_signature": round_row["operator_signature"],
                "beacon": round_row["beacon"],
                "winner_idx": round_row["winner_idx"],
                "winner_commitment": round_row["winner_commitment"],
                "closed_at": round_row["closed_at"].isoformat() if round_row["closed_at"] else None,
                "drawn_at": round_row["drawn_at"].isoformat() if round_row["drawn_at"] else None,
                "claim_deadline": (
                    round_row["claim_deadline"].isoformat() if round_row["claim_deadline"] else None
                ),
                "claimed_at": round_row["claimed_at"].isoformat() if round_row["claimed_at"] else None,
                "claim_nullifier": round_row["claim_nullifier"],
            },
            "audit": {
                "merkle_root_recomputed": recomputed_root,
                "merkle_root_matches": recomputed_root == round_row["merkle_root"],
                "winner_idx_recomputed": winner_idx_check,
                "winner_idx_matches": winner_idx_matches,
            },
            "commitments_sorted": commitments,
            "nullifiers_spent": [
                {"nullifier": row["nullifier"], "spent_at": row["spent_at"].isoformat()}
                for row in nullifier_rows
            ],
            "algorithms": {
                "anchor_hash": "sha256(f'{root}:{entry_count}:{drand_round_target}')",
                "winner_idx": "int(sha256(f'{root}:{beacon}'), 16) mod entry_count",
                "merkle_tree": "sha256 leaves and pairwise sha256 parents; duplicate last leaf for odd levels",
            },
        }
    )
