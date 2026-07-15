// ========================================
// J.A.R.V.I.S. Dashboard — Clock & System Info
// ========================================

const Dashboard = {

    init() {
        this.startClock();
        this.fetchSystemInfo();
    },

    startClock() {
        const update = () => {
            const now = new Date();
            const clockEl = document.getElementById('clock');
            const dateEl = document.getElementById('date-display');

            if (clockEl) {
                clockEl.textContent = now.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                });
            }
            if (dateEl) {
                dateEl.textContent = now.toLocaleDateString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                });
            }
        };
        update();
        setInterval(update, 1000);
    },

    async fetchSystemInfo() {
        try {
            const res = await fetch('/api/system/stats');
            if (!res.ok) return;
            const data = await res.json();
            // Update RAM detail in system info
            const ramInfo = document.getElementById('info-ram');
            if (ramInfo && data.ram_used_gb !== undefined) {
                ramInfo.textContent = `${data.ram_used_gb} / ${data.ram_total_gb} GB`;
            }
        } catch (e) {
            // Will get data via WebSocket instead
        }
    },

    updateSystemInfo(info) {
        if (!info) return;

        const map = {
            'info-os': info.os,
            'info-host': info.hostname,
            'info-user': info.username,
            'info-uptime': info.uptime,
            'info-ip': info.ip_address,
        };
        for (const [id, value] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (el && value) el.textContent = value;
        }
    },

    addLogEntry(text) {
        const log = document.getElementById('activity-log');
        if (!log) return;

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        entry.innerHTML = `<span class="log-time">${time}</span>${this.escapeLog(text)}`;
        log.insertBefore(entry, log.firstChild);

        // Keep max 20 entries
        while (log.children.length > 20) {
            log.removeChild(log.lastChild);
        }
    },

    escapeLog(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
