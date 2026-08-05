//! JWT issuance and verification for magic links and sessions.
//!
//! The signing secret is loaded exactly once, at startup, via
//! [`init_from_env`]. There is deliberately no fallback value: a JWT secret
//! that can be guessed lets anyone mint a valid session for any address, and
//! because the same secret verifies tokens, a fallback would make
//! [`verify_token`] fail *open*. If `JWT_SECRET` is absent or too short the
//! process must refuse to serve rather than serve insecurely.

use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::env;
use std::sync::OnceLock;
use uuid::Uuid;

/// Minimum accepted `JWT_SECRET` length, in bytes.
///
/// HS256's block size is 64 bytes; a secret at least that long is used
/// directly as the HMAC key rather than being pre-hashed down, so this is the
/// point past which added length stops being discarded.
const MIN_SECRET_BYTES: usize = 64;

const MAGIC_LINK_TTL_MINUTES: i64 = 15;
const SESSION_TTL_DAYS: i64 = 30;

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String, // email
    exp: usize,  // expiration timestamp
    iat: usize,  // issued at
    jti: String, // token ID
}

/// Keys derived once from the secret, so the secret is read from the
/// environment a single time instead of on every sign and verify.
struct Keys {
    encoding: EncodingKey,
    decoding: DecodingKey,
}

static KEYS: OnceLock<Keys> = OnceLock::new();

/// Load `JWT_SECRET` and derive the signing keys.
///
/// Call this once during startup, before the server begins accepting
/// requests, and abort the process if it returns an error. Later calls are
/// no-ops and keep the keys established by the first.
pub fn init_from_env() -> anyhow::Result<()> {
    let secret = env::var("JWT_SECRET").map_err(|_| {
        anyhow::anyhow!("JWT_SECRET must be set; refusing to start without a signing secret")
    })?;

    anyhow::ensure!(
        secret.len() >= MIN_SECRET_BYTES,
        "JWT_SECRET must be at least {MIN_SECRET_BYTES} bytes, got {}",
        secret.len()
    );

    let _ = KEYS.set(Keys {
        encoding: EncodingKey::from_secret(secret.as_bytes()),
        decoding: DecodingKey::from_secret(secret.as_bytes()),
    });

    Ok(())
}

/// Panics if [`init_from_env`] has not run. That is a startup-ordering bug in
/// this binary, not a condition any request can provoke.
fn keys() -> &'static Keys {
    KEYS.get()
        .expect("auth::init_from_env() must be called during startup")
}

fn issue(email: &str, ttl: chrono::Duration) -> Result<String, jsonwebtoken::errors::Error> {
    let now = chrono::Utc::now();
    let claims = Claims {
        sub: email.to_string(),
        exp: (now + ttl).timestamp() as usize,
        iat: now.timestamp() as usize,
        jti: Uuid::new_v4().to_string(),
    };

    encode(&Header::default(), &claims, &keys().encoding)
}

pub fn generate_magic_link_token(email: &str) -> Result<String, jsonwebtoken::errors::Error> {
    issue(email, chrono::Duration::minutes(MAGIC_LINK_TTL_MINUTES))
}

pub fn generate_session_token(email: &str) -> Result<String, jsonwebtoken::errors::Error> {
    issue(email, chrono::Duration::days(SESSION_TTL_DAYS))
}

pub fn verify_token(token: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let token_data = decode::<Claims>(token, &keys().decoding, &Validation::default())?;

    Ok(token_data.claims.sub)
}
