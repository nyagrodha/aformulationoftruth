# away — a way to say thanks

A gratitude delivery web application for [awaytosaythanks.com](https://awaytosaythanks.com).

Built with the same stack as *A Formulation of Truth*:  
Express.js · TypeScript · React (Vite) · PostgreSQL · Drizzle ORM · Tailwind CSS.

---

## Requirements

- Node.js 20+
- PostgreSQL 14+

---

## Environment setup

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Secret for express-session (min 32 chars) |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (default: `587`) |
| `SMTP_USER` | SMTP username / sender address |
| `SMTP_PASS` | SMTP password |
| `FROM_EMAIL` | Envelope `From` address |
| `PUBLIC_URL` | Public URL (e.g. `https://awaytosaythanks.com`) |
| `PORT` | HTTP port (default: `3001`) |

---

## Database migrations

```bash
npm install
npm run db:migrate
```

The initial migration creates:

- `sessions` — express-session storage
- `users` — authenticated senders
- `magic_links` — passwordless auth tokens
- `thank_you_messages` — sent gratitude messages

---

## Development

```bash
npm run dev          # Start the API server (tsx watch)
```

Open a second terminal and run the Vite dev server from the repo root:

```bash
cd away && npx vite  # Proxies /api → localhost:3001
```

---

## Production build

```bash
npm run build   # Compile TypeScript + bundle client
npm start       # Serve API + static client from dist/
```

---

## API routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/magic-link` | — | Request a sign-in link |
| `POST` | `/api/auth/magic-link/verify` | — | Exchange token for session |
| `GET` | `/api/auth/user` | session | Current user info |
| `POST` | `/api/auth/logout` | session | Destroy session |
| `POST` | `/api/thanks` | — | Send a thank-you (rate limited) |
| `GET` | `/api/thanks` | session | List messages sent by user |

---

## Security notes

- Rate limiting on `/api/thanks` (10 requests per 15 min per IP).
- Sessions stored in PostgreSQL; HTTP-only, `SameSite=Lax` cookies.
- Magic links expire after 1 hour and are single-use.
- Sender email is used as reply-to only; never disclosed in the UI.
- No passwords — magic link auth only.
