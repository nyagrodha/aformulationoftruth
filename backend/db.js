const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(process.env.DB_PATH);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      created_at INTEGER
)`);

    db.run(`CREATE TABLE IF NOT EXISTS responses (
      email TEXT,
      question TEXT,
      answer TEXT,
      timestamp INTEGER
    )`);
});

module.exports = db;
