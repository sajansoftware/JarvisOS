// ========================================
// J.A.R.V.I.S. Dashboard — Gauges & Clock
// ========================================

const Dashboard = {
    gauges: {},

    init() {
        this.initGauge('cpu-gauge', 'cpu-value');
        this.initGauge('ram-gauge', 'ram-value');
        this.initGauge('disk-gauge', 'disk-value');
        this.startClock();
        this.fetchSystemInfo();
    },

    initGauge(canvasId, valueId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        this.gauges[canvasId] = { canvas, ctx, valueEl: document.getElementById(valueId), current: 0, target: 0 };
        this.drawGauge(canvasId, 0);
    },

    drawGauge(id, percent) {
        const gauge = this.gauges[id];
        if (!gauge) return;

        const { canvas, ctx } = gauge;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const radius = 60;
        const lineWidth = 8;
        const startAngle = Math.PI * 0.75;
        const endAngle = Math.PI * 2.25;
        const totalArc = endAngle - startAngle;
        const valueAngle = startAngle + (totalArc * (percent / 100));

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background arc
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = '#0d2a4a';
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Tick marks
        for (let i = 0; i <= 10; i++) {
            const angle = startAngle + (totalArc * (i / 10));
            const innerR = radius - 15;
            const outerR = radius - 10;
            const x1 = cx + Math.cos(angle) * innerR;
            const y1 = cy + Math.sin(angle) * innerR;
            const x2 = cx + Math.cos(angle) * outerR;
            const y2 = cy + Math.sin(angle) * outerR;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = '#1a3a5a';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Value arc with gradient
        if (percent > 0) {
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            if (percent < 60) {
                gradient.addColorStop(0, '#00d4ff');
                gradient.addColorStop(1, '#0088ff');
            } else if (percent < 85) {
                gradient.addColorStop(0, '#00d4ff');
                gradient.addColorStop(1, '#ffaa00');
            } else {
                gradient.addColorStop(0, '#ffaa00');
                gradient.addColorStop(1, '#ff3a3a');
            }

            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, valueAngle);
            ctx.strokeStyle = gradient;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Glow effect
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, valueAngle);
            ctx.strokeStyle = percent < 60 ? 'rgba(0, 212, 255, 0.3)' : percent < 85 ? 'rgba(255, 170, 0, 0.3)' : 'rgba(255, 58, 58, 0.3)';
            ctx.lineWidth = lineWidth + 6;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#00d4ff';
        ctx.shadowColor = '#00d4ff';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Update value text
        if (gauge.valueEl) {
            gauge.valueEl.textContent = Math.round(percent) + '%';
        }
    },

    animateGauge(id, targetPercent) {
        const gauge = this.gauges[id];
        if (!gauge) return;

        gauge.target = targetPercent;
        const animate = () => {
            const diff = gauge.target - gauge.current;
            if (Math.abs(diff) < 0.5) {
                gauge.current = gauge.target;
                this.drawGauge(id, gauge.current);
                return;
            }
            gauge.current += diff * 0.15;
            this.drawGauge(id, gauge.current);
            requestAnimationFrame(animate);
        };
        animate();
    },

    updateStats(data) {
        if (!data) return;

        this.animateGauge('cpu-gauge', data.cpu_percent || 0);
        this.animateGauge('ram-gauge', data.ram_percent || 0);
        this.animateGauge('disk-gauge', data.disk_percent || 0);

        // Update RAM detail in system info
        const ramInfo = document.getElementById('info-ram');
        if (ramInfo && data.ram_used_gb !== undefined) {
            ramInfo.textContent = `${data.ram_used_gb} / ${data.ram_total_gb} GB`;
        }

        // Battery
        if (data.battery_percent !== undefined) {
            const fill = document.getElementById('battery-fill');
            const text = document.getElementById('battery-text');
            if (fill) {
                fill.style.width = data.battery_percent + '%';
                if (data.battery_percent < 20) {
                    fill.style.background = 'linear-gradient(90deg, #ff3a3a, #ff6600)';
                } else {
                    fill.style.background = 'linear-gradient(90deg, #00d4ff, #00ff88)';
                }
            }
            if (text) {
                let label = Math.round(data.battery_percent) + '%';
                if (data.battery_plugged) label += ' (plugged in)';
                if (data.battery_time_left) label += ' (' + data.battery_time_left + ')';
                text.textContent = label;
            }
        }
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
            this.updateStats(data);
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
