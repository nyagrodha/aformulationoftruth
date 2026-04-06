use argon2::{Argon2, PasswordHash, PasswordVerifier};
use axum::{
    extract::{Form, Json, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Router,
};
use axum_extra::extract::cookie::{time::Duration as CookieDuration, Cookie, CookieJar, SameSite};
use chrono::{Duration as ChronoDuration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::{env, fs, net::SocketAddr, sync::Arc};
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer, cors::CorsLayer, services::ServeDir, trace::TraceLayer,
};
use tracing::{info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;
mod db;
mod email;
mod models;

use db::Database;

#[derive(Clone)]
struct AppState {
    db: Arc<Database>,
    lotto_gate: LottoGateConfig,
}

#[derive(Clone)]
struct LottoGateConfig {
    enabled: bool,
    password_hash: String,
    token_secret: String,
    ttl_hours: i64,
    page_html: Option<Arc<String>>,
}

impl LottoGateConfig {
    fn load() -> Self {
        let password_hash = env::var("LOTTO_PASSWORD_HASH").unwrap_or_default();
        let enabled = !password_hash.is_empty();

        if !enabled {
            warn!("LOTTO_PASSWORD_HASH not set; lotto gate disabled");
        }

        let token_secret = env::var("LOTTO_GATE_SECRET")
            .or_else(|_| env::var("JWT_SECRET"))
            .unwrap_or_else(|_| "lotto-fallback-secret".to_string());

        let ttl_hours = env::var("LOTTO_TOKEN_TTL_HOURS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(24);

        let page_path =
            env::var("LOTTO_PAGE_PATH").unwrap_or_else(|_| "../public/lotto.html".to_string());
        let page_html = fs::read_to_string(&page_path)
            .map(|s| Arc::new(s))
            .map_err(|err| warn!("Unable to read lotto page at {}: {}", page_path, err))
            .ok();

        LottoGateConfig {
            enabled,
            password_hash,
            token_secret,
            ttl_hours,
            page_html,
        }
    }

    fn verify_password(&self, password: &str) -> Result<(), AppError> {
        if !self.enabled {
            return Err(AppError::new(
                "Lotto gate disabled (set LOTTO_PASSWORD_HASH)",
                StatusCode::NOT_FOUND,
            ));
        }

        let parsed = PasswordHash::new(&self.password_hash).map_err(|_| {
            AppError::new(
                "Invalid LOTTO_PASSWORD_HASH format",
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        })?;

        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .map_err(|_| AppError::new("Invalid password", StatusCode::UNAUTHORIZED))
    }

    fn issue_token(&self) -> Result<String, AppError> {
        let now = Utc::now();
        let claims = LottoClaims {
            sub: "lotto".to_string(),
            exp: (now + ChronoDuration::hours(self.ttl_hours)).timestamp() as usize,
            iat: now.timestamp() as usize,
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.token_secret.as_bytes()),
        )
        .map_err(AppError::from)
    }

    fn validate_token(&self, token: &str) -> bool {
        decode::<LottoClaims>(
            token,
            &DecodingKey::from_secret(self.token_secret.as_bytes()),
            &Validation::default(),
        )
        .is_ok()
    }

    fn page_html(&self) -> Result<Html<String>, AppError> {
        match &self.page_html {
            Some(html) => Ok(Html((**html).clone())),
            None => Err(AppError::new(
                "Lotto page not found on disk",
                StatusCode::SERVICE_UNAVAILABLE,
            )),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct LottoClaims {
    sub: String,
    exp: usize,
    iat: usize,
}

const LOTTO_COOKIE: &str = "lotto_auth";

#[tokio::main]
async fn main() {
    // Load environment variables
    dotenv::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "aformulationoftruth_server=warn,tower_http=warn".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Initialize database
    let database = Database::new()
        .await
        .expect("Failed to initialize database");
    let lotto_gate = LottoGateConfig::load();
    let state = AppState {
        db: Arc::new(database),
        lotto_gate,
    };

    // Build router
    let app = Router::new()
        // API routes
        .route("/api/health", get(health_check))
        .route("/api/auth/magic-link", post(send_magic_link))
        .route("/api/auth/verify", post(verify_magic_link))
        .route("/api/questionnaire/submit", post(submit_response))
        .route("/api/questionnaire/questions", get(get_questions))
        .route("/api/newsletter/subscribe", post(newsletter_subscribe))
        // Password-gated lotto page
        .route("/lotto", get(lotto_page).post(lotto_login))
        .route("/lotto/logout", post(lotto_logout))
        // Serve static files from public directory
        .nest_service(
            "/",
            ServeDir::new("../public").append_index_html_on_directories(true),
        )
        // Middleware
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CompressionLayer::new())
                .layer(CorsLayer::permissive()),
        )
        .with_state(state);

    // Run server
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    info!("🚀 Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// Health check endpoint
async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

// Magic link authentication
#[derive(Deserialize)]
struct MagicLinkRequest {
    email: String,
}

#[derive(Serialize)]
struct MagicLinkResponse {
    message: String,
}

async fn send_magic_link(
    State(state): State<AppState>,
    Json(payload): Json<MagicLinkRequest>,
) -> Result<Json<MagicLinkResponse>, AppError> {
    // Generate magic link token
    let token = auth::generate_magic_link_token(&payload.email)?;

    // Store token in database
    state.db.store_magic_link(&payload.email, &token).await?;

    // Send email
    email::send_magic_link(&payload.email, &token).await?;

    Ok(Json(MagicLinkResponse {
        message: "Magic link sent to your email".to_string(),
    }))
}

#[derive(Deserialize)]
struct VerifyTokenRequest {
    token: String,
}

#[derive(Serialize)]
struct VerifyTokenResponse {
    session_token: String,
    email: String,
}

async fn verify_magic_link(
    State(state): State<AppState>,
    Json(payload): Json<VerifyTokenRequest>,
) -> Result<Json<VerifyTokenResponse>, AppError> {
    // Verify token and get email
    let email = state.db.verify_magic_link(&payload.token).await?;

    // Generate session token
    let session_token = auth::generate_session_token(&email)?;

    // Store session
    state.db.store_session(&email, &session_token).await?;

    Ok(Json(VerifyTokenResponse {
        session_token,
        email,
    }))
}

// Questionnaire endpoints
#[derive(Deserialize)]
struct QuestionnaireResponse {
    question_id: i32,
    response_text: String,
    session_token: String,
}

async fn submit_response(
    State(state): State<AppState>,
    Json(payload): Json<QuestionnaireResponse>,
) -> Result<StatusCode, AppError> {
    // Verify session
    let email = state.db.verify_session(&payload.session_token).await?;

    // Store response
    state
        .db
        .store_response(&email, payload.question_id, &payload.response_text)
        .await?;

    Ok(StatusCode::CREATED)
}

async fn get_questions(
    State(state): State<AppState>,
) -> Result<Json<Vec<models::Question>>, AppError> {
    let questions = state.db.get_questions().await?;
    Ok(Json(questions))
}

// Newsletter subscription
#[derive(Deserialize)]
struct NewsletterRequest {
    email: String,
}

#[derive(Serialize)]
struct NewsletterResponse {
    message: String,
    already_subscribed: bool,
}

async fn newsletter_subscribe(
    State(state): State<AppState>,
    Json(payload): Json<NewsletterRequest>,
) -> Result<Json<NewsletterResponse>, AppError> {
    let already_subscribed = state.db.subscribe_newsletter(&payload.email).await?;

    Ok(Json(NewsletterResponse {
        message: if already_subscribed {
            "Already subscribed".to_string()
        } else {
            "Successfully subscribed".to_string()
        },
        already_subscribed,
    }))
}

#[derive(Deserialize)]
struct LottoLoginForm {
    password: String,
}

fn login_page(error: Option<&str>, ttl_hours: i64) -> Html<String> {
    let error_block = error
        .map(|e| format!(r#"<p class="error">{}</p>"#, e))
        .unwrap_or_default();

    let template = r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>lotto access</title>
  <style>
    body { font-family: "IBM Plex Sans", system-ui, -apple-system, sans-serif; background:#0a0a0f; color:#f4f4f8; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .panel { background:#14141d; border:1px solid #1f1f2b; border-radius:12px; padding:28px; width: min(420px, 90vw); box-shadow:0 20px 60px rgba(0,0,0,0.45); }
    h1 { margin:0 0 16px; font-size:22px; letter-spacing:0.5px; }
    label { display:block; margin-bottom:8px; font-size:14px; color:#cdd1db; }
    input[type=password] { width:100%; padding:12px 14px; border-radius:10px; border:1px solid #2a2a3a; background:#0f0f18; color:#f4f4f8; font-size:15px; }
    button { margin-top:14px; width:100%; padding:12px 14px; border:none; border-radius:10px; background:linear-gradient(135deg,#5b8def,#7d6bff); color:#fff; font-weight:600; cursor:pointer; transition:transform 120ms ease, box-shadow 120ms ease; }
    button:hover { transform:translateY(-1px); box-shadow:0 10px 30px rgba(91,141,239,0.35); }
    .hint { margin-top:10px; font-size:13px; color:#9aa3b8; }
    .error { margin:12px 0; padding:10px 12px; background:#2a1214; color:#f2b8c0; border:1px solid #7f1d1d; border-radius:8px; }
  </style>
</head>
<body>
  <div class="panel">
    <h1>Enter lotto password</h1>
    <form method="post" action="/lotto">
      <label for="password">Access password (Argon2 protected)</label>
      <input id="password" name="password" type="password" required autocomplete="current-password" />
      <button type="submit">Unlock</button>
      <p class="hint">Session stays unlocked for ~{ttl}h unless you /lotto/logout.</p>
      {error_block}
    </form>
  </div>
</body>
</html>"#;

    let html = template
        .replace("{error_block}", &error_block)
        .replace("{ttl}", &ttl_hours.to_string());

    Html(html)
}

async fn lotto_page(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<impl IntoResponse, AppError> {
    if !state.lotto_gate.enabled {
        return Err(AppError::new(
            "Lotto gate disabled (set LOTTO_PASSWORD_HASH)",
            StatusCode::NOT_FOUND,
        ));
    }

    if let Some(cookie) = jar.get(LOTTO_COOKIE) {
        if state.lotto_gate.validate_token(cookie.value()) {
            let page = state.lotto_gate.page_html()?;
            return Ok((jar, page));
        }
    }

    Ok((jar, login_page(None, state.lotto_gate.ttl_hours)))
}

async fn lotto_login(
    State(state): State<AppState>,
    jar: CookieJar,
    Form(payload): Form<LottoLoginForm>,
) -> Result<impl IntoResponse, AppError> {
    state.lotto_gate.verify_password(&payload.password)?;
    let token = state.lotto_gate.issue_token()?;

    let cookie = Cookie::build((LOTTO_COOKIE, token))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(true)
        .max_age(CookieDuration::hours(state.lotto_gate.ttl_hours))
        .finish();

    let jar = jar.add(cookie);
    let page = state.lotto_gate.page_html()?;

    Ok((jar, page))
}

async fn lotto_logout(State(state): State<AppState>, jar: CookieJar) -> impl IntoResponse {
    if !state.lotto_gate.enabled {
        return (StatusCode::NOT_FOUND, "lotto gate disabled");
    }

    let cookie = Cookie::build((LOTTO_COOKIE, ""))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(CookieDuration::seconds(0))
        .finish();

    let jar = jar.remove(cookie);
    (
        jar,
        login_page(Some("Signed out."), state.lotto_gate.ttl_hours),
    )
}

// Error handling
#[derive(Debug)]
struct AppError {
    message: String,
    status: StatusCode,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let body = Json(serde_json::json!({
            "error": self.message
        }));

        (self.status, body).into_response()
    }
}

impl AppError {
    fn new(message: impl Into<String>, status: StatusCode) -> Self {
        AppError {
            message: message.into(),
            status,
        }
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError {
            message: "Internal server error".into(),
            status: StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl From<jsonwebtoken::errors::Error> for AppError {
    fn from(err: jsonwebtoken::errors::Error) -> Self {
        AppError {
            message: "Authentication error".into(),
            status: StatusCode::UNAUTHORIZED,
        }
    }
}

impl From<Box<dyn std::error::Error>> for AppError {
    fn from(err: Box<dyn std::error::Error>) -> Self {
        AppError {
            message: "Internal server error".into(),
            status: StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}
