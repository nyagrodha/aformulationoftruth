use crate::models::Question;
use sqlx::{Row, SqlitePool};
use std::env;

pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new() -> Result<Self, sqlx::Error> {
        let database_url =
            env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:../karuppacami.db".to_string());

        let pool = SqlitePool::connect(&database_url).await?;

        // Run migrations
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS magic_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                expires_at DATETIME NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                question_id INTEGER NOT NULL,
                response_text TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(email) REFERENCES users(email)
            )
            "#,
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS newsletter_subscribers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await?;

        Ok(Database { pool })
    }

    pub async fn store_magic_link(&self, email: &str, token: &str) -> Result<(), sqlx::Error> {
        let expires_at = (chrono::Utc::now() + chrono::Duration::minutes(15))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();

        sqlx::query("INSERT INTO magic_links (email, token, expires_at) VALUES (?, ?, ?)")
            .bind(email)
            .bind(token)
            .bind(expires_at)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn verify_magic_link(&self, token: &str) -> Result<String, sqlx::Error> {
        let row = sqlx::query(
            "SELECT email FROM magic_links
             WHERE token = ? AND expires_at > datetime('now') AND used = FALSE",
        )
        .bind(token)
        .fetch_one(&self.pool)
        .await?;

        let email: String = row.get("email");

        // Mark token as used
        sqlx::query("UPDATE magic_links SET used = TRUE WHERE token = ?")
            .bind(token)
            .execute(&self.pool)
            .await?;

        // Ensure user exists
        sqlx::query("INSERT OR IGNORE INTO users (email) VALUES (?)")
            .bind(&email)
            .execute(&self.pool)
            .await?;

        Ok(email)
    }

    pub async fn store_session(&self, email: &str, token: &str) -> Result<(), sqlx::Error> {
        let expires_at = (chrono::Utc::now() + chrono::Duration::days(30))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();

        sqlx::query("INSERT INTO sessions (email, token, expires_at) VALUES (?, ?, ?)")
            .bind(email)
            .bind(token)
            .bind(expires_at)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn verify_session(&self, token: &str) -> Result<String, sqlx::Error> {
        let row = sqlx::query(
            "SELECT email FROM sessions
             WHERE token = ? AND expires_at > datetime('now')",
        )
        .bind(token)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get("email"))
    }

    pub async fn store_response(
        &self,
        email: &str,
        question_id: i32,
        response_text: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO responses (email, question_id, response_text)
             VALUES (?, ?, ?)",
        )
        .bind(email)
        .bind(question_id)
        .bind(response_text)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_questions(&self) -> Result<Vec<Question>, sqlx::Error> {
        // For now, return hardcoded Proust questions
        Ok(vec![
            Question {
                id: 1,
                text: "What is your idea of perfect happiness?".to_string(),
            },
            Question {
                id: 2,
                text: "What is your greatest fear?".to_string(),
            },
            Question {
                id: 3,
                text: "What is the trait you most deplore in yourself?".to_string(),
            },
            Question {
                id: 4,
                text: "What is the trait you most deplore in others?".to_string(),
            },
            Question {
                id: 5,
                text: "Which living person do you most admire?".to_string(),
            },
        ])
    }

    pub async fn subscribe_newsletter(&self, email: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("INSERT OR IGNORE INTO newsletter_subscribers (email) VALUES (?)")
            .bind(email)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() == 0)
    }
}
