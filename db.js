const Database = require("better-sqlite3");
const path     = require("path");

// DB file sits at project root: ./chatos.db
// Change DB_PATH in .env to move it elsewhere
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "chatos.db");

const db = new Database(DB_PATH);

// WAL mode = much faster writes, safe for concurrent reads
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* ─────────────────────────────────────────────
    Schema — runs once on first boot, safe to
    re-run on every restart (IF NOT EXISTS)
───────────────────────────────────────────── */
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

// Seed default rooms (ignored if they already exist)
const seedRoom = db.prepare(
    "INSERT OR IGNORE INTO rooms (name, description) VALUES (?, ?)"
);
[
    ["general",  "main chat — be excellent to each other"],
    ["dev-chat", "code, tools, and tech talk"],
    ["random",   "anything goes"],
    ["design",   "ui, ux, and aesthetics"],
].forEach(([name, desc]) => seedRoom.run(name, desc));

/* ─────────────────────────────────────────────
    Users
───────────────────────────────────────────── */

/**
 * Register a username. Returns true if inserted, false if taken.
 */
function registerUser(username) {
    try {
        db.prepare("INSERT INTO users (username) VALUES (?)").run(username);
        return true;
    } catch {
        return false; // UNIQUE constraint = username taken
    }
}

/**
 * Remove a user record on disconnect.
 */
function removeUser(username) {
    db.prepare("DELETE FROM users WHERE username = ?").run(username);
}

/* ─────────────────────────────────────────────
    Messages
───────────────────────────────────────────── */

/**
 * Persist a message and return it with a formatted timestamp.
 */
function saveMessage({ room, username, text, type = "chat" }) {
    const stmt = db.prepare(`
        INSERT INTO messages (room, username, text, type)
        VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(room, username, text, type);

    // Fetch back so we have the DB-generated timestamp
    return db.prepare("SELECT * FROM messages WHERE id = ?").get(info.lastInsertRowid);
}

/**
 * Last N messages for a room, oldest first (for replay on join).
 * Default: 50 messages.
 */
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

/* ─────────────────────────────────────────────
    Rooms
───────────────────────────────────────────── */

function getRooms() {
  return db.prepare("SELECT * FROM rooms ORDER BY id ASC").all();
}

/* ─────────────────────────────────────────────
    Exports
───────────────────────────────────────────── */
module.exports = {
    registerUser,
    removeUser,
    saveMessage,
    getHistory,
    getRooms,
};