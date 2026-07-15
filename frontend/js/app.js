// ========================================
// J.A.R.V.I.S. App — Main Entry Point
// ========================================

(function () {
    let ws = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 10;
    const BASE_DELAY = 1000;
    const MAX_DELAY = 15000;

    function connect() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}/ws`;

        ws = new WebSocket(wsUrl);
        window.jarvisWs = ws;

        ws.onopen = () => {
            reconnectAttempts = 0;
            setConnectionStatus(true);
            Dashboard.addLogEntry('System online');
            console.log('[JARVIS] WebSocket connected');

            // Request system info once connected
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'command',
                        action: 'get_system_info',
                        params: {}
                    }));
                }
            }, 500);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleMessage(data);
            } catch (e) {
                console.error('[JARVIS] Failed to parse message:', e);
            }
        };

        ws.onclose = () => {
            setConnectionStatus(false);
            Dashboard.addLogEntry('Connection lost');
            console.log('[JARVIS] WebSocket disconnected');

            if (reconnectAttempts < MAX_RECONNECT) {
                const delay = Math.min(BASE_DELAY * Math.pow(2, reconnectAttempts), MAX_DELAY);
                reconnectAttempts++;
                console.log(`[JARVIS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT})`);
                setTimeout(connect, delay);
            } else {
                Dashboard.addLogEntry('Max reconnect attempts reached');
            }
        };

        ws.onerror = (error) => {
            console.error('[JARVIS] WebSocket error:', error);
        };
    }

    function handleMessage(data) {
        switch (data.type) {
            case 'chat':
                Chat.setTyping(false);
                Chat.addMessage(data.role || 'assistant', data.content);
                Dashboard.addLogEntry('Response received');
                break;

            case 'typing':
                Chat.setTyping(data.active);
                if (data.active) {
                    Visualizer.setState('processing');
                }
                break;

            case 'stats':
                Dashboard.updateStats(data.data);
                break;

            case 'tts':
                Voice.playTTS(data);
                break;

            case 'command_result':
                Dashboard.addLogEntry(`${data.action}: done`);
                break;

            case 'system_info':
                Dashboard.updateSystemInfo(data.data);
                break;

            default:
                console.log('[JARVIS] Unknown message type:', data.type);
        }
    }

    function setConnectionStatus(online) {
        const statusEl = document.getElementById('connection-status');
        const dotEl = document.querySelector('.status-dot');

        if (statusEl) statusEl.textContent = online ? 'ONLINE' : 'OFFLINE';
        if (dotEl) {
            dotEl.classList.toggle('online', online);
        }
    }

    // Initialize everything
    function init() {
        Dashboard.init();
        Visualizer.init();
        Chat.init();
        Voice.init();
        connect();
        console.log('[JARVIS] All systems initialized');
    }

    // Boot up
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
