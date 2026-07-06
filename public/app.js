import { appendMessage, clearMessages, showTyping, updateReactionBar, formatRoomLabel, formatRoomDescription, applyTheme, sanitize, renderMessageText } from './ui.js';
import { setupSocket } from './socketClient.js';
import { handleCommand } from './commands.js';

const socket = io();
const savedUser = localStorage.getItem('chatos_user');
const savedTheme = localStorage.getItem('chatos_theme') || 'dark';

const state = {
    userName: '',
    currentRoom: 'general',
    pendingReplyTo: null,
    activeThread: null,
    incrementUnread: null,
    selectRoom: null,
    showJoinError: null,
    showMention: null,
    renderThread: null,
    renderSearchResults: null,
    updateThreadCount: null,
    joinOverlay: null,
    joinInput: null,
    promptUser: null,
    headerChannel: null,
    headerDesc: null,
    pathLabel: null,
    msgInput: null,
    searchInput: null,
    searchBtn: null,
    mentionBanner: null,
    threadContext: null,
};

let unreadCounts = {
    general: 0,
    'dev-chat': 0,
    random: 0,
    design: 0
};

const messages = document.getElementById('messages');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const mentionBanner = document.getElementById('mention-banner');
const threadContext = document.getElementById('thread-context');
const typingBar = document.getElementById('typing-bar');
const typingText = document.getElementById('typing-text');
const promptUser = document.getElementById('prompt-user');
const joinOverlay = document.getElementById('join-overlay');
const joinInput = document.getElementById('join-input');
const joinError = document.getElementById('join-error');
const headerChannel = document.querySelector('.header-channel');
const headerDesc = document.querySelector('.header-desc');
const pathLabel = document.querySelector('.path');
const msgInput = document.getElementById('msg-input');

Object.assign(state, {
    joinOverlay,
    joinInput,
    promptUser,
    headerChannel,
    headerDesc,
    pathLabel,
    msgInput,
    searchInput,
    searchBtn,
    mentionBanner,
    threadContext,
});

function incrementUnread(room) {
    if (room === state.currentRoom && !document.hidden) return;
    unreadCounts[room] = (unreadCounts[room] || 0) + 1;
    updateRoomBadge(room);
}

function clearUnread(room) {
    unreadCounts[room] = 0;
    updateRoomBadge(room);
}

function updateRoomBadge(room) {
    const channel = document.querySelector(`.channel-item[data-room="${room}"]`);
    if (!channel) return;

    let badge = channel.querySelector('.unread-dot');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'unread-dot';
        channel.appendChild(badge);
    }

    if (unreadCounts[room] > 0) {
        badge.classList.add('active');
        badge.textContent = unreadCounts[room];
    } else {
        badge.classList.remove('active');
        badge.textContent = '';
    }
}

function getTime() {
    return new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

function showJoinError(msg) {
    if (joinError) {
        joinError.textContent = msg;
        joinError.style.display = 'block';
    }
}

function doJoin() {
    const val = state.joinInput.value.trim();
    if (!val) return;
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(val)) {
        showJoinError('2–20 chars, letters/numbers/underscores only.');
        return;
    }
    state.userName = val;
    localStorage.setItem('chatos_user', val);
    socket.emit('newuser', { username: val, room: state.currentRoom });
}

function selectRoom(room, item = null) {
    if (!room || room === state.currentRoom || !state.userName) return;
    document.querySelectorAll('.channel-item').forEach(c => c.classList.remove('active'));
    if (item) item.classList.add('active');

    state.currentRoom = room;
    state.headerChannel.textContent = formatRoomLabel(room, state.userName);
    state.headerDesc.textContent = formatRoomDescription(room, state.userName);
    state.pathLabel.textContent = `~/${formatRoomLabel(room, state.userName)}`;

    clearUnread(room);
    clearMessages();
    state.clearThreadContext?.();
    state.searchInput.value = '';
    socket.emit('switchroom', { room });
}

