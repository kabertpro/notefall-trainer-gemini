class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.pitchDetector = null;
        this.isListening = false;
        this.currentPitch = 0;
        this.currentClarity = 0;
    }

    async initMicrophone() {
        if (this.audioContext) return;
        
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);
            
            // Usando McLeod Pitch Method (MPM) vía Pitchy
            this.pitchDetector = pitchy.PitchDetector.forFloat32Array(this.analyser.fftSize);
            this.isListening = true;
            this.detectLoop();
        } catch (err) {
            console.error("Acceso al micrófono denegado o no disponible.", err);
            alert("Se requiere acceso al micrófono para el entrenamiento.");
        }
    }

    detectLoop() {
        if (!this.isListening) return;

        const buffer = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(buffer);

        const [pitch, clarity] = this.pitchDetector.findPitch(buffer, this.audioContext.sampleRate);
        
        // Tolerancia de claridad para evitar ruido ambiental (0.8 es buen estándar)
        if (clarity > 0.8) {
            this.currentPitch = pitch;
        } else {
            this.currentPitch = 0; // Silencio o ruido
        }

        requestAnimationFrame(() => this.detectLoop());
    }

    getMidiFromFreq(freq) {
        if (freq === 0) return 0;
        return 12 * Math.log2(freq / 440) + 69;
    }

    getCentsDeviation(freq) {
        if (freq === 0) return 0;
        const midiExact = this.getMidiFromFreq(freq);
        const midiRounded = Math.round(midiExact);
        return Math.round((midiExact - midiRounded) * 100);
    }
    
    getNoteName(midiNumber) {
        const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        return notes[midiNumber % 12] + Math.floor(midiNumber / 12 - 1);
    }
}
const audio = new AudioEngine();