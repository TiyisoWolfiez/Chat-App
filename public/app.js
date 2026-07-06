import { appendMessage, clearMessages, showTyping, updateReactionBar, formatRoomLabel, formatRoomDescription, applyTheme } from './ui.js';
import { setupSocket } from './socketClient.js';
import { handleCommand } from './commands.js';

const socket = io();
const savedUser = localStorage.getItem('chatos_user');
const savedTheme = localStorage.getItem('chatos_theme') || 'dark';

const state = {
  userName: '',
  currentRoom: 'general',
  incrementUnread: null,
  selectRoom: null,
  showJoinError: null,
  joinOverlay: null,
  joinInput: null,
  promptUser: null,
  headerChannel: null,
  headerDesc: null,
  pathLabel: null,
  msgInput: null,
};

let unreadCounts = {
  general: 0,
  'dev-chat': 0,
  random: 0,
  design: 0
};

const messages = document.getElementById('messages');
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

  socket.emit('chat', { username: state.userName, text: val });
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
      badge.classList.remove('active');
      badge.style.display = 'none';
    }
  });

  messages.addEventListener('click', (event) => {
    const button = event.target.closest('.reaction-btn');
    if (!button) return;

    const messageId = Number(button.dataset.messageId);
    const emoji = button.dataset.emoji;
    if (!messageId || !emoji) return;

    socket.emit('react', { messageId, emoji });
  });
}

Object.assign(state, {
  incrementUnread,
  selectRoom,
  showJoinError,
});

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
});
setupSocket(socket, state);
if (savedUser) { state.joinInput.value = savedUser; doJoin(); }
runBoot();
