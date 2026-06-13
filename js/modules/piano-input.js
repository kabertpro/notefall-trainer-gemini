/**
 * piano-input.js — Teclado MIDI + teclado físico PC
 * Web MIDI API + mapeo de teclas
 * Kabert Studio – LMKE
 *
 * Mapeo teclado PC:
 *   Fila Q (blancas C4..E5): Q W E R T Y U I O P
 *   Fila números (sostenidos):  2 3   5 6 7   9 0
 *   Fila A  (blancas C3..D4): A S D F G H J K L
 *   Fila Z  (sostenidos bajo): Z X   V B   N M
 */

import { midiToFreq } from './midi.js';

const KEYBOARD_MAP = {
  // Upper octave (C4=60)
  'q':60,'w':62,'e':64,'r':65,'t':67,'y':69,'u':71,'i':72,'o':74,'p':76,
  // Black keys upper
  '2':61,'3':63,'5':66,'6':68,'7':70,'9':73,'0':75,
  // Lower octave (C3=48)
  'a':48,'s':50,'d':52,'f':53,'g':55,'h':57,'j':59,'k':60,'l':62,
  // Black keys lower
  'z':49,'x':51,'v':54,'b':56,'n':61,'m':63,
};

export class PianoInput {
  constructor() {
    this._held        = new Map();  // midi → { source, velocity }
    this._listeners   = [];
    this._midiAccess  = null;
    this._boundDown   = this._onKeyDown.bind(this);
    this._boundUp     = this._onKeyUp.bind(this);
    this.midiDevices  = [];
  }

  async start() {
    window.addEventListener('keydown', this._boundDown);
    window.addEventListener('keyup',   this._boundUp);
    if (navigator.requestMIDIAccess) {
      try {
        this._midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        this._connectMIDI();
        this._midiAccess.onstatechange = () => this._connectMIDI();
      } catch (e) {
        console.warn('[PianoInput] MIDI no disponible:', e.message);
      }
    }
  }

  stop() {
    window.removeEventListener('keydown', this._boundDown);
    window.removeEventListener('keyup',   this._boundUp);
    if (this._midiAccess)
      for (const inp of this._midiAccess.inputs.values()) inp.onmidimessage = null;
    this._held.clear();
    this._listeners = [];
  }

  onNote(cb) { this._listeners.push(cb); }
  getHeld()  { return new Set(this._held.keys()); }

  get midiConnected() { return this._midiAccess && this._midiAccess.inputs.size > 0; }
  getMIDIDevices() {
    if (!this._midiAccess) return [];
    return Array.from(this._midiAccess.inputs.values()).map(i => i.name);
  }

  _onKeyDown(e) {
    if (e.repeat) return;
    if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
    const midi = KEYBOARD_MAP[e.key.toLowerCase()];
    if (midi === undefined || this._held.has(midi)) return;
    e.preventDefault();
    this._held.set(midi, { source:'keyboard', velocity:80 });
    this._emit(midi, 80, true);
  }

  _onKeyUp(e) {
    const midi = KEYBOARD_MAP[e.key.toLowerCase()];
    if (midi === undefined || !this._held.has(midi)) return;
    e.preventDefault();
    this._held.delete(midi);
    this._emit(midi, 0, false);
  }

  _connectMIDI() {
    if (!this._midiAccess) return;
    this.midiDevices = this.getMIDIDevices();
    for (const inp of this._midiAccess.inputs.values())
      inp.onmidimessage = (msg) => this._onMIDI(msg);
  }

  _onMIDI(msg) {
    const [status, note, velocity] = msg.data;
    const cmd = status & 0xf0;
    if (cmd === 0x90 && velocity > 0) {
      this._held.set(note, { source:'midi', velocity });
      this._emit(note, velocity, true);
    } else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) {
      this._held.delete(note);
      this._emit(note, 0, false);
    }
  }

  _emit(midi, velocity, isOn) {
    this._listeners.forEach(cb => cb(midi, velocity, isOn));
  }
}
