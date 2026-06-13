/**
 * pitch.js — Detección de pitch en tiempo real
 * Algoritmo YIN + MPM via AudioWorklet
 * Kabert Studio – LMKE
 */

import { freqToMidi, midiToPitchInfo, midiToNoteName } from './midi.js';

const WORKLET_CODE = `
class PitchCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(2048);
    this._pos = 0;
    this._fc  = 0;
  }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) this._buf[this._pos++ % 2048] = ch[i];
    if (++this._fc % 4 === 0) {
      const copy = new Float32Array(2048);
      for (let i = 0; i < 2048; i++) copy[i] = this._buf[(this._pos - 2048 + i + 2048) % 2048];
      this.port.postMessage(copy.buffer, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('pitch-capture', PitchCapture);
`;

export class PitchDetector {
  constructor(config = {}) {
    this.sensitivity = config.sensitivity ?? 0.05;
    this.sampleRate  = 44100;
    this.context     = null;
    this.stream      = null;
    this.worklet     = null;
    this.source      = null;
    this.active      = false;
    this.result = { freq:0, midi:null, noteName:'—', cents:0, rms:0, confident:false };
    this._listeners = [];
  }

  async start() {
    if (this.active) return;
    this.stream  = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false }
    });
    this.context = new AudioContext({ sampleRate: this.sampleRate });
    await this.context.resume();
    const blob = new Blob([WORKLET_CODE], { type:'application/javascript' });
    const url  = URL.createObjectURL(blob);
    await this.context.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    this.source  = this.context.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.context, 'pitch-capture');
    this.source.connect(this.worklet);
    this.worklet.port.onmessage = (e) => this._onBuffer(new Float32Array(e.data));
    this.active = true;
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    try { this.worklet?.disconnect(); this.source?.disconnect(); this.stream?.getTracks().forEach(t=>t.stop()); this.context?.close(); } catch {}
    this.context = this.stream = this.worklet = this.source = null;
    this._listeners = [];
  }

  onResult(cb) { this._listeners.push(cb); }

  _onBuffer(buf) {
    const rms = this._rms(buf);
    if (rms < this.sensitivity) {
      this.result = { freq:0, midi:null, noteName:'—', cents:0, rms, confident:false };
      this._emit(); return;
    }
    const freq = this._yin(buf) || this._mpm(buf);
    if (!freq || freq < 60 || freq > 2100) {
      this.result = { freq:0, midi:null, noteName:'—', cents:0, rms, confident:false };
      this._emit(); return;
    }
    const mf = freqToMidi(freq);
    const { midi, cents } = midiToPitchInfo(mf);
    this.result = { freq, midi, noteName: midiToNoteName(midi), cents, rms, confident:true };
    this._emit();
  }

  _emit() { this._listeners.forEach(cb => cb(this.result)); }

  _rms(buf) {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i]*buf[i];
    return Math.sqrt(s / buf.length);
  }

  _yin(buf) {
    const N = buf.length, half = N >> 1;
    const d = new Float32Array(half);
    const c = new Float32Array(half);
    const threshold = 0.10;
    for (let tau = 1; tau < half; tau++)
      for (let j = 0; j < half; j++) { const df = buf[j]-buf[j+tau]; d[tau]+=df*df; }
    c[0]=1; let rs=0;
    for (let tau=1; tau<half; tau++) { rs+=d[tau]; c[tau]=rs===0?0:d[tau]*tau/rs; }
    let tau=2;
    while (tau<half) { if (c[tau]<threshold) { while(tau+1<half&&c[tau+1]<c[tau])tau++; break; } tau++; }
    if (tau===half||c[tau]>=threshold) return 0;
    const x0=tau>1?tau-1:tau, x2=tau+1<half?tau+1:tau;
    let bt;
    if (x0===tau) bt=c[tau]<=c[x2]?tau:x2;
    else if (x2===tau) bt=c[tau]<=c[x0]?tau:x0;
    else { const s0=c[x0],s1=c[tau],s2=c[x2]; bt=tau+(s2-s0)/(2*(2*s1-s2-s0)); }
    return bt>0?this.sampleRate/bt:0;
  }

  _mpm(buf) {
    const N = buf.length;
    const nsdf = new Float32Array(N);
    for (let tau=0; tau<N; tau++) {
      let acf=0,m=0;
      for (let i=0; i<N-tau; i++) { acf+=buf[i]*buf[i+tau]; m+=buf[i]*buf[i]+buf[i+tau]*buf[i+tau]; }
      nsdf[tau]=m>0?2*acf/m:0;
    }
    const peaks=[];
    for (let i=1; i<N-1; i++) if (nsdf[i]>nsdf[i-1]&&nsdf[i]>=nsdf[i+1]&&nsdf[i]>0.5) peaks.push(i);
    if (!peaks.length) return 0;
    const tau=peaks[0];
    if (tau<1||tau>=N-1) return 0;
    const ref=tau+(nsdf[tau+1]-nsdf[tau-1])/(2*(2*nsdf[tau]-nsdf[tau-1]-nsdf[tau+1]));
    return ref>0?this.sampleRate/ref:0;
  }
}
