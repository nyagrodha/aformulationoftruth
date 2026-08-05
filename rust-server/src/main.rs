//! aformulationoftruth-gate
//!
//! Tiny HTTP service that age-encrypts gate answers before storage so that
//! only the holder of the corresponding x25519 identity (kept offline) can
//! ever decrypt them. Speaks the contract expected by
//! `lib/gate-client.ts` in the Deno Fresh app:
//!
//!   POST /api/store
//!     { session_id, question_text, question_index, answer, skipped }
//!     -> 200 { ok: true }
//!
//! All input goes in encrypted; nothing leaves except an ack.

use std::{env, iter, net::SocketAddr, sync::Arc, time::Duration};

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::io::Write as _;
use tower_http::trace::TraceLayer;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

const DEFAULT_BIND: &str = "127.0.0.1:8787";
const DEFAULT_RECIPIENT: &str =
    "age1jwpy3l4pdzzswm5jj3q2yax4eduf97t6wjqkyd4g6anjtffn5vrs38ag5q";

#[derive(Clone)]
struct AppState {
    pool: PgPool,
    recipient: Arc<age::x25519::Recipient>,
}

#[derive(Debug, Deserialize)]
struct StoreReq {
    session_id: String,
    question_text: String,
    question_index: i64,
    answer: String,
    #[serde(default)]
    skipped: bool,
}

#[derive(Debug, Serialize)]
struct StoreOk {
    ok: bool,
}

#[derive(Debug, Serialize)]
struct ErrBody {
    error: String,
}

#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("validation: {0}")]
    Validation(String),
    #[error("encryption: {0}")]
    Encryption(String),
    #[error("database: {0}")]
    Db(#[from] sqlx::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, body) = match &self {
            AppError::Validation(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::Encryption(_) | AppError::Db(_) | AppError::Io(_) => {
                error!(error = %self, "internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error".to_string())
            }
        };
        (status, Json(ErrBody { error: body })).into_response()
    }
}

fn armor_encrypt(plaintext: &str, recipient: &age::x25519::Recipient) -> Result<String, AppError> {
    let encryptor = age::Encryptor::with_recipients(iter::once(recipient as &dyn age::Recipient))
        .map_err(|e| AppError::Encryption(format!("encryptor init: {e}")))?;

    let mut encrypted: Vec<u8> = Vec::with_capacity(plaintext.len() + 256);
    let armored = age::armor::ArmoredWriter::wrap_output(
        &mut encrypted,
        age::armor::Format::AsciiArmor,
    )
    .map_err(|e| AppError::Encryption(format!("armor wrap: {e}")))?;

    let mut writer = encryptor
        .wrap_output(armored)
        .map_err(|e| AppError::Encryption(format!("encryptor wrap: {e}")))?;
    writer
        .write_all(plaintext.as_bytes())
        .map_err(|e| AppError::Encryption(format!("write: {e}")))?;

    let armor = writer
        .finish()
        .map_err(|e| AppError::Encryption(format!("finish encrypt: {e}")))?;
    armor
        .finish()
        .map_err(|e| AppError::Encryption(format!("finish armor: {e}")))?;

    String::from_utf8(encrypted).map_err(|e| AppError::Encryption(format!("utf8: {e}")))
}

