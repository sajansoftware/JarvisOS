// ========================================
// J.A.R.V.I.S. Chat — Message Handling
// ========================================

const Chat = {
    messagesEl: null,
    inputEl: null,

    init() {
        this.messagesEl = document.getElementById('chat-messages');
        this.inputEl = document.getElementById('chat-input');
        if (!this.messagesEl || !this.inputEl) return;

        // Send on Enter
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Send button
        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                this.sendMessage();
            });
        }
    },

    sendMessage() {
        if (!this.inputEl) return;
        const text = this.inputEl.value.trim();
        if (!text) return;

        this.addMessage('user', text);
        this.inputEl.value = '';

        // Send via WebSocket
        if (window.jarvisWs && window.jarvisWs.readyState === WebSocket.OPEN) {
            window.jarvisWs.send(JSON.stringify({ type: 'chat', message: text }));
            Dashboard.addLogEntry('Command sent');
        } else {
            this.addMessage('assistant', 'Connection lost. Attempting to reconnect...');
        }
    },

    addMessage(role, content) {
        if (!this.messagesEl) return;

        const msg = document.createElement('div');
        msg.className = `chat-message ${role}`;

        // Sanitize HTML entities first to prevent XSS, then apply markdown
        let safe = this.escapeHtml(content);
        let html = this.formatContent(safe);
        msg.innerHTML = html;

        this.messagesEl.appendChild(msg);
        this.scrollToBottom();
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    formatContent(text) {
        // Code blocks (already escaped, so safe)
        text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        // Inline code
        text = text.replace(/`([^`]+)`/g, '<code style="background:rgba(0,212,255,0.1);padding:2px 6px;border-radius:3px;font-family:var(--font-mono);font-size:13px;">$1</code>');
        // Bold
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Italic
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // Line breaks
        text = text.replace(/\n/g, '<br>');
        return text;
    },

    setTyping(active) {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.classList.toggle('active', active);
        }
    },

    scrollToBottom() {
        if (!this.messagesEl) return;
        requestAnimationFrame(() => {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        });
    }
};

// Global helper for quick action buttons
function sendQuickCommand(text) {
    const input = document.getElementById('chat-input');
    if (!input) return;
    input.value = text;
    Chat.sendMessage();
}
