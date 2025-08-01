import sqlite3Pkg from 'sqlite3';
const sqlite3 = sqlite3Pkg.verbose();
const db = new sqlite3.Database(process.env.DB_PATH || './database.sqlite');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      token TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      question TEXT,
      answer TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
});

export default db;
