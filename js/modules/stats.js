/**
 * stats.js — Estadísticas locales (localStorage) + config persistente
 * Kabert Studio – LMKE
 */

const KEY = 'notefall_stats';
const DEF = { totalSessions:0, totalPracticeMs:0, bestScore:0, bestAccuracy:0, bestCombo:0, sessions:[] };

export class StatsManager {
  constructor() { this._d = this._load(); }
  _load() { try { const r=localStorage.getItem(KEY); return r?{...DEF,...JSON.parse(r)}:{...DEF}; } catch { return {...DEF}; } }
  _save() { try { localStorage.setItem(KEY,JSON.stringify(this._d)); } catch {} }

  recordSession(songName, data) {
    const d = this._d;
    d.totalSessions++;
    d.totalPracticeMs += (data.time??0)*1000;
    if (data.score    > d.bestScore)    d.bestScore    = data.score;
    if (data.accuracy > d.bestAccuracy) d.bestAccuracy = data.accuracy;
    if (data.maxCombo > d.bestCombo)    d.bestCombo    = data.maxCombo;
    d.sessions.unshift({ songName, date:new Date().toLocaleString('es',{dateStyle:'short',timeStyle:'short'}), ...data });
    if (d.sessions.length > 20) d.sessions.length = 20;
    this._save();
  }
  getAll() { return this._d; }
  formatTime(ms) {
    const s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60);
    if (h>0) return `${h}h ${m%60}m`;
    if (m>0) return `${m}m ${s%60}s`;
    return `${s}s`;
  }
}

const CFG_KEY = 'notefall_config';
const DEF_CFG = { sensitivity:0.05, toleranceCents:30, speed:1, previewVolume:0.4, holdTime:0.8, theme:'neon', effects:true, pianoSound:true };

export class ConfigStore {
  constructor() { this._c = this._load(); this._applyTheme(); }
  _load() { try { const r=localStorage.getItem(CFG_KEY); return r?{...DEF_CFG,...JSON.parse(r)}:{...DEF_CFG}; } catch { return {...DEF_CFG}; } }
  save(u) { this._c={...this._c,...u}; try{localStorage.setItem(CFG_KEY,JSON.stringify(this._c));}catch{} this._applyTheme(); }
  get(k)   { return this._c[k]; }
  getAll() { return {...this._c}; }
  _applyTheme() { document.body.dataset.theme = this._c.theme ?? 'neon'; }
}
