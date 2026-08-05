use lettre::{
    message::header::ContentType, transport::smtp::authentication::Credentials, Message,
    SmtpTransport, Transport,
};
use std::env;

pub async fn send_magic_link(email: &str, token: &str) -> Result<(), Box<dyn std::error::Error>> {
    let smtp_host = env::var("SMTP_HOST").unwrap_or_else(|_| "smtp.gmail.com".to_string());
    let smtp_user = env::var("SMTP_USER")?;
    let smtp_pass = env::var("SMTP_PASS")?;
    let base_url = env::var("BASE_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());

    let magic_link = format!("{}/auth/verify?token={}", base_url, token);

    let email_body = format!(
        r#"
        <html>
        <body style="font-family: 'Spectral', Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #8B4513;">Your Magic Link</h2>
            <p>Click the link below to sign in to A Formulation of Truth:</p>
            <p style="margin: 30px 0;">
                <a href="{}" style="background-color: #8B4513; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                    Sign In
                </a>
            </p>
            <p style="color: #666; font-size: 0.9em;">This link will expire in 15 minutes.</p>
            <p style="color: #666; font-size: 0.9em;">
                If you didn't request this link, you can safely ignore this email.
            </p>
        </body>
        </html>
        "#,
        magic_link
    );

    let email = Message::builder()
        .from(smtp_user.parse()?)
        .to(email.parse()?)
        .subject("Your Magic Link - A Formulation of Truth")
        .header(ContentType::TEXT_HTML)
        .body(email_body)?;

    let creds = Credentials::new(smtp_user, smtp_pass);
    let mailer = SmtpTransport::relay(&smtp_host)?.credentials(creds).build();

    mailer.send(&email)?;

    Ok(())
}
