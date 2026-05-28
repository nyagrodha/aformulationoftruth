# aformulationoftruth-gate

age-encrypting gate service. Receives one POST per gate answer from the Deno
Fresh app, encrypts the payload to the configured x25519 recipient, and
persists the ASCII-armored ciphertext to a local SQLite file.

The matching identity (the secret half) must stay offline. The server is
write-only with respect to plaintext: nothing it stores can be read back
without the offline key.

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
cd /home/wthami/aformulationoftruth/rust-server
cargo build --release

# one-time data dir
sudo install -d -o wthami -g wthami /var/lib/a4t-gate

cp .env.example .env   # then edit AGE_RECIPIENT etc

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
