const Database = require("better-sqlite3");
const path     = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "chatos.db");

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL UNIQUE,
        description TEXT    NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        username    TEXT    NOT NULL UNIQUE,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        room        TEXT    NOT NULL,
        username    TEXT    NOT NULL,
        text        TEXT    NOT NULL,
        type        TEXT    NOT NULL DEFAULT 'chat',   -- 'chat' | 'system'
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room
        ON messages (room, created_at);
`);

const seedRoom = db.prepare(
    "INSERT OR IGNORE INTO rooms (name, description) VALUES (?, ?)"
);
[
    ["general",  "main chat — be excellent to each other"],
    ["dev-chat", "code, tools, and tech talk"],
    ["random",   "anything goes"],
    ["design",   "ui, ux, and aesthetics"],
].forEach(([name, desc]) => seedRoom.run(name, desc));

function registerUser(username) {
    try {
        db.prepare("INSERT INTO users (username) VALUES (?)").run(username);
        return true;
    } catch {
        return false;
    }
}

function removeUser(username) {
    db.prepare("DELETE FROM users WHERE username = ?").run(username);
}


function saveMessage({ room, username, text, type = "chat" }) {
    const stmt = db.prepare(`
        INSERT INTO messages (room, username, text, type)
        VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(room, username, text, type);

    return db.prepare("SELECT * FROM messages WHERE id = ?").get(info.lastInsertRowid);
}

function getHistory(room, limit = 50) {
    return db
        .prepare(`
        SELECT * FROM (
            SELECT * FROM messages
            WHERE room = ?
            ORDER BY created_at DESC
            LIMIT ?
        ) ORDER BY created_at ASC
        `)
        .all(room, limit);
    }


function getRooms() {
  return db.prepare("SELECT * FROM rooms ORDER BY id ASC").all();
}

module.exports = {
    registerUser,
    removeUser,
    saveMessage,
    getHistory,
    getRooms,
};