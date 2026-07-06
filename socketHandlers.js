const { saveMessage, getHistory, registerUser, removeUser, getMessageById, toggleReaction } = require("./db");

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

function systemMsg(text) {
    return { type: "system", text, timestamp: getTime() };
}

function getRoomUsers(io, room) {
    const socketsInRoom = io.sockets.adapter.rooms.get(room) || new Set();
    const names = [];
    socketsInRoom.forEach(id => {
        const s = io.sockets.sockets.get(id);
        if (s?.data?.username) names.push(s.data.username);
    });
    return names;
}

function broadcastUserList(io, room) {
    io.to(room).emit("userlist", getRoomUsers(io, room));
}

function broadcastGlobalOnline(io) {
    const names = [...users.keys()];
    io.emit("globalonline", names);
}

function handleDisconnect(io, socket, username) {
    if (!username) return;
    const { room } = socket.data;

    users.delete(username);
    socket.data.username = null;

    if (room) {
        socket.leave(room);
        const msg = systemMsg(`<span class="name-amber">${username}</span> disconnected`);
        saveMessage({ room, username: 'system', text: msg.text, type: 'system' });
        io.to(room).emit("update", msg.text);
        broadcastUserList(io, room);
        broadcastGlobalOnline(io);
    }
}

function initSocketHandlers(io) {
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

            socket.emit("history", getHistory(room, username, 50));

            const msg = systemMsg(`<span class="name-amber">${username}</span> connected`);
            saveMessage({ room, username: 'system', text: msg.text, type: 'system' });
            io.to(room).emit("update", msg.text);

            broadcastUserList(io, room);
            broadcastGlobalOnline(io);

            console.log(`[+] ${username} joined ${room}`);
        });

        socket.on("switchroom", function ({ room }) {
            const { username, room: prevRoom } = socket.data;
            if (!username || !room || !canJoinRoom(room, username)) return;

            socket.leave(prevRoom);
            const leaveMsg = systemMsg(`<span class="name-amber">${username}</span> left`);
            saveMessage({ room: prevRoom, username: 'system', text: leaveMsg.text, type: 'system' });
            io.to(prevRoom).emit("update", leaveMsg.text);
            broadcastUserList(io, prevRoom);

            socket.data.room = room;
            socket.join(room);

            socket.emit("history", getHistory(room, username, 50));

            const joinMsg = systemMsg(`<span class="name-amber">${username}</span> connected`);
            saveMessage({ room, username: 'system', text: joinMsg.text, type: 'system' });
            io.to(room).emit("update", joinMsg.text);
            broadcastUserList(io, room);

            console.log(`[~] ${username} switched to ${room}`);
        });

        socket.on("chat", function ({ username, text }) {
            const { room } = socket.data;
            if (!room || !username || !text.trim()) return;

            const savedMessage = saveMessage({ room, username, text: text.trim(), type: "chat" });
            io.to(room).emit("chat", savedMessage);
            io.emit("roomnotify", { room });
        });

        socket.on("react", function ({ messageId, emoji }) {
            const { room, username } = socket.data;
            const allowed = new Set(['+1', '<3', ':D', '*']);
            if (!room || !username || !messageId || !allowed.has(emoji)) return;

            const message = getMessageById(messageId);
            if (!message || message.room !== room) return;

            const reactions = toggleReaction(messageId, username, emoji);
            io.to(room).emit("reaction_update", {
                messageId,
                reactions,
            });
        });

        socket.on("typing", function (typingUsername) {
            const { room } = socket.data;
            if (room) socket.to(room).emit("typing", typingUsername);
        });

        socket.on("getusers", function () {
            const { room } = socket.data;
            if (!room) return;
            socket.emit("userlist", getRoomUsers(io, room));
        });

        socket.on("exituser", function (username) {
            handleDisconnect(io, socket, username);
        });

        socket.on("disconnect", function () {
            handleDisconnect(io, socket, socket.data.username);
        });
    });
}

module.exports = {
    initSocketHandlers,
    createDmRoom,
};
