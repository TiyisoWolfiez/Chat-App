import { appendMessage, clearMessages, showTyping, updateReactionBar, sanitize } from "./ui.js";
import { getDmRoom, formatRoomLabel, formatRoomDescription } from "./ui.js";

export function setupSocket(socket, state) {
    socket.on('history', function (msgs) {
        clearMessages();
        state.userName = state.joinInput.value.trim() || state.userName;
        state.promptUser.textContent = state.userName;
        state.headerChannel.textContent = formatRoomLabel(state.currentRoom, state.userName);
        state.headerDesc.textContent = formatRoomDescription(state.currentRoom, state.userName);
        state.pathLabel.textContent = `~/${formatRoomLabel(state.currentRoom, state.userName)}`;

        state.joinOverlay.style.opacity = '0';
        state.joinOverlay.style.transition = 'opacity 0.3s';
        setTimeout(() => state.joinOverlay.style.display = 'none', 300);

        msgs.forEach((m) => {
            if (m.type === 'system') appendMessage('system', m.text, m.timestamp || m.created_at);
            else appendMessage('msg', m, m.timestamp || m.created_at);
        });

        state.msgInput.focus();
    });

    socket.on('join_error', function (msg) {
        state.showJoinError(msg);
    });

    socket.on('chat', function (message) {
        appendMessage('msg', message, message.timestamp || message.created_at);
    });

    socket.on('reaction_update', function ({ messageId, reactions }) {
        updateReactionBar(messageId, reactions);
    });

    socket.on('roomnotify', function ({ room }) {
        if (!room || room === state.currentRoom) return;
        state.incrementUnread(room);
    });

    socket.on('update', function (text) {
        appendMessage('system', text);
    });

    socket.on('typing', function (name) {
        if (name !== state.userName) showTyping(name);
    });

    socket.on('userlist', function (names) {
        const panel = document.querySelector('.online-section');
        if (!panel) return;
        panel.innerHTML = `<div class="online-header">Online — ${names.length}</div>`;
        names.forEach((n) => {
            const el = document.createElement('div');
            el.className = 'user-pill';
            el.dataset.dm = n;
            el.innerHTML = `<span class="status-dot online"></span> ${sanitize(n)}`;
            el.addEventListener('click', () => {
                if (!state.userName || n === state.userName) return;
                state.selectRoom(getDmRoom(state.userName, n));
            });
            panel.appendChild(el);
        });
    });

    socket.on('globalonline', function(names){
        const dmList = document.getElementById('dm-list');
        if (!dmList) return;

        const others = names.filter(n => n && n !== state.userName);
        dmList.innerHTML = others.map(n => `
            <div class="channel-item dm-item" data-dm="${n}" data-room="${getDmRoom(state.userName, n)}">
                <span class="dm-arrow">▶</span> ${sanitize(n)}
            </div>
        `).join('');

        dmList.querySelectorAll('.dm-item').forEach(item => {
            item.addEventListener('click', () => {
                const peer = item.dataset.dm;
                if (!peer) return;
                const room = getDmRoom(state.userName, peer);
                state.selectRoom(room, item);
            });
        });
    });
}
