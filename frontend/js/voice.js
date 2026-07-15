// ========================================
// J.A.R.V.I.S. Voice — STT & TTS
// ========================================

const Voice = {
    recognition: null,
    isListening: false,
    micBtn: null,
    lastText: '', // Track last text for fallback TTS

    init() {
        this.micBtn = document.getElementById('mic-btn');
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

            const transcript = event.results[0][0].transcript;
            const confidence = event.results[0][0].confidence;

            const input = document.getElementById('chat-input');
            if (!input) return;
            input.value = transcript;
            Chat.sendMessage();

            Dashboard.addLogEntry(`Voice input (${Math.round(confidence * 100)}% conf)`);
        };

        this.recognition.onend = () => {
            this.setListening(false);
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.setListening(false);
            if (event.error === 'not-allowed') {
                Dashboard.addLogEntry('Mic access denied');
            }
        };

        this.micBtn.addEventListener('click', () => {
            this.toggleListening();
        });
    },

    toggleListening() {
        if (!this.recognition) return;

        if (this.isListening) {
            this.recognition.stop();
            this.setListening(false);
        } else {
            try {
                this.recognition.start();
                this.setListening(true);
                Dashboard.addLogEntry('Listening...');
            } catch (e) {
                console.error('Failed to start recognition:', e);
            }
        }
    },

    setListening(active) {
        this.isListening = active;
        if (this.micBtn) {
            this.micBtn.classList.toggle('active', active);
        }
    },

    playTTS(ttsData) {
        if (!ttsData) return;

        // Store text for fallback
        this.lastText = ttsData.text || '';

        if (ttsData.use_browser_tts) {
            this.browserTTS(ttsData.text);
        } else if (ttsData.audio) {
            this.playAudioBase64(ttsData.audio, ttsData.text);
        }
    },

    playAudioBase64(base64Audio, fallbackText) {
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

            audio.onended = () => URL.revokeObjectURL(url);
            audio.onerror = () => {
                URL.revokeObjectURL(url);
                // Fall back to browser TTS with the original text
                if (fallbackText) this.browserTTS(fallbackText);
            };

            audio.play().catch(() => {
                URL.revokeObjectURL(url);
                if (fallbackText) this.browserTTS(fallbackText);
            });
        } catch (e) {
            console.error('Failed to play audio:', e);
            if (fallbackText) this.browserTTS(fallbackText);
        }
    },

    browserTTS(text) {
        if (!window.speechSynthesis || !text) return;

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 0.9;

        // Try to find a British English voice
        const voices = window.speechSynthesis.getVoices();
        const britishVoice = voices.find(v =>
            v.lang.includes('en-GB') || v.name.includes('British')
        );
        const englishVoice = voices.find(v => v.lang.startsWith('en'));

        if (britishVoice) {
            utterance.voice = britishVoice;
        } else if (englishVoice) {
            utterance.voice = englishVoice;
        }

        utterance.onerror = (e) => {
            console.warn('Browser TTS error:', e.error);
        };

        window.speechSynthesis.speak(utterance);
    }
};

// Voices load asynchronously in some browsers
if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        // Voices are now available
    };
}
