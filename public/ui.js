const messages = document.getElementById('messages');
const nameColors = ['name-amber', 'name-green', 'name-blue', 'name-red'];
const REACTION_EMOJIS = ['+1', '<3', ':D', '*'];
const THEMES = ['dark', 'light', 'dracula'];

function pickColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xFFFF;
    return nameColors[h % nameColors.length];
}

export function sanitize(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

export function renderMessageText(text) {
    let html = sanitize(text);
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="code-block">$1</pre>');
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    return html;
}

export function formatRoomLabel(room, username) {
    if (!room) return '#general';
    const parts = room.split(':');
    if (parts.length === 3 && parts[0] === 'dm') {
        const peer = parts[1] === username ? parts[2] : parts[1];
        return `@${peer}`;
    }
    return `# ${room}`;
}

export function formatRoomDescription(room, username) {
    if (!room) return 'main chat — be excellent to each other';
    const parts = room.split(':');
    if (parts.length === 3 && parts[0] === 'dm') {
        const peer = parts[1] === username ? parts[2] : parts[1];
        return `private conversation with ${peer}`;
    }
    const desc = {
        general: 'main chat — be excellent to each other',
        'dev-chat': 'code, tools, and tech talk',
        random: 'anything goes',
        design: 'ui, ux, and aesthetics'
    };
    return desc[room] || 'private room';
}

export function applyTheme(theme) {
    if (!THEMES.includes(theme)) return;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('chatos_theme', theme);
}

export function getDmRoom(a, b) {
    const [first, second] = [a, b].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' }));
    return `dm:${first}:${second}`;
}

export function renderReactionBar(message) {
    const bar = document.createElement('div');
    bar.className = 'reaction-bar';

    REACTION_EMOJIS.forEach((emoji) => {
        const existing = message.reactions?.find((item) => item.emoji === emoji);
        const count = existing?.count || 0;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'reaction-btn' + (existing?.mine ? ' active' : '');
        btn.dataset.messageId = message.id;
        btn.dataset.emoji = emoji;
        btn.innerHTML = `${emoji}${count ? `<span class="reaction-count">${count}</span>` : ''}`;
        bar.appendChild(btn);
    });

    return bar;
}

export function updateReactionBar(messageId, reactions) {
    const row = messages.querySelector(`.msg-row[data-message-id="${messageId}"]`);
    if (!row) return;

    const body = row.querySelector('.msg-body');
    const existingBar = row.querySelector('.reaction-bar');
    if (existingBar) existingBar.remove();

    const message = { id: messageId, reactions };
    const reactionBar = renderReactionBar(message);
    if (body) body.appendChild(reactionBar);
}

export function appendMessage(type, data, timestamp) {
    const row = document.createElement('div');
    const ts = timestamp || new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    if (type === 'system') {
        row.className = 'msg-row system-row';
        row.innerHTML = `
            <div class="system-msg">
                <span class="sys-bracket">[</span>
                <span class="sys-time">${ts}</span>
                <span class="sys-bracket">]</span>
                <span class="sys-label">SYSTEM</span>
                <span style="color:var(--muted)">&gt;</span>
                <span class="sys-text">${data}</span>
            </div>`;
    } else {
        const colorClass = pickColor(data.username);
        row.className = 'msg-row';
        row.dataset.messageId = data.id;
        row.innerHTML = `
            <span class="msg-ts">${ts}</span>
            <div class="msg-body">
                <div class="msg-name ${colorClass}">${sanitize(data.username)}</div>
                <div class="msg-text">${renderMessageText(data.text)}</div>
            </div>`;

        const reactionBar = renderReactionBar(data);
        row.appendChild(reactionBar);
    }

    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
}

export function clearMessages() {
    messages.innerHTML = '';
}

let typingTimeout;
export function showTyping(name) {
    const typingBar = document.getElementById('typing-bar');
    const typingText = document.getElementById('typing-text');
    typingText.textContent = name + ' is typing';
    typingBar.classList.add('visible');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => typingBar.classList.remove('visible'), 2500);
}
