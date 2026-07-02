# Monero Tips Setup

The site can hand each visitor a fresh Monero subaddress for tips. Address
generation is done by a `monero-wallet-rpc` instance that you run yourself —
for example on a home Windows 11 machine — and the web server reaches it over
the network. The wallet's spend keys never touch the web server; it only asks
the wallet RPC to derive new subaddresses.

## 1. Run monero-wallet-rpc on the wallet machine (Windows 11)

Download the official Monero CLI tools from https://www.getmonero.org/downloads/
and unzip them. Then, from PowerShell in that folder:

```powershell
.\monero-wallet-rpc.exe `
  --wallet-file C:\monero\tips-wallet `
  --password-file C:\monero\tips-wallet.pass `
  --rpc-bind-port 18083 `
  --rpc-bind-ip 0.0.0.0 `
  --confirm-external-bind `
  --rpc-login tipuser:CHOOSE_A_STRONG_PASSWORD `
  --daemon-address node.monerodevs.org:18089
```

Notes:

- Use a **view-only or dedicated tips wallet**, not your main wallet.
- `--rpc-login` is required for any non-localhost binding; the server speaks
  HTTP digest auth to it.
- Allow inbound TCP 18083 in Windows Defender Firewall **only** for the
  network interface the web server uses (see next section).
- If you don't want to run a full node on the same machine, point
  `--daemon-address` at a remote node you trust.

## 2. Make the wallet reachable from the web server

Do **not** expose port 18083 directly to the internet. Pick one:

- **VPN / overlay network (recommended):** put the Windows machine and the
  web server on the same WireGuard or Tailscale network and use the private
  address (e.g. `http://100.x.y.z:18083`).
- **SSH reverse tunnel:** from the Windows machine,
  `ssh -N -R 18083:localhost:18083 user@your-server`, then the server uses
  `http://127.0.0.1:18083`.

## 3. Configure the web server

Set these environment variables where the Node server runs:

| Variable | Required | Description |
| --- | --- | --- |
| `MONERO_WALLET_RPC_URL` | yes | Base URL of the wallet RPC, e.g. `http://100.64.0.12:18083` |
| `MONERO_WALLET_RPC_USERNAME` | with `--rpc-login` | Username from `--rpc-login` |
| `MONERO_WALLET_RPC_PASSWORD` | with `--rpc-login` | Password from `--rpc-login` |
| `MONERO_WALLET_ACCOUNT_INDEX` | no | Wallet account to derive subaddresses from (default `0`) |

If `MONERO_WALLET_RPC_URL` is unset, the tips endpoints stay disabled and
return `503` — the rest of the site is unaffected.

## 4. Endpoints

- `GET /api/tips/monero/address` — public, rate-limited; returns
  `{ "address": "8...", "addressIndex": n }`, a freshly created subaddress
  labeled with the request timestamp.
- `GET /api/tips/monero/health` — admin-only; reports whether the wallet RPC
  is configured and reachable.

The tip widget on `/contact.html` calls the address endpoint and lets the
visitor copy the address.

## 5. Verify

```bash
curl -s https://your-site/api/tips/monero/address
```

You should get a fresh subaddress each call (rate limit: 5/minute per IP).
Incoming tips appear in the tips wallet, one subaddress per generated request,
labeled `tip:<timestamp>`.
