/**
 * midi.js — MIDI file loading, parsing y conversiones musicales
 * Kabert Studio – LMKE
 */

export class MidiEngine {
  constructor() {
    this.midi = null;
    this.notes = [];
    this.bpm = 120;
    this.durationSeconds = 0;
    this.name = 'Sin título';
    this.trackColors = [
      '#7c4dff','#00e5ff','#ff4081','#69ff47',
      '#ffea00','#ff6d00','#e040fb','#00bcd4'
    ];
  }

  async loadFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const MidiClass = window.Midi;
          if (!MidiClass) throw new Error('Librería MIDI no cargada');
          this.midi = new MidiClass(e.target.result);
          this._buildNoteList();
          resolve(this._getSummary());
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('Error leyendo archivo'));
      reader.readAsArrayBuffer(file);
    });
  }

  _buildNoteList() {
    this.notes = [];
    if (!this.midi) return;
    this.bpm = Math.round(this.midi.header.tempos[0]?.bpm || 120);
    this.durationSeconds = this.midi.duration;
    this.name = this.midi.name || 'Sin título';
    this.midi.tracks.forEach((track, trackIdx) => {
      const color = this.trackColors[trackIdx % this.trackColors.length];
      track.notes.forEach(n => {
        this.notes.push({
          midi: n.midi, name: n.name, octave: n.octave,
          time: n.time, duration: n.duration, velocity: n.velocity,
          trackIdx, color, hit: null,
        });
      });
    });
    this.notes.sort((a, b) => a.time - b.time);
  }

  _getSummary() {
    if (!this.midi) return {};
    const tracks = this.midi.tracks.filter(t => t.notes.length > 0);
    return {
      name: this.name, bpm: this.bpm,
      duration: this.durationSeconds.toFixed(1),
      tracks: tracks.length, totalNotes: this.notes.length,
      timeSignature: this.midi.header.timeSignatures[0]
        ? `${this.midi.header.timeSignatures[0].timeSignature[0]}/${this.midi.header.timeSignatures[0].timeSignature[1]}`
        : '4/4',
    };
  }

  getActiveNoteAt(time) {
    return this.notes.find(n =>
      time >= n.time && time < n.time + Math.max(n.duration, 0.15)
    ) || null;
  }
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
export function freqToMidi(freq) {
  if (freq <= 0) return null;
  return 69 + 12 * Math.log2(freq / 440);
}
export function midiToPitchInfo(midiFloat) {
  const nearest = Math.round(midiFloat);
  return { midi: nearest, cents: (midiFloat - nearest) * 100 };
}
export function midiToNoteName(midi) {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
