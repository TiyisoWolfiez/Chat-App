(function () {
    const socket = io();
    const nameColors = ['name-amber', 'name-green', 'name-blue', 'name-red'];
    let userName = '';
    let currentRoom = 'general';

    /* ── DOM refs ── */
    const messages    = document.getElementById('messages');
    const msgInput    = document.getElementById('msg-input');
    const typingBar   = document.getElementById('typing-bar');
    const typingText  = document.getElementById('typing-text');
    const promptUser  = document.getElementById('prompt-user');
    const joinOverlay = document.getElementById('join-overlay');
    const joinInput   = document.getElementById('join-input');
    const joinError   = document.getElementById('join-error');

    /* ── Helpers ── */
    function getTime() {
        return new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }

    function pickColor(name) {
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xFFFF;
        return nameColors[h % nameColors.length];
    }

    function sanitize(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    /* ── Render ── */
    function appendMessage(type, data, timestamp) {
        const row = document.createElement('div');
        const ts  = timestamp || getTime();

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
        row.innerHTML = `
            <span class="msg-ts">${ts}</span>
            <div class="msg-body">
            <div class="msg-name ${colorClass}">${sanitize(data.username)}</div>
            <div class="msg-text">${sanitize(data.text)}</div>
            </div>`;
        }

        messages.appendChild(row);
        messages.scrollTop = messages.scrollHeight;
    }

    function clearMessages() {
        messages.innerHTML = '';
    }

    /* ── Typing indicator ── */
    let typingTimeout;
    function showTyping(name) {
        typingText.textContent = name + ' is typing';
        typingBar.classList.add('visible');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => typingBar.classList.remove('visible'), 2500);
    }

    /* ── Boot sequence ── */
    function runBoot() {
        const bootLines  = ['bl0','bl1','bl2','bl3','bl4','bl5'];
        const logo       = document.getElementById('boot-logo');
        const bootScreen = document.getElementById('boot-screen');
        const appMain    = document.getElementById('app-main');

        setTimeout(() => logo.classList.add('visible'), 100);
        bootLines.forEach((id, i) => {
        setTimeout(() => document.getElementById(id).classList.add('visible'), 400 + i * 280);
        });
        setTimeout(() => {
        bootScreen.style.opacity    = '0';
        bootScreen.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            bootScreen.style.display = 'none';
            appMain.style.display    = 'flex';
            setTimeout(() => appMain.classList.add('visible'), 20);
        }, 500);
        }, 400 + bootLines.length * 280 + 600);
    }

    /* ── Join ── */
    document.getElementById('join-btn').addEventListener('click', doJoin);
    joinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

    function doJoin() {
        const val = joinInput.value.trim();
        if (!val) return;
        // Username format: alphanum + underscores only
        if (!/^[a-zA-Z0-9_]{2,20}$/.test(val)) {
        showJoinError('2–20 chars, letters/numbers/underscores only.');
        return;
        }
        socket.emit('newuser', { username: val, room: currentRoom });
    }

    function showJoinError(msg) {
        if (joinError) { joinError.textContent = msg; joinError.style.display = 'block'; }
    }

    /* ── Channel switching ── */
    document.querySelectorAll('.channel-item[data-room]').forEach(item => {
        item.addEventListener('click', () => {
        const room = item.dataset.room;
        if (room === currentRoom || !userName) return;

        document.querySelectorAll('.channel-item').forEach(c => c.classList.remove('active'));
        item.classList.add('active');

        currentRoom = room;
        document.querySelector('.header-channel').textContent = `# ${room}`;
        promptUser.parentElement.querySelector('.path').textContent = `~/#${room}`;

        clearMessages();
        socket.emit('switchroom', { room });
        });
    });

    /* ── Send message ── */
    document.getElementById('send-btn').addEventListener('click', sendMsg);
    msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });

    function sendMsg() {
        const val = msgInput.value.trim();
        if (!val || !userName) return;
        if (val.startsWith('/')) { handleCommand(val); msgInput.value = ''; return; }

        // Optimistic render (own message)
        appendMessage('msg', { username: userName, text: val });
        socket.emit('chat', { username: userName, text: val });
        msgInput.value = '';
    }

    /* ── Typing emit (debounced) ── */
    let typingEmitTimeout;
    msgInput.addEventListener('input', () => {
        if (!userName) return;
        clearTimeout(typingEmitTimeout);
        typingEmitTimeout = setTimeout(() => {
        socket.emit('typing', userName);
        }, 300);
    });

    /* ── Slash commands ── */
    function handleCommand(cmd) {
        const c = cmd.toLowerCase().trim();
        if (c === '/clear') {
        clearMessages();
        appendMessage('system', 'Message history cleared.');
        } else if (c === '/help') {
        appendMessage('system', 'Commands: /help &nbsp;/users &nbsp;/clear &nbsp;/status');
        } else if (c === '/users') {
        socket.emit('getusers');
        } else if (c === '/status') {
        appendMessage('system', `${sanitize(userName)} — status: <span class="sys-green">online</span> | room: #${currentRoom} | ${getTime()}`);
        } else {
        appendMessage('system', `Unknown command: <span style="color:var(--red)">${sanitize(cmd)}</span>. Try /help`);
        }
    }

    /* ── Command chips ── */
    document.querySelectorAll('.cmd-chip').forEach(chip => {
        chip.addEventListener('click', () => { msgInput.value = chip.textContent; msgInput.focus(); });
    });

    /* ── Exit ── */
    document.getElementById('exit-btn').addEventListener('click', () => {
        if (!userName) return;
        socket.emit('exituser', userName);
        userName = '';
        promptUser.textContent = 'guest';
        joinInput.value = '';
        if (joinError) joinError.style.display = 'none';
        joinOverlay.style.display = 'flex';
        joinOverlay.style.opacity = '1';
    });

    /* ── Socket events ── */

    // Join approved — server sends back history
    socket.on('history', function (msgs) {
        clearMessages();
        userName = joinInput.value.trim() || userName;
        promptUser.textContent = userName;

        // Hide join overlay
        joinOverlay.style.opacity    = '0';
        joinOverlay.style.transition = 'opacity 0.3s';
        setTimeout(() => joinOverlay.style.display = 'none', 300);

        // Replay history
        msgs.forEach(m => {
        if (m.type === 'system') appendMessage('system', m.text, m.timestamp);
        else appendMessage('msg', m, m.timestamp);
        });

        msgInput.focus();
    });

    // Username taken or other join error
    socket.on('join_error', function (msg) {
        showJoinError(msg);
    });

    // Incoming chat from another user
    socket.on('chat', function (message) {
        appendMessage('msg', message, message.timestamp);
    });

    // System announcements (join/leave/etc)
    socket.on('update', function (text) {
        appendMessage('system', text);
    });

    // Typing indicator
    socket.on('typing', function (name) {
        if (name !== userName) showTyping(name);
    });

    // User list (response to /users or room events)
    socket.on('userlist', function (names) {
        const panel = document.querySelector('.online-section');
        if (!panel) return;
        panel.innerHTML = `<div class="online-header">Online — ${names.length}</div>`;
        names.forEach(n => {
        const el = document.createElement('div');
        el.className = 'user-pill';
        el.innerHTML = `<span class="status-dot online"></span> ${sanitize(n)}`;
        panel.appendChild(el);
        });
    });

    /* ── Init ── */
    runBoot();
})();