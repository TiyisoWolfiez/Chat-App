const express = require("express");
const path    = require("path");

const app    = express();
const server = require("http").createServer(app);
const io     = require("socket.io")(server);

app.use(express.static(path.join(__dirname, "public")));

/* ─────────────────────────────────────────────
    In-memory state
    (swap these Maps for DB queries later)
───────────────────────────────────────────── */

// username → socketId  (enforces uniqueness)
const users = new Map();

// roomName → Message[]  (last 50 messages per room)
const history = new Map();

// Default rooms
const DEFAULT_ROOMS = ["general", "dev-chat", "random", "design"];
DEFAULT_ROOMS.forEach(r => history.set(r, []));

/* ─────────────────────────────────────────────
    Helpers
───────────────────────────────────────────── */

function getTime() {
    return new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
}

function pushHistory(room, message) {
    const buf = history.get(room) || [];
    buf.push(message);
    if (buf.length > 50) buf.shift();
    history.set(room, buf);
}

function systemMsg(text) {
    return { type: "system", text, timestamp: getTime() };
}

function chatMsg(username, text) {
    return { type: "chat", username, text, timestamp: getTime() };
}

/* ─────────────────────────────────────────────
    Socket.io
───────────────────────────────────────────── */

io.on("connection", function (socket) {


  /* ── JOIN ──────────────────────────────── */
    socket.on("newuser", function ({ username, room = "general" }) {

        // Reject duplicate usernames
        if (users.has(username)) {
            socket.emit("join_error", "Username already taken. Choose another.");
            return;
        }

        // Register user
        users.set(username, socket.id);
        socket.data.username = username;
        socket.data.room     = room;

        // Join socket room
        socket.join(room);

        // Send message history to the joining user
        const buf = history.get(room) || [];
        socket.emit("history", buf);

        // Announce to room
        const msg = systemMsg(`<span class="name-amber">${username}</span> connected`);
        pushHistory(room, msg);
        io.to(room).emit("update", msg.text);

        // Send updated user list to everyone in room
        broadcastUserList(room);

        console.log(`[+] ${username} joined #${room}`);
    });

  /* ── SWITCH ROOM ───────────────────────── */
    socket.on("switchroom", function ({ room }) {
        const { username, room: prevRoom } = socket.data;
        if (!username) return;

        // Leave old room
        socket.leave(prevRoom);
        const leaveMsg = systemMsg(`<span class="name-amber">${username}</span> left`);
        pushHistory(prevRoom, leaveMsg);
        io.to(prevRoom).emit("update", leaveMsg.text);
        broadcastUserList(prevRoom);

        // Join new room
        socket.data.room = room;
        socket.join(room);

        // Send history of new room
        const buf = history.get(room) || [];
        socket.emit("history", buf);

        // Announce in new room
        const joinMsg = systemMsg(`<span class="name-amber">${username}</span> connected`);
        pushHistory(room, joinMsg);
        io.to(room).emit("update", joinMsg.text);
        broadcastUserList(room);

        console.log(`[~] ${username} switched to #${room}`);
    });

  /* ── CHAT ──────────────────────────────── */
    socket.on("chat", function ({ username, text }) {
        const { room } = socket.data;
        if (!room || !username || !text.trim()) return;

        const msg = chatMsg(username, text.trim());
        pushHistory(room, msg);

        socket.to(room).emit("chat", msg);
    });

  /* ── TYPING ────────────────────────────── */
    socket.on("typing", function (username) {
        const { room } = socket.data;
        if (room) socket.to(room).emit("typing", username);
    });

  /* ── GET USERS ─────────────────────────── */
    socket.on("getusers", function () {
        const { room } = socket.data;
        if (!room) return;
        socket.emit("userlist", getRoomUsers(room));
    });

  /* ── EXIT ──────────────────────────────── */
    socket.on("exituser", function (username) {
        handleDisconnect(socket, username);
    });

    socket.on("disconnect", function () {
        handleDisconnect(socket, socket.data.username);
    });
});

/* ─────────────────────────────────────────────
    Shared disconnect logic
───────────────────────────────────────────── */

function handleDisconnect(socket, username) {
    if (!username) return;
    const { room } = socket.data;

    users.delete(username);
    socket.data.username = null;

    if (room) {
        socket.leave(room);
        const msg = systemMsg(`<span class="name-amber">${username}</span> disconnected`);
        pushHistory(room, msg);
        io.to(room).emit("update", msg.text);
        broadcastUserList(room);
    }

    console.log(`[-] ${username} disconnected`);
}

/* ─────────────────────────────────────────────
    User list helpers
───────────────────────────────────────────── */

function getRoomUsers(room) {
    const socketsInRoom = io.sockets.adapter.rooms.get(room) || new Set();
    const names = [];
    socketsInRoom.forEach(id => {
        const s = io.sockets.sockets.get(id);
        if (s?.data?.username) names.push(s.data.username);
    });
    return names;
}

function broadcastUserList(room) {
    io.to(room).emit("userlist", getRoomUsers(room));
}

/* ─────────────────────────────────────────────
    Start
───────────────────────────────────────────── */

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`ChatOS server running → http://localhost:${PORT}`);
    console.log(`Default rooms: ${DEFAULT_ROOMS.join(", ")}`);
});