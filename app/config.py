"""Application configuration via environment variables.

All values are read from env vars at startup. Defaults are empty/generic
placeholders — production values live in gate.env (not committed).
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database — fallback chain: VPN → domain → localhost
    database_url: str = ""
    database_url_primary: str = ""
    database_url_secondary: str = ""
    database_url_local: str = ""

    # Age encryption (X25519 public key)
    age_recipient: str = ""

    # Secrets
    hmac_secret: str = ""       # SESSION_HMAC_SECRET — HMAC-SHA256 key
    session_secret: str = ""    # Fernet key for encrypting session cookies

    # Bind address
    bind_addr: str = "127.0.0.1:8787"

    # Inter-service auth
    gate_api_key: str = ""

    # Fresh API URLs — clearnet Deno server (fallback chain)
    fresh_api_primary: str = ""
    fresh_api_secondary: str = ""
    fresh_api_local: str = ""
    fresh_api_domain: str = ""

    # Rate limiting
    rate_limit_window: int = 60     # seconds
    rate_limit_max: int = 10        # max requests per window for auth endpoints

    # Session
    session_max_age: int = 86400    # 24 hours in seconds

    # Lotto protocol
    lotto_min_participants: int = 15
    lotto_window_days: int = 21
    lotto_claim_window_days: int = 7
    lotto_drand_url_template: str = "https://api.drand.sh/public/{round}"
    lotto_default_drand_round_target: int = 0
    lotto_operator_token: str = ""
    lotto_operator_signing_key_b64: str = ""  # Base64 raw Ed25519 (32 bytes)

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
