# PostgreSQL Setup Guide

This project now includes a lightweight Express server that persists questionnaire responses to PostgreSQL. Follow the steps below to get the database operational in development.

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment Variables

Copy the example file and update it with your database credentials:

```bash
cp .env.example .env
```

Edit `.env` so that `DATABASE_URL` points to your PostgreSQL instance. For example, a local connection string might look like:

```
DATABASE_URL=postgresql://a4ot:localpassword@localhost:5432/a4ot
```

If you prefer to provide discrete PostgreSQL settings, you can set the standard environment variables instead of a URL:

```
PGHOST=localhost
PGPORT=5432
PGDATABASE=a4ot
PGUSER=a4ot
PGPASSWORD=localpassword
```

If you are connecting to a managed provider that requires TLS (e.g., Supabase, Render), set `PGSSLMODE=require`.

## 3. Prepare the Database

Once the environment variables are configured, run the schema initialization script:

```bash
npm run db:init
```

This applies the SQL found in [`db/schema.sql`](db/schema.sql), creating the `questionnaire_responses` table and ensuring necessary extensions are available.

## 4. Start the Server

Launch the Express server, which serves the static site from `public/` and exposes the questionnaire APIs:

```bash
npm start
```

The server listens on port `5742` by default (matching the production deployment). Navigate to `http://localhost:5742` to interact with the application, or set the `PORT` environment variable if you need a different port locally.

## 5. Verifying Connectivity

Two API endpoints are available to help confirm connectivity:

- `GET /api/health` — verifies a simple round-trip query to PostgreSQL.
- `POST /api/responses` — stores questionnaire responses. The frontend automatically calls this endpoint when a user completes the questionnaire.

You can also query recent responses with `GET /api/responses` (intended for administrative use).

---

If the server logs warnings about `DATABASE_URL` being missing, confirm that the environment file is loaded and that the process has access to your PostgreSQL instance.
