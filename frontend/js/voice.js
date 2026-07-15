// ========================================
// J.A.R.V.I.S. Voice — Voice-Only Interface
// ========================================

const Voice = {
    recognition: null,
    isListening: false,
    isMuted: false,
    isSpeaking: false,
    mode: 'push-to-talk',   // 'push-to-talk' | 'continuous'
    micBtn: null,
    muteBtn: null,
    modeBtn: null,
    spaceHeld: false,
    audioCtx: null,
    micStream: null,
    transcriptFadeTimer: null,

    init() {
        this.micBtn = document.getElementById('mic-btn');
        this.muteBtn = document.getElementById('mute-btn');
        this.modeBtn = document.getElementById('mode-btn');
        if (!this.micBtn) return;

        // Check for Web Speech API support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.micBtn.title = 'Voice not supported in this browser';
            this.micBtn.style.opacity = '0.3';
            this.micBtn.style.cursor = 'not-allowed';
            console.warn('Web Speech API not supported');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event) => {
            if (!event.results || !event.results[0] || !event.results[0][0]) return;

            let transcript = event.results[0][0].transcript.trim();
            const confidence = event.results[0][0].confidence;

            // In continuous mode, check for wake word
            if (this.mode === 'continuous') {
                const lower = transcript.toLowerCase();
                if (!lower.startsWith('jarvis') && !lower.startsWith('hey jarvis')) {
                    // No wake word — ignore and restart listening
                    this.restartContinuousListening();
                    return;
                }
                // Strip wake word prefix
                transcript = transcript.replace(/^(hey\s+)?jarvis[,\s]*/i, '').trim();
                if (!transcript) {
                    this.restartContinuousListening();
                    return;
                }
            }

            // Play deactivation tone
            this.playTone('deactivate');

            // Show transcript in the display
            this.showTranscript(transcript);

            // Send directly via WebSocket
            if (window.jarvisWs && window.jarvisWs.readyState === WebSocket.OPEN) {
                window.jarvisWs.send(JSON.stringify({ type: 'chat', message: transcript }));
                Dashboard.addLogEntry('Command sent');
            }

            Dashboard.addLogEntry(`Voice input (${Math.round(confidence * 100)}% conf)`);
            Visualizer.setState('processing');
        };

        this.recognition.onend = () => {
            this.setListening(false);
            // In continuous mode, restart listening (unless speaking)
            if (this.mode === 'continuous' && !this.isSpeaking) {
                this.restartContinuousListening();
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.setListening(false);
            if (event.error === 'not-allowed') {
                Dashboard.addLogEntry('Mic access denied');
            }
            if (this.mode === 'continuous' && event.error !== 'not-allowed') {
                setTimeout(() => this.restartContinuousListening(), 500);
            }
        };

        // Mic button — hold to talk (PTT) or toggle (continuous)
        this.micBtn.addEventListener('mousedown', () => {
            if (this.mode === 'push-to-talk') {
                this.startListening();
            }
        });
        this.micBtn.addEventListener('mouseup', () => {
            if (this.mode === 'push-to-talk' && this.isListening) {
                this.stopListening();
            }
        });
        this.micBtn.addEventListener('mouseleave', () => {
            if (this.mode === 'push-to-talk' && this.isListening) {
                this.stopListening();
            }
        });
        this.micBtn.addEventListener('click', () => {
            if (this.mode === 'continuous') {
                this.toggleContinuousMode();
            }
        });

        // Mute button
        if (this.muteBtn) {
            this.muteBtn.addEventListener('click', () => {
                this.isMuted = !this.isMuted;
                this.muteBtn.classList.toggle('muted', this.isMuted);
                this.muteBtn.title = this.isMuted ? 'Unmute voice output' : 'Mute voice output';
                Dashboard.addLogEntry(this.isMuted ? 'Voice output muted' : 'Voice output unmuted');
            });
        }

        // Mode toggle button
        if (this.modeBtn) {
            this.modeBtn.addEventListener('click', () => {
                if (this.mode === 'push-to-talk') {
                    this.mode = 'continuous';
                    this.modeBtn.classList.add('continuous');
                    this.modeBtn.title = 'Switch to push-to-talk';
                    Dashboard.addLogEntry('Continuous listening mode');
                    this.startContinuousListening();
                } else {
                    this.mode = 'push-to-talk';
                    this.modeBtn.classList.remove('continuous');
                    this.modeBtn.title = 'Switch to continuous mode';
                    Dashboard.addLogEntry('Push-to-talk mode');
                    this.stopListening();
                }
                this.updateModeIndicator();
            });
        }

        // Push-to-talk: Hold Space
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.mode === 'push-to-talk' && !this.spaceHeld) {
                // Don't capture if user is typing in an input
                const active = document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

                e.preventDefault();
                this.spaceHeld = true;
                this.startListening();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.spaceHeld) {
                e.preventDefault();
                this.spaceHeld = false;
                if (this.isListening) {
                    this.stopListening();
                }
            }
        });

        this.updateModeIndicator();
    },

    showTranscript(text) {
        const transcriptEl = document.getElementById('transcript-display');
        const textEl = document.getElementById('transcript-text');
        if (!transcriptEl || !textEl) return;

        textEl.textContent = text;
        transcriptEl.classList.add('visible');

        // Clear previous fade timer
        if (this.transcriptFadeTimer) {
            clearTimeout(this.transcriptFadeTimer);
        }

        // Fade after 5 seconds
        this.transcriptFadeTimer = setTimeout(() => {
            transcriptEl.classList.remove('visible');
        }, 5000);
    },

    showResponse(text) {
        const responseEl = document.getElementById('response-display');
        const textEl = document.getElementById('response-text');
        if (!responseEl || !textEl) return;

        textEl.textContent = text;
        responseEl.classList.add('visible');
    },

    async startListening() {
        if (!this.recognition || this.isSpeaking) return;

        try {
            // Get mic stream for visualizer
            if (!this.micStream) {
                this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                Visualizer.connectMicStream(this.micStream);
            }

            this.recognition.start();
            this.setListening(true);
            this.playTone('activate');
            Visualizer.setState('listening');
            Dashboard.addLogEntry('Listening...');
        } catch (e) {
            console.error('Failed to start listening:', e);
        }
    },

    stopListening() {
        if (!this.recognition) return;
        try {
            this.recognition.stop();
        } catch (e) {
            // Already stopped
        }
        this.setListening(false);
    },

    startContinuousListening() {
        if (!this.recognition || this.isSpeaking) return;
        this.startListening();
    },

    restartContinuousListening() {
        if (this.mode !== 'continuous' || this.isSpeaking) return;
        setTimeout(() => {
            if (this.mode === 'continuous' && !this.isSpeaking) {
                this.startListening();
            }
        }, 300);
    },

    toggleContinuousMode() {
        if (this.isListening) {
            this.stopListening();
            Visualizer.setState('idle');
        } else {
            this.startContinuousListening();
        }
    },

    setListening(active) {
        this.isListening = active;
        if (this.micBtn) {
            this.micBtn.classList.toggle('active', active);
        }
        if (!active && this.mode === 'push-to-talk') {
            Visualizer.setState('idle');
        }
    },

    updateModeIndicator() {
        const indicator = document.getElementById('mode-indicator');
        if (indicator) {
            indicator.textContent = this.mode === 'push-to-talk' ? 'PTT' : 'CONT';
        }
    },

    // --- TTS Playback ---

    playTTS(ttsData) {
        if (!ttsData || this.isMuted) {
            // Even when muted, show the response text
            return;
        }

        if (ttsData.use_browser_tts) {
            this.browserTTS(ttsData.text);
        } else if (ttsData.audio) {
            this.playAudioBase64(ttsData.audio, ttsData.text);
        }
    },

    playAudioBase64(base64Audio, fallbackText) {
        this.setSpeaking(true);

        try {
            const audioData = atob(base64Audio);
            const arrayBuffer = new ArrayBuffer(audioData.length);
            const view = new Uint8Array(arrayBuffer);
            for (let i = 0; i < audioData.length; i++) {
                view[i] = audioData.charCodeAt(i);
            }

            const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);

            audio.onended = () => {
                URL.revokeObjectURL(url);
                this.setSpeaking(false);
            };
            audio.onerror = () => {
                URL.revokeObjectURL(url);
                if (fallbackText) this.browserTTS(fallbackText);
                else this.setSpeaking(false);
            };

            audio.play().catch(() => {
                URL.revokeObjectURL(url);
                if (fallbackText) this.browserTTS(fallbackText);
                else this.setSpeaking(false);
            });
        } catch (e) {
            console.error('Failed to play audio:', e);
            if (fallbackText) this.browserTTS(fallbackText);
            else this.setSpeaking(false);
        }
    },

    browserTTS(text) {
        if (!window.speechSynthesis || !text) {
            this.setSpeaking(false);
            return;
        }

        this.setSpeaking(true);
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 0.9;

        const voices = window.speechSynthesis.getVoices();
        const britishVoice = voices.find(v =>
            v.lang.includes('en-GB') || v.name.includes('British')
        );
        const englishVoice = voices.find(v => v.lang.startsWith('en'));

        if (britishVoice) utterance.voice = britishVoice;
        else if (englishVoice) utterance.voice = englishVoice;

        utterance.onend = () => this.setSpeaking(false);
        utterance.onerror = () => this.setSpeaking(false);

        window.speechSynthesis.speak(utterance);
    },

    setSpeaking(active) {
        this.isSpeaking = active;
        if (active) {
            Visualizer.setState('speaking');
            // Pause STT while speaking to prevent feedback
            if (this.isListening) {
                try { this.recognition.stop(); } catch (e) {}
            }
        } else {
            Visualizer.setState('idle');
            // Resume continuous listening after speaking
            if (this.mode === 'continuous') {
                this.restartContinuousListening();
            }
        }
    },

    // --- Audio Chimes ---

    playTone(type) {
        try {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = this.audioCtx;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'activate') {
                osc.frequency.setValueAtTime(600, ctx.currentTime);
                osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.08, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.15);
            } else {
                osc.frequency.setValueAtTime(900, ctx.currentTime);
                osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.06, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.12);
            }
        } catch (e) {
            // Audio context not available
        }
    }
};

// sendQuickCommand — sends via WebSocket directly (no Chat dependency)
function sendQuickCommand(text) {
    if (window.jarvisWs && window.jarvisWs.readyState === WebSocket.OPEN) {
        window.jarvisWs.send(JSON.stringify({ type: 'chat', message: text }));
        Dashboard.addLogEntry('Quick action: ' + text);
    }
}

// Voices load asynchronously
if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {};
}
