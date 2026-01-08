# a formulation of truth API

Secure Node.js API providing questionnaire storage and Phase 1 authentication with PostgreSQL.

## Requirements

- Node.js 20+
- PostgreSQL 14+

## Environment setup

1. Copy `.env.example` to `.env` and update values. The default configuration points at the dedicated PostgreSQL instance running on `gimbal.fobdongle.com` with TLS enforced via `sslmode=require`.
2. Ensure the PostgreSQL role in `DATABASE_URL` has least-privilege access to the remote application database and that the credentials are only usable from inside the VPN.
3. Establish the encrypted VPN tunnel to the Iceland gateway before starting any app scripts (the server validates the presence of the interface configured by `VPN_INTERFACE`).
4. Run database migrations:

```bash
npm install
npm run db:migrate
```

5. (Optional) seed an initial admin user after setting the `SEED_ADMIN_*` variables in `.env`:

```bash
npm run db:seed
```

## Running the API

```bash
npm run dev
```

- Sessions are stored in PostgreSQL with secure, HTTP-only cookies (`SameSite=Strict`).
- In production, the cookie `Secure` flag is enforced and the server rejects non-HTTPS requests when `TRUST_PROXY` enables proxy awareness. For cross-site OAuth redirects, temporarily change `SameSite` to `Lax` in `sessionCookieConfig` (documented in code).
- The server will refuse to boot unless the VPN network interface defined by `VPN_INTERFACE` (defaults to `wg0`) is active. Bring up the tunnel before running migrations, the dev server, or the build.

## Testing

```bash
npm test
```

Jest + Supertest cover signup, login, CSRF, password reset, and admin access controls.

## Available routes

- `POST /auth/signup` – create account (rotates session ID on success).
- `POST /auth/login` – login via email or username + password.
- `POST /auth/logout` – destroy session.
- `GET /auth/session` – return session info and fresh CSRF token.
- `POST /auth/session/refresh` – rotate session ID.
- `POST /auth/password/request` – start password reset (rate limited, non-enumerable).
- `POST /auth/password/reset` – complete reset with token.
- `POST /api/responses` – store questionnaire answers.
- `GET /api/responses` – admin-only listing.

All state-changing routes require a CSRF token via the `x-csrf-token` header.

## Security notes

- Passwords hashed with Argon2id (`timeCost=3`, `memoryCost=19456`).
- Rate limits default to 5 requests/minute per IP for sensitive auth routes.
- Input validation via Zod with uniform error responses to prevent account enumeration.
- Logging uses Pino and stores hashed IP/User-Agent values only.
- Secrets never committed; rotate by updating environment variables and restarting the service.
- All application data is persisted in the remote PostgreSQL instance at `gimbal.fobdongle.com`; the connection requires TLS (`sslmode=require`) and optional CA pinning via `DATABASE_CA_CERT_PATH`.

## Phase 2 scaffolding (disabled)

`AUTH_MODE` defaults to `password`. Setting it to `oauth` or `jwt` will expose the placeholder code paths for future OAuth 2.0 / OIDC and self-issued JWT support. These sections are currently commented out so no Phase 2 libraries are executed.
