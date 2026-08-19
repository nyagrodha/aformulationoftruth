# aformulationoftruth-gate

age-encrypting gate service. Receives one POST per gate answer from the Deno
Fresh app, encrypts the payload to the configured x25519 recipient, and
persists the ASCII-armored ciphertext to the `gate_encrypted_answers` table in
the same Postgres database the Fresh app uses.

The matching identity (the secret half) must stay offline. The server is
write-only with respect to plaintext: nothing it stores can be read back
without the offline key. That guarantee comes from the encryption, not from
where the ciphertext sits — which is why sharing the app's database costs
nothing: rows are already unreadable armor before they reach it.

## Contract

`POST /api/store`

```json
{
  "session_id":     "string",
  "question_text":  "string",
  "question_index": 0,
  "answer":         "string (plaintext, encrypted before insert)",
  "skipped":        false
}
```

Response: `200 { "ok": true }` on success.

`GET /health` → `200 ok`.

## Build & run

```bash
cd /var/www/aformulationoftruth/rust-server
cargo build --release --locked

cp .env.example .env   # then edit AGE_RECIPIENT etc
```

`.env` must set `DATABASE_URL` to the Fresh app's Postgres connection string.
It is required and has no fallback: a default would either point somewhere
wrong or quietly create a second store, which is the split this service no
longer has. The table is created on startup if absent
(`db/migrations/007_gate_encrypted_answers.sql` is the versioned copy).

```bash
./target/release/aformulationoftruth-gate
```

## systemd

```bash
sudo cp aformulationoftruth-gate.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aformulationoftruth-gate
sudo systemctl status aformulationoftruth-gate
```

The Deno Fresh app expects this service at `GATE_URL` (default
`http://127.0.0.1:8787`).
