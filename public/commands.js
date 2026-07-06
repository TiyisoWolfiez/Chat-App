import { applyTheme, formatRoomLabel } from "./ui.js";

export function handleCommand(cmd, userName, currentRoom, socket) {
    const c = cmd.toLowerCase().trim();

    if (c === '/clear') {
        return { action: 'clear', text: 'Message history cleared.' };
    }

    if (c === '/help') {
        return { action: 'message', text: 'Commands: /help • /users • /clear • /status • /theme [dark|light|dracula]' };
    }

    if (c === '/users') {
        socket.emit('getusers');
        return { action: 'none' };
    }

    if (c === '/status') {
        return { action: 'message', text: `${userName} — status: online | room: ${formatRoomLabel(currentRoom)}` };
    }

    if (c.startsWith('/theme')) {
        const parts = c.split(' ');
        const theme = parts[1];
        if (theme && ['dark', 'light', 'dracula'].includes(theme)) {
            applyTheme(theme);
            return { action: 'message', text: `Theme set to ${theme}.` };
        }
        return { action: 'message', text: 'Usage: /theme dark | light | dracula' };
    }

    return { action: 'message', text: `Unknown command: ${cmd}. Try /help`, error: true };
}