function sendMsg() {
    const val = state.msgInput.value.trim();
    if (!val || !state.userName) return;

    if (val.startsWith('/')) {
        const result = handleCommand(val, state.userName, state.currentRoom, socket);
        state.msgInput.value = '';
        if (result.action === 'clear') {
            clearMessages();
            appendMessage('system', result.text);
        } else if (result.action === 'message') {
            appendMessage('system', result.text);
        }
        return;
    }

    if (state.pendingReplyTo) {
        socket.emit('reply', { parentId: state.pendingReplyTo, text: val });
        state.pendingReplyTo = null;
        state.msgInput.placeholder = 'type a message...';
    } else {
        socket.emit('chat', { username: state.userName, text: val });
    }

    state.msgInput.value = '';
}

function setupUI() {
    document.getElementById('join-btn').addEventListener('click', doJoin);
    joinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
    document.getElementById('send-btn').addEventListener('click', sendMsg);
    msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });

    let typingEmitTimeout;
    msgInput.addEventListener('input', () => {
        if (!state.userName) return;
        clearTimeout(typingEmitTimeout);
        typingEmitTimeout = setTimeout(() => {
        socket.emit('typing', state.userName);
        }, 300);
    });

    document.querySelectorAll('.channel-item[data-room]').forEach(item => {
        item.addEventListener('click', () => {
        const room = item.dataset.room;
        selectRoom(room, item);
        });
    });

    document.querySelectorAll('.cmd-chip').forEach(chip => {
        chip.addEventListener('click', () => { msgInput.value = chip.textContent; msgInput.focus(); });
    });

    searchBtn.addEventListener('click', () => {
        const term = state.searchInput.value.trim();
        if (!term) return;
        socket.emit('search', { term });
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const term = state.searchInput.value.trim();
            if (!term) return;
            socket.emit('search', { term });
        }
    });

    messages.addEventListener('click', (event) => {
        const button = event.target.closest('.reaction-btn');
        if (button) {
            const messageId = Number(button.dataset.messageId);
            const emoji = button.dataset.emoji;
            if (messageId && emoji) {
                socket.emit('react', { messageId, emoji });
            }
            return;
        }

        const replyBtn = event.target.closest('.reply-button');
        if (replyBtn) {
            const parentId = Number(replyBtn.dataset.parentId);
            if (parentId) {
                state.pendingReplyTo = parentId;
                state.msgInput.placeholder = `replying to #${parentId}...`;
                state.msgInput.focus();
            }
            return;
        }

        const threadBtn = event.target.closest('.thread-toggle');
        if (threadBtn) {
            const parentId = Number(threadBtn.dataset.parentId);
            if (parentId) {
                socket.emit('getReplies', { parentId });
            }
            return;
        }

        const row = event.target.closest('.msg-row');
        if (row && !event.target.closest('.reaction-btn') && !event.target.closest('.reply-button') && !event.target.closest('.thread-toggle')) {
            document.querySelectorAll('.msg-row.touch-active').forEach((other) => other.classList.remove('touch-active'));
            row.classList.add('touch-active');
        }
    });

    state.threadContext.addEventListener('click', (event) => {
        const closeThreadBtn = event.target.closest('.thread-close');
        if (closeThreadBtn) {
            state.clearThreadContext?.();
        }
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.msg-row')) {
            document.querySelectorAll('.msg-row.touch-active').forEach((row) => row.classList.remove('touch-active'));
        }
    });

    document.getElementById('exit-btn').addEventListener('click', () => {
        if (!state.userName) return;
        socket.emit('exituser', state.userName);
        state.userName = '';
        state.promptUser.textContent = 'guest';
        state.joinInput.value = '';
        if (joinError) joinError.style.display = 'none';
        state.joinOverlay.style.display = 'flex';
        state.joinOverlay.style.opacity = '1';
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            const badge = document.querySelector('.dot-badge');
            if (badge) {
                badge.classList.remove('active');
                badge.style.display = 'none';
            }
            state.clearThreadContext?.();
        }
    });
    state.mentionBanner.hidden = false;
    state.mentionBanner.classList.add('visible');
    setTimeout(() => {
        state.mentionBanner.classList.remove('visible');
        state.mentionBanner.hidden = true;
    }, 5500);
}

