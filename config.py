"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://a4m_gate_app@/a4m_gate?host=/var/run/postgresql-gate&port=5433"

    # Age encryption
    age_recipient: str = ""

    # Secrets
    hmac_secret: str = ""       # HMAC-SHA256 key for ZK email lookups
    session_secret: str = ""    # Fernet key for encrypting session cookies

    # Rate limiting
    rate_limit_window: int = 60     # seconds
    rate_limit_max: int = 10        # max requests per window for auth endpoints

    # Session
    session_max_age: int = 86400    # 24 hours in seconds

    # Lotto protocol
    lotto_enabled: bool = False
    lotto_min_participants: int = 15
    lotto_window_days: int = 21
    lotto_claim_window_days: int = 7
    lotto_drand_url_template: str = "https://api.drand.sh/public/{round}"
    lotto_default_drand_round_target: int = 0
    lotto_operator_token: str = ""
    # Base64-encoded raw Ed25519 private key bytes (32 bytes).
    lotto_operator_signing_key_b64: str = ""

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
