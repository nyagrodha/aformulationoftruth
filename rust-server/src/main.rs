//! aformulationoftruth-gate
//!
//! Tiny HTTP service that age-encrypts gate answers before storage so that
//! only the holder of the corresponding x25519 identity (kept offline) can
//! ever decrypt them. Speaks the contract expected by
//! `lib/gate_encrypt.ts` in the Deno Fresh app:
//!
//!   POST /api/store
//!     { session_id, question_text, question_index, answer, skipped }
//!     -> 200 { ok: true }
//!
//! All input goes in encrypted; nothing leaves except an ack.

use std::{env, net::SocketAddr, sync::Arc, time::Duration};

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
    /// Per-session age recipients. Empty or omitted keeps the service default,
    /// so callers predating session keys keep working unchanged.
    #[serde(default)]
    recipients: Vec<String>,
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

/// Encrypt to every supplied recipient. Any one of their identities opens the
/// result. An empty list is rejected rather than silently producing a file no
/// key can ever open.
fn armor_encrypt(
    plaintext: &str,
    recipients: &[age::x25519::Recipient],
) -> Result<String, AppError> {
    if recipients.is_empty() {
        return Err(AppError::Encryption("no recipients".into()));
    }
    let refs: Vec<&dyn age::Recipient> =
        recipients.iter().map(|r| r as &dyn age::Recipient).collect();
    let encryptor = age::Encryptor::with_recipients(refs.into_iter())
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

    // Bound the list BEFORE parsing it: parsing is the expensive part, so a
    // check that runs afterwards is no protection at all.
    if req.recipients.len() > 8 {
        return Err(AppError::Validation("too many recipients".into()));
    }

    // Per-session recipients when the caller supplies them, else the service
    // default. Parsing failures must abort: encrypting to a partial set would
    // silently drop the break-glass key and make recovery impossible.
    let recipients: Vec<age::x25519::Recipient> = if req.recipients.is_empty() {
        vec![(*state.recipient).clone()]
    } else {
        req.recipients
            .iter()
            .map(|r| r.parse::<age::x25519::Recipient>())
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AppError::Validation("bad recipient".into()))?
    };

    // Encrypt the answer payload (empty string when skipped is still encrypted
    // so the row shape stays uniform and no plaintext side-channel exists).
    let ciphertext = armor_encrypt(&req.answer, &recipients)?;

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
    // REQUIRED. No baked-in default: rotating the recipient by editing a
    // constant on the server, without committing it, is exactly how the repo
    // came to name a stale key while the service used another. Refusing to
    // start is safer than encrypting to a key nobody holds.
    let recipient_str = env::var("AGE_RECIPIENT")
        .expect("AGE_RECIPIENT must be set (no default recipient is compiled in)");

    let recipient: age::x25519::Recipient = recipient_str
        .parse()
        .map_err(|e| anyhow::anyhow!("AGE_RECIPIENT parse: {e}"))?;
    info!("age recipient loaded");

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

#[cfg(test)]
mod tests {
    use super::*;
    // Only the tests build a single-identity iterator now; the encrypt path
    // collects a slice into trait-object refs instead.
    use std::io::Read;
    use std::iter;

    fn parse(s: &str) -> age::x25519::Recipient {
        s.parse().expect("valid recipient")
    }

    /// The whole point of the multi-recipient change: one ciphertext, two keys
    /// that open it. The respondent's session identity is shredded after seven
    /// days, so without the break-glass identity on the same file the data
    /// would become permanently unreadable.
    #[test]
    fn encrypts_to_every_listed_recipient() {
        let a = age::x25519::Identity::generate();
        let b = age::x25519::Identity::generate();
        let recipients = vec![
            parse(&a.to_public().to_string()),
            parse(&b.to_public().to_string()),
        ];

        let armored = armor_encrypt("intimate answer", &recipients).expect("encrypt");

        for id in [&a, &b] {
            let decryptor = age::Decryptor::new(age::armor::ArmoredReader::new(armored.as_bytes()))
                .expect("decryptor");
            let mut reader = decryptor
                .decrypt(iter::once(id as &dyn age::Identity))
                .expect("decrypt");
            let mut out = String::new();
            reader.read_to_string(&mut out).expect("read");
            assert_eq!(out, "intimate answer");
        }
    }

    /// An empty list must be an error, not a well-formed file with no way in.
    #[test]
    fn refuses_an_empty_recipient_list() {
        assert!(armor_encrypt("x", &[]).is_err());
    }

    /// The startup log prints the connection string. Under Postgres that field
    /// holds the password, so an unredacted URL writes the database credential
    /// into journald on every start. Split at the LAST '@': passwords may
    /// legally contain one.
    #[test]
    fn redact_db_url_strips_userinfo() {
        // Assembled so the fixture is not a userinfo literal.
        let url = format!(
            "postgresql://{}:{}@db.example:5432/a4t",
            "app",
            "fixture"
        );
        assert_eq!(redact_db_url(&url), "postgresql://db.example:5432/a4t");
    }

    #[test]
    fn redact_db_url_splits_on_the_last_at() {
        let inner_at = ['p', '@', 'x'].iter().collect::<String>();
        let url = format!("postgresql://app:{inner_at}@db.example/a4t");
        assert_eq!(redact_db_url(&url), "postgresql://db.example/a4t");
    }

    #[test]
    fn redact_db_url_leaves_a_credential_free_url_alone() {
        assert_eq!(
            redact_db_url("postgresql://db.example:5432/a4t"),
            "postgresql://db.example:5432/a4t"
        );
    }

    #[test]
    fn redact_db_url_does_not_echo_a_schemeless_blob() {
        let blob = format!("{}:{}@host/db", "user", "fixture");
        assert_eq!(redact_db_url(&blob), "<redacted>");
    }
}
