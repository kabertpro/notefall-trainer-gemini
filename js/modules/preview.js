/**
 * preview.js — Preescucha de melodía MIDI con Web Audio API
 * Kabert Studio – LMKE
 */

import { midiToFreq } from './midi.js';

export class MelodyPreview {
  constructor() {
    this._ctx     = null;
    this._playing = false;
    this._timers  = [];
    this.volume   = 0.4;
  }

  async play(notes, speed = 1, onProgress = null, onEnd = null) {
    this.stop();
    if (!notes.length) return;
    this._ctx     = new AudioContext();
    this._playing = true;
    await this._ctx.resume();

    const master = this._ctx.createGain();
    master.gain.value = this.volume;
    master.connect(this._ctx.destination);

    const totalDuration = notes.reduce((m, n) => Math.max(m, n.time + n.duration), 0) / speed;

    for (const note of notes) {
      const t0  = this._ctx.currentTime + note.time / speed;
      const dur = Math.max(note.duration / speed, 0.06);
      const freq = midiToFreq(note.midi);

      const osc  = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.75, t0 + 0.015);
      gain.gain.linearRampToValueAtTime(0.55, t0 + Math.min(0.08, dur * 0.3));
      gain.gain.setValueAtTime(0.55, t0 + dur - 0.03);
      gain.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.04);
    }

    if (onProgress) {
      const iv = setInterval(() => {
        if (!this._playing || !this._ctx) { clearInterval(iv); return; }
        onProgress(this._ctx.currentTime, totalDuration);
        if (this._ctx.currentTime >= totalDuration + 0.3) clearInterval(iv);
      }, 80);
      this._timers.push(iv);
    }

    const et = setTimeout(() => { this._playing = false; onEnd?.(); }, (totalDuration + 0.4) * 1000);
    this._timers.push(et);
  }

  async playNote(midiNote, dur = 0.45) {
    if (!this._ctx) this._ctx = new AudioContext();
    if (this._ctx.state === 'suspended') await this._ctx.resume();
    const freq = midiToFreq(midiNote);
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t0 = this._ctx.currentTime;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(this.volume * 0.9, t0 + 0.012);
    gain.gain.setValueAtTime(this.volume * 0.9, t0 + dur - 0.04);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.04);
  }

  stop() {
    this._playing = false;
    this._timers.forEach(t => { clearInterval(t); clearTimeout(t); });
    this._timers = [];
    try { this._ctx?.close(); } catch {}
    this._ctx = null;
  }

  get isPlaying() { return this._playing; }
}
