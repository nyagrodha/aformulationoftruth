use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Question {
    pub id: i32,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: i32,
    pub email: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Response {
    pub id: i32,
    pub email: String,
    pub question_id: i32,
    pub response_text: String,
    pub created_at: String,
}
