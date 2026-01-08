# PostgreSQL Setup Guide

This project ships with a secure authentication layer backed by PostgreSQL. Follow the steps below to configure the database in development.

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment Variables

Copy the example file and update it with your database credentials:

```bash
cp .env.example .env
```

Edit `.env` so that `DATABASE_URL` remains pointed at the managed cluster on `gimbal.fobdongle.com`. Example connection string with least-privilege credentials and TLS enforced:

```
DATABASE_URL=postgres://app_user:change-me@gimbal.fobdongle.com:5432/aformulationoftruth?sslmode=require
```

Ensure the PostgreSQL role referenced by `DATABASE_URL` has the minimal privileges required (CONNECT, USAGE on schema, CRUD on tables created by the app) and that the account is restricted to connections initiated from the encrypted VPN tunnel.

The application refuses to start unless the VPN interface configured via `VPN_INTERFACE` is active and the connection string enforces TLS (`sslmode=require`, `verify-ca`, or `verify-full`). Optionally pin the CA certificate path with `DATABASE_CA_CERT_PATH` for additional transport assurance.

## 3. Apply Migrations

Run the migration script to create the required tables (`users`, `password_resets`, `session`, and `questionnaire_responses`):

```bash
npm run db:migrate
```

The SQL lives in [`db/migrations`](db/migrations).

## 4. Seed an Admin User (optional)

After configuring the `SEED_ADMIN_*` variables in `.env`, create or update an admin account:

```bash
npm run db:seed
```

## 5. Start the Server

Launch the API:

```bash
npm run dev
```

The server listens on `PORT` (default `5742`). It serves both the API and static assets from `public/`.

## 6. Verifying Connectivity

Use Supertest/Jest (`npm test`) or hit the API manually:

- `GET /auth/session` — confirms session + CSRF issuance.
- `POST /auth/signup` — exercises user creation.
- `POST /api/responses` — stores questionnaire responses.
- `GET /api/responses` — requires an admin session.

If the server logs warnings about missing `DATABASE_URL`, confirm the environment file is loaded and that PostgreSQL is reachable.
