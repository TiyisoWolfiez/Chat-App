const express = require("express");
const path    = require("path");
const { saveMessage, getHistory, registerUser, removeUser } = require("./db");

const app    = express();
const server = require("http").createServer(app);
const io     = require("socket.io")(server);

app.use(express.static(path.join(__dirname, "public")));


const users = new Map();

const DEFAULT_ROOMS = ["general", "dev-chat", "random", "design"];

function getTime() {
    return new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
}

function createDmRoom(userA, userB) {
    if (!userA || !userB || userA === userB) return null;
    const [first, second] = [userA, userB].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    return `dm:${first}:${second}`;
}

function parseDmRoom(room) {
    const parts = room.split(':');
    if (parts.length !== 3 || parts[0] !== 'dm') return null;
    const [_, a, b] = parts;
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(a) || !/^[a-zA-Z0-9_]{2,20}$/.test(b)) return null;
    return [a, b];
}

function canJoinRoom(room, username) {
    if (!room) return false;
    const dmParts = parseDmRoom(room);
    if (dmParts) {
        return dmParts.includes(username);
    }
    return DEFAULT_ROOMS.includes(room);
}

function getDmPeer(room, username) {
    const dmParts = parseDmRoom(room);
    if (!dmParts) return null;
    return dmParts[0] === username ? dmParts[1] : dmParts[1] === username ? dmParts[0] : null;
}

function systemMsg(text) {
    return { type: "system", text, timestamp: getTime() };
}

function chatMsg(username, text) {
    return { type: "chat", username, text, timestamp: getTime() };
}


io.on("connection", function (socket) {
    socket.on("newuser", function ({ username, room = "general" }) {
        if (users.has(username)) {
            socket.emit("join_error", "Username already taken. Choose another.");
            return;
        }

        if (!canJoinRoom(room, username)) {
            room = "general";
        }

        users.set(username, socket.id);
        socket.data.username = username;
        socket.data.room     = room;

        socket.join(room);
        registerUser(username);

        socket.emit("history", getHistory(room, 50));

        const msg = systemMsg(`<span class="name-amber">${username}</span> connected`);
        saveMessage({ room, username: 'system', text: msg.text, type: 'system' });
        io.to(room).emit("update", msg.text);

        broadcastUserList(room);
        broadcastGlobalOnline();

        console.log(`[+] ${username} joined ${room}`);
    });

    socket.on("switchroom", function ({ room }) {
        const { username, room: prevRoom } = socket.data;
        if (!username || !room || !canJoinRoom(room, username)) return;

        socket.leave(prevRoom);
        const leaveMsg = systemMsg(`<span class="name-amber">${username}</span> left`);
        saveMessage({ room: prevRoom, username: 'system', text: leaveMsg.text, type: 'system' });
        io.to(prevRoom).emit("update", leaveMsg.text);
        broadcastUserList(prevRoom);

        socket.data.room = room;
        socket.join(room);

        socket.emit("history", getHistory(room, 50));

        const joinMsg = systemMsg(`<span class="name-amber">${username}</span> connected`);
        saveMessage({ room, username: 'system', text: joinMsg.text, type: 'system' });
        io.to(room).emit("update", joinMsg.text);
        broadcastUserList(room);

        console.log(`[~] ${username} switched to ${room}`);
    });

    socket.on("chat", function ({ username, text }) {
        const { room } = socket.data;
        if (!room || !username || !text.trim()) return;

        const msg = chatMsg(username, text.trim());
        socket.to(room).emit("chat", msg);
        io.emit("roomnotify", { room });
        saveMessage({ room, username, text: text.trim(), type: "chat" });
    });

    socket.on("typing", function (username) {
        const { room } = socket.data;
        if (room) socket.to(room).emit("typing", username);
    });

    socket.on("getusers", function () {
        const { room } = socket.data;
        if (!room) return;
        socket.emit("userlist", getRoomUsers(room));
    });

    socket.on("exituser", function (username) {
        handleDisconnect(socket, username);
    });

    socket.on("disconnect", function () {
        handleDisconnect(socket, socket.data.username);
    });
});

function handleDisconnect(socket, username) {
    if (!username) return;
    const { room } = socket.data;

    users.delete(username);
    socket.data.username = null;

    if (room) {
        socket.leave(room);
        const msg = systemMsg(`<span class="name-amber">${username}</span> disconnected`);
        saveMessage({ room, username: 'system', text: msg.text, type: 'system' });
        io.to(room).emit("update", msg.text);
        broadcastUserList(room);
        broadcastGlobalOnline();
    }

    console.log(`[-] ${username} disconnected`);
}

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

function broadcastGlobalOnline() {
    const names = [...users.keys()];
    io.emit("globalonline", names);
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`ChatOS server running → http://localhost:${PORT}`);
    console.log(`Default rooms: ${DEFAULT_ROOMS.join(", ")}`);
});