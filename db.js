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
        parent_id   INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room
        ON messages (room, created_at);

    CREATE TABLE IF NOT EXISTS message_reactions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        username    TEXT    NOT NULL,
        emoji       TEXT    NOT NULL,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(message_id, username, emoji)
    );
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
    db.prepare("INSERT OR IGNORE INTO users (username) VALUES (?)").run(username);
    return true;
}

function removeUser(username) {
    db.prepare("DELETE FROM users WHERE username = ?").run(username);
}

const messageColumns = db.prepare("PRAGMA table_info(messages)").all();
if (!messageColumns.some((col) => col.name === 'parent_id')) {
    db.exec("ALTER TABLE messages ADD COLUMN parent_id INTEGER");
}

function saveMessage({ room, username, text, type = "chat", parent_id = null }) {
    const stmt = db.prepare(`
        INSERT INTO messages (room, username, text, type, parent_id)
        VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(room, username, text, type, parent_id);

    return db.prepare("SELECT * FROM messages WHERE id = ?").get(info.lastInsertRowid);
}

function getHistory(room, username = '', limit = 50) {
    const messages = db
        .prepare(`
        SELECT m.*, (
            SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id
        ) AS reply_count
        FROM (
            SELECT * FROM messages
            WHERE room = ? AND parent_id IS NULL
            ORDER BY created_at DESC
            LIMIT ?
        ) AS m
        ORDER BY m.created_at ASC
        `)
        .all(room, limit);

    if (!messages.length) return messages;

    const ids = messages.map((m) => m.id);
    const placeholders = ids.map(() => '?').join(',');
    const reactionRows = db.prepare(`
        SELECT message_id,
                emoji,
                COUNT(*) AS count,
                SUM(CASE WHEN username = ? THEN 1 ELSE 0 END) AS mine
        FROM message_reactions
        WHERE message_id IN (${placeholders})
        GROUP BY message_id, emoji
    `).all(username, ...ids);

    const reactionMap = {};
    reactionRows.forEach((row) => {
        if (!reactionMap[row.message_id]) reactionMap[row.message_id] = [];
        reactionMap[row.message_id].push({
            emoji: row.emoji,
            count: row.count,
            mine: !!row.mine,
        });
    });

    return messages.map((m) => ({
        ...m,
        reactions: reactionMap[m.id] || [],
    }));
}

function getReplies(parentId, username = '') {
    const replies = db.prepare(`
        SELECT m.*,
                (
                    SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id
                ) AS reply_count
        FROM messages m
        WHERE parent_id = ?
        ORDER BY created_at ASC
    `).all(parentId);

    if (!replies.length) return replies;

    const ids = replies.map((m) => m.id);
    const placeholders = ids.map(() => '?').join(',');
    const reactionRows = db.prepare(`
        SELECT message_id,
                emoji,
                COUNT(*) AS count,
                SUM(CASE WHEN username = ? THEN 1 ELSE 0 END) AS mine
        FROM message_reactions
        WHERE message_id IN (${placeholders})
        GROUP BY message_id, emoji
    `).all(username, ...ids);

    const reactionMap = {};
    reactionRows.forEach((row) => {
        if (!reactionMap[row.message_id]) reactionMap[row.message_id] = [];
        reactionMap[row.message_id].push({
            emoji: row.emoji,
            count: row.count,
            mine: !!row.mine,
        });
    });

    return replies.map((m) => ({
        ...m,
        reactions: reactionMap[m.id] || [],
    }));
}

function searchMessages(room, username = '', term = '', limit = 50) {
    if (!term || !term.trim()) return [];
    const q = `%${term.trim().toLowerCase()}%`;
    const results = db.prepare(`
        SELECT m.*,
                (
                    SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id
                ) AS reply_count
        FROM messages m
        WHERE room = ?
            AND (LOWER(text) LIKE ? OR LOWER(username) LIKE ?)
        ORDER BY created_at DESC
        LIMIT ?
    `).all(room, q, q, limit);

    if (!results.length) return results;

    const ids = results.map((m) => m.id);
    const placeholders = ids.map(() => '?').join(',');
    const reactionRows = db.prepare(`
        SELECT message_id,
                emoji,
                COUNT(*) AS count,
                SUM(CASE WHEN username = ? THEN 1 ELSE 0 END) AS mine
        FROM message_reactions
        WHERE message_id IN (${placeholders})
        GROUP BY message_id, emoji
    `).all(username, ...ids);

    const reactionMap = {};
    reactionRows.forEach((row) => {
        if (!reactionMap[row.message_id]) reactionMap[row.message_id] = [];
        reactionMap[row.message_id].push({
            emoji: row.emoji,
            count: row.count,
            mine: !!row.mine,
        });
    });

    return results.map((m) => ({
        ...m,
        reactions: reactionMap[m.id] || [],
    }));
}

function getReplyCount(parentId) {
    return db.prepare("SELECT COUNT(*) AS count FROM messages WHERE parent_id = ?").get(parentId).count;
}

function getMessageById(id) {
    return db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
}

function toggleReaction(messageId, username, emoji) {
    const exists = db
        .prepare("SELECT 1 FROM message_reactions WHERE message_id = ? AND username = ? AND emoji = ?")
        .get(messageId, username, emoji);

    if (exists) {
        db.prepare("DELETE FROM message_reactions WHERE message_id = ? AND username = ? AND emoji = ?")
            .run(messageId, username, emoji);
    } else {
        db.prepare("INSERT INTO message_reactions (message_id, username, emoji) VALUES (?, ?, ?)")
            .run(messageId, username, emoji);
    }

    return db
        .prepare(`
            SELECT emoji,
                    COUNT(*) AS count,
                    SUM(CASE WHEN username = ? THEN 1 ELSE 0 END) AS mine
            FROM message_reactions
            WHERE message_id = ?
            GROUP BY emoji
        `)
        .all(username, messageId)
        .map((row) => ({
            emoji: row.emoji,
            count: row.count,
            mine: !!row.mine,
        }));
}

function getRooms() {
  return db.prepare("SELECT * FROM rooms ORDER BY id ASC").all();
}

module.exports = {
    registerUser,
    removeUser,
    saveMessage,
    getHistory,
    getReplies,
    searchMessages,
    getReplyCount,
    getRooms,
    getMessageById,
    toggleReaction,
};