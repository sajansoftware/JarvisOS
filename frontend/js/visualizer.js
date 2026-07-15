// ========================================
// J.A.R.V.I.S. Voice Visualizer
// ========================================

const Visualizer = {
    canvas: null,
    ctx: null,
    state: 'idle',          // idle | listening | processing | speaking
    analyser: null,          // Web Audio API analyser for mic input
    audioCtx: null,
    animationId: null,
    dataArray: null,
    labelEl: null,
    time: 0,
    micStream: null,

    init() {
        this.canvas = document.getElementById('visualizer-canvas');
        this.labelEl = document.getElementById('visualizer-label');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.animate();
    },

    resizeCanvas() {
        if (!this.canvas) return;
        const container = this.canvas.parentElement;
        if (container) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
        }
    },

    setState(state) {
        this.state = state;
        if (this.labelEl) {
            const labels = {
                idle: 'IDLE',
                listening: 'LISTENING...',
                processing: 'PROCESSING...',
                speaking: 'SPEAKING...'
            };
            this.labelEl.textContent = labels[state] || 'IDLE';
            this.labelEl.className = 'visualizer-label ' + state;
        }

        // Notify backend of state change
        if (window.jarvisWs && window.jarvisWs.readyState === WebSocket.OPEN) {
            window.jarvisWs.send(JSON.stringify({
                type: 'voice_state',
                state: state
            }));
        }
    },

    connectMicStream(stream) {
        try {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            this.micStream = stream;
            const source = this.audioCtx.createMediaStreamSource(stream);
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            source.connect(this.analyser);
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        } catch (e) {
            console.error('Failed to connect mic stream:', e);
        }
    },

    disconnectMicStream() {
        this.analyser = null;
        this.dataArray = null;
    },

    animate() {
        this.time += 0.016; // ~60fps
        if (!this.ctx || !this.canvas) {
            this.animationId = requestAnimationFrame(() => this.animate());
            return;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        switch (this.state) {
            case 'idle':
                this.drawIdle();
                break;
            case 'listening':
                this.drawListening();
                break;
            case 'processing':
                this.drawProcessing();
                break;
            case 'speaking':
                this.drawSpeaking();
                break;
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    },

    drawIdle() {
        const { ctx, canvas } = this;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const baseRadius = Math.min(cx, cy) * 0.35;

        // Breathing animation — subtle scale pulse
        const breathe = 1 + Math.sin(this.time * 1.5) * 0.05;
        const radius = baseRadius * breathe;

        // Outer ring
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 15, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Main ring
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner glow
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, 'rgba(0, 212, 255, 0.08)');
        gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 212, 255, ${0.4 + Math.sin(this.time * 1.5) * 0.2})`;
        ctx.fill();
    },

    drawListening() {
        const { ctx, canvas } = this;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const baseRadius = Math.min(cx, cy) * 0.35;

        // Get mic volume data
        let volume = 0;
        if (this.analyser && this.dataArray) {
            this.analyser.getByteFrequencyData(this.dataArray);
            let sum = 0;
            for (let i = 0; i < this.dataArray.length; i++) {
                sum += this.dataArray[i];
            }
            volume = sum / this.dataArray.length / 255;
        }

        const numBars = 64;
        const barWidth = 3;

        for (let i = 0; i < numBars; i++) {
            const angle = (i / numBars) * Math.PI * 2 - Math.PI / 2;

            // Get frequency-specific data if available
            let barHeight;
            if (this.dataArray && this.dataArray.length > 0) {
                const idx = Math.floor((i / numBars) * this.dataArray.length);
                barHeight = (this.dataArray[idx] / 255) * 40 + 5;
            } else {
                barHeight = 5 + Math.sin(this.time * 4 + i * 0.3) * 10;
            }

            const innerR = baseRadius;
            const outerR = baseRadius + barHeight;

            const x1 = cx + Math.cos(angle) * innerR;
            const y1 = cy + Math.sin(angle) * innerR;
            const x2 = cx + Math.cos(angle) * outerR;
            const y2 = cy + Math.sin(angle) * outerR;

            const intensity = barHeight / 45;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.3 + intensity * 0.7})`;
            ctx.lineWidth = barWidth;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Pulsing inner ring
        const pulse = 1 + volume * 0.1;
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Red recording dot
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        const dotAlpha = 0.6 + Math.sin(this.time * 4) * 0.4;
        ctx.fillStyle = `rgba(255, 60, 60, ${dotAlpha})`;
        ctx.shadowColor = 'rgba(255, 60, 60, 0.5)';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
    },

    drawProcessing() {
        const { ctx, canvas } = this;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const baseRadius = Math.min(cx, cy) * 0.35;

        // Spinning arcs
        const numArcs = 3;
        for (let i = 0; i < numArcs; i++) {
            const speed = 2 + i * 0.5;
            const offset = (i * Math.PI * 2) / numArcs;
            const startAngle = this.time * speed + offset;
            const arcLength = Math.PI * 0.6;
            const radius = baseRadius - i * 8 + 8;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, startAngle + arcLength);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.7 - i * 0.15})`;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Pulsing center
        const pulse = 0.5 + Math.sin(this.time * 3) * 0.3;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 15);
        gradient.addColorStop(0, `rgba(0, 212, 255, ${pulse})`);
        gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');
        ctx.beginPath();
        ctx.arc(cx, cy, 15, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Outer ring
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius + 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
    },

    drawSpeaking() {
        const { ctx, canvas } = this;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const baseRadius = Math.min(cx, cy) * 0.35;

        // Simulated waveform — multiple sine waves
        const numPoints = 100;
        const waveRadius = baseRadius;

        ctx.beginPath();
        for (let i = 0; i <= numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;

            // Layered sine waves for organic feel
            const wave1 = Math.sin(this.time * 6 + angle * 4) * 12;
            const wave2 = Math.sin(this.time * 4 + angle * 7) * 8;
            const wave3 = Math.sin(this.time * 8 + angle * 3) * 5;
            const displacement = wave1 + wave2 + wave3;

            const r = waveRadius + displacement;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner glow
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, waveRadius * 0.8);
        gradient.addColorStop(0, 'rgba(0, 212, 255, 0.12)');
        gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');
        ctx.beginPath();
        ctx.arc(cx, cy, waveRadius * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Center dot — steady cyan
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 212, 255, 0.8)';
        ctx.shadowColor = '#00d4ff';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
};