function renderThreadPanel(parent, replies) {
    if (!parent) {
        state.threadContext.classList.add('hidden');
        state.threadContext.innerHTML = '';
        state.activeThread = null;
        return;
    }

    state.activeThread = parent.id;
    const header = `
        <div class="thread-panel-header">
            <div>
                <span class="thread-title">Thread for #${parent.id}</span>
                <span class="thread-owner">@${parent.username}</span>
            </div>
            <button type="button" class="thread-close">close</button>
        </div>`;

    const parentMessage = `
        <div class="thread-parent">
            <div class="thread-name">@${sanitize(parent.username)}</div>
            <div class="thread-text">${renderMessageText(parent.text)}</div>
        </div>`;

    const replyList = replies.length ? replies.map((reply) => `
            <div class="thread-reply">
                <div class="thread-name">@${sanitize(reply.username)}</div>
                <div class="thread-text">${renderMessageText(reply.text)}</div>
            </div>
        `).join('') : '<div class="thread-empty">No replies yet. Hit reply on a message to start one.</div>';

    state.threadContext.innerHTML = `${header}${parentMessage}<div class="thread-replies">${replyList}</div>`;
    state.threadContext.classList.remove('hidden');
}

function clearThreadContext() {
    state.activeThread = null;
    state.threadContext.classList.add('hidden');
    state.threadContext.innerHTML = '';
}

function showMention(payload) {
    if (!payload) return;
    state.mentionBanner.textContent = `Mentioned by @${payload.from}: ${payload.text}`;
    state.mentionBanner.hidden = false;
    state.mentionBanner.classList.add('visible');
    setTimeout(() => {
        state.mentionBanner.classList.remove('visible');
        state.mentionBanner.hidden = true;
    }, 5500);
}

function renderSearchResults(term, results) {
    if (typeof term === 'string' && term.trim() === '') {
        return;
    }

    clearMessages();
    appendMessage('system', `search results for "${term}" (${results?.length ?? 0})`);
    if (!results || !results.length) return;
    results.reverse().forEach((m) => appendMessage('msg', m, m.timestamp || m.created_at));
}

function runBoot() {
    const bootLines = ['bl0','bl1','bl2','bl3','bl4','bl5'];
    const logo = document.getElementById('boot-logo');
    const bootScreen = document.getElementById('boot-screen');
    const appMain = document.getElementById('app-main');

    setTimeout(() => logo.classList.add('visible'), 100);
    bootLines.forEach((id, i) => {
        setTimeout(() => document.getElementById(id).classList.add('visible'), 400 + i * 280);
    });

    setTimeout(() => {
        bootScreen.style.opacity = '0';
        bootScreen.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            bootScreen.style.display = 'none';
            appMain.style.display = 'flex';
            setTimeout(() => appMain.classList.add('visible'), 20);
        }, 500);
    }, 400 + bootLines.length * 280 + 600);
}

applyTheme(savedTheme);
setupUI();
Object.assign(state, {
    incrementUnread,
    selectRoom,
    showJoinError,
    showMention,
    renderThread: renderThreadPanel,
    renderSearchResults,
    updateThreadCount: function (parentId, replyCount) {
        const btn = document.querySelector(`.thread-toggle[data-parent-id="${parentId}"]`);
        if (btn) btn.textContent = `${replyCount || 0} repl${replyCount === 1 ? 'y' : 'ies'}`;
    },
    clearThreadContext,
});
setupSocket(socket, state);
if (savedUser) { state.joinInput.value = savedUser; doJoin(); }
runBoot();
