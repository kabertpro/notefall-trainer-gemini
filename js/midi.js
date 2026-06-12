class MidiManager {
    constructor() {
        this.currentMidi = null;
        this.notes = [];
        this.duration = 0;
    }

    async loadFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const midiData = new Midi(e.target.result);
                    this.currentMidi = midiData;
                    this.processNotes();
                    resolve(midiData);
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    processNotes() {
        this.notes = [];
        if (!this.currentMidi || this.currentMidi.tracks.length === 0) return;

        // Extraer notas de la pista principal (asumiendo la primera pista con notas)
        const track = this.currentMidi.tracks.find(t => t.notes.length > 0);
        if (track) {
            this.notes = track.notes.map(n => ({
                midi: n.midi,
                time: n.time,
                duration: n.duration,
                hit: false, // Para el sistema de evaluación
                missed: false
            }));
            this.duration = this.currentMidi.duration;
        }
    }
}
const midiEngine = new MidiManager();