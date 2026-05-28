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
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::io::Write as _;
use tower_http::trace::TraceLayer;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

const DEFAULT_BIND: &str = "127.0.0.1:8787";
const DEFAULT_DB: &str = "sqlite://./gate.sqlite?mode=rwc";
const DEFAULT_RECIPIENT: &str =
    "age1jwpy3l4pdzzswm5jj3q2yax4eduf97t6wjqkyd4g6anjtffn5vrs38ag5q";

#[derive(Clone)]
struct AppState {
    pool: SqlitePool,
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
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(session_id, question_index) DO UPDATE SET
            question_text = excluded.question_text,
            ciphertext    = excluded.ciphertext,
            skipped       = excluded.skipped,
            created_at    = CURRENT_TIMESTAMP
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

async fn migrate(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS gate_encrypted_answers (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id     TEXT    NOT NULL,
            question_index INTEGER NOT NULL,
            question_text  TEXT    NOT NULL,
            ciphertext     TEXT    NOT NULL,
            skipped        INTEGER NOT NULL DEFAULT 0,
            created_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (session_id, question_index)
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_gate_session ON gate_encrypted_answers (session_id)",
    )
    .execute(pool)
    .await?;

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
    let db_url = env::var("DATABASE_URL").unwrap_or_else(|_| DEFAULT_DB.to_string());
    let recipient_str = env::var("AGE_RECIPIENT").unwrap_or_else(|_| DEFAULT_RECIPIENT.to_string());

    let recipient: age::x25519::Recipient = recipient_str
        .parse()
        .map_err(|e| anyhow::anyhow!("AGE_RECIPIENT parse: {e}"))?;
    info!(recipient = %recipient.to_string(), "age recipient loaded");

    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&db_url)
        .await?;
    migrate(&pool).await?;

    let state = AppState {
        pool,
        recipient: Arc::new(recipient),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/store", post(store))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    info!(%bind, %db_url, "aformulationoftruth-gate listening");
    let listener = tokio::net::TcpListener::bind(bind).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