/// Strip credentials from a connection string before it can reach a log.
///
/// `postgresql://user:pass@host:5432/db` -> `postgresql://host:5432/db`
///
/// Under SQLite the startup line logged a file path and was harmless. Postgres
/// puts the password in the same field, so logging it unmodified writes the
/// database credential into journald on every start. Anything that logs a
/// connection string must go through this.
fn redact_db_url(url: &str) -> String {
    match url.split_once("://") {
        // Split at the LAST '@': passwords may legally contain one.
        Some((scheme, rest)) => match rest.rsplit_once('@') {
            Some((_credentials, host_and_db)) => format!("{scheme}://{host_and_db}"),
            None => url.to_string(),
        },
        None => "<redacted>".to_string(),
    }
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

async fn store(
    State(state): State<AppState>,
    Json(req): Json<StoreReq>,
) -> Result<Json<StoreOk>, AppError> {
    if req.session_id.is_empty() || req.session_id.len() > 128 {
        return Err(AppError::Validation("session_id length".into()));
    }
    if req.question_index < 0 || req.question_index > 64 {
        return Err(AppError::Validation("question_index out of range".into()));
    }
    if req.question_text.len() > 1024 {
        return Err(AppError::Validation("question_text too long".into()));
    }
    if req.answer.len() > 64 * 1024 {
        return Err(AppError::Validation("answer too long".into()));
    }

    // Encrypt the answer payload (empty string when skipped is still encrypted
    // so the row shape stays uniform and no plaintext side-channel exists).
    let ciphertext = armor_encrypt(&req.answer, &state.recipient)?;

    sqlx::query(
        r#"
        INSERT INTO gate_encrypted_answers
            (session_id, question_index, question_text, ciphertext, skipped, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (session_id, question_index) DO UPDATE SET
            question_text = excluded.question_text,
            ciphertext    = excluded.ciphertext,
            skipped       = excluded.skipped,
            created_at    = NOW()
        "#,
    )
    .bind(&req.session_id)
    .bind(req.question_index)
    .bind(&req.question_text)
    .bind(&ciphertext)
    .bind(req.skipped)
    .execute(&state.pool)
    .await?;

    Ok(Json(StoreOk { ok: true }))
}

/// Verify the store is present and writable, and refuse to start otherwise.
///
/// This service does no DDL. Under SQLite it created its own table, which was
/// safe because the process owned the file outright. Sharing the Fresh app's
/// Postgres makes schema creation a privileged operation distinct from the
/// runtime role's rights: `a4m_app` holds DML only, so a `CREATE TABLE` here
/// fails with "permission denied for schema public" even when everything is
/// correctly configured — a confusing error for a non-problem.
///
/// The schema lives in db/migrations/007_gate_encrypted_answers.sql instead,
/// and this checks the result. Failing at startup with an actionable message
/// beats discovering it on the first visitor's answer.
async fn preflight(pool: &PgPool) -> anyhow::Result<()> {
    let table: Option<String> =
        sqlx::query_scalar("SELECT to_regclass('public.gate_encrypted_answers')::text")
            .fetch_one(pool)
            .await?;

    if table.is_none() {
        anyhow::bail!(
            "table gate_encrypted_answers is missing — apply \
             db/migrations/007_gate_encrypted_answers.sql as a privileged role"
        );
    }

    let writable: bool = sqlx::query_scalar(
        "SELECT has_table_privilege('gate_encrypted_answers', 'INSERT') \
         AND has_table_privilege('gate_encrypted_answers', 'UPDATE')",
    )
    .fetch_one(pool)
    .await?;

    if !writable {
        anyhow::bail!(
            "role lacks INSERT/UPDATE on gate_encrypted_answers — \
             GRANT SELECT, INSERT, UPDATE ON gate_encrypted_answers TO <role>"
        );
    }

    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,sqlx=warn")),
        )
        .init();

    let bind: SocketAddr = env::var("GATE_BIND")
        .unwrap_or_else(|_| DEFAULT_BIND.to_string())
        .parse()?;
    // Required, deliberately with no fallback. This service shares the Fresh
    // app's Postgres; a default would either point somewhere wrong or silently
    // create a second store, which is the split this consolidation removes.
    let db_url = env::var("DATABASE_URL")
        .map_err(|_| anyhow::anyhow!("DATABASE_URL is required (postgres:// connection string)"))?;
    let recipient_str = env::var("AGE_RECIPIENT").unwrap_or_else(|_| DEFAULT_RECIPIENT.to_string());

    let recipient: age::x25519::Recipient = recipient_str
        .parse()
        .map_err(|e| anyhow::anyhow!("AGE_RECIPIENT parse: {e}"))?;
    info!(recipient = %recipient.to_string(), "age recipient loaded");

    let pool = PgPoolOptions::new()
        .max_connections(8)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&db_url)
        .await?;
    preflight(&pool).await?;

    let state = AppState {
        pool,
        recipient: Arc::new(recipient),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/store", post(store))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    info!(%bind, db = %redact_db_url(&db_url), "aformulationoftruth-gate listening");
    let listener = tokio::net::TcpListener::bind(bind).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
