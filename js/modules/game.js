/**
 * game.js — Motor de juego: puntuación, temporización, modo entrenamiento
 * Kabert Studio – LMKE
 */

export const GRADE = Object.freeze({ PERFECT:'perfect', GREAT:'great', GOOD:'good', MISS:'miss' });
const POINTS = { perfect:300, great:200, good:100, miss:0 };

export class GameEngine {
  constructor(config = {}) {
    this.toleranceCents   = config.toleranceCents  ?? 30;
    this.perfectThreshold = 15;
    this.greatThreshold   = 30;
    this.mode             = config.mode ?? 'normal'; // 'normal' | 'training'
    this.trainingHoldTime = config.trainingHoldTime ?? 0.8; // segundos afinados para pasar
    this._reset();
  }

  _reset() {
    this.score       = 0;
    this.combo       = 0;
    this.maxCombo    = 0;
    this.perfect     = 0;
    this.great       = 0;
    this.good        = 0;
    this.miss        = 0;
    this.totalNotes  = 0;
    this.startTime   = null;
    this.elapsed     = 0;
    this.running     = false;
    this.finished    = false;
    this._pauseAt    = null;
    this._notes      = [];
    this._gradedIds  = new Set();

    // Training mode state
    this.trainingIndex   = 0;   // current note index in training
    this._tuneStart      = null; // timestamp when user started holding correct pitch
    this.trainingProgress= 0;   // 0..1 fill for the ring indicator
    this._currentTrainingNote = null;
  }

  init(notes, durationSecs) {
    this._reset();
    this._notes      = notes;
    this.totalNotes  = notes.length;
    this.durationSecs = durationSecs;
  }

  start() {
    this.startTime = performance.now() / 1000;
    this.running   = true;
    if (this.mode === 'training' && this._notes.length > 0) {
      this._currentTrainingNote = this._notes[0];
    }
  }

  pause() {
    if (!this.running) return this.elapsed;
    this.running  = false;
    this._pauseAt = performance.now() / 1000;
    return this.elapsed;
  }

  resume() {
    if (this.running) return;
    const now = performance.now() / 1000;
    this.startTime += now - (this._pauseAt ?? now);
    this.running = true;
  }

  getTime() {
    if (!this.running) return this.elapsed;
    this.elapsed = performance.now() / 1000 - this.startTime;
    return this.elapsed;
  }

  // ── Evaluate mic/pitch input ──────────────────────────────────────────────

  evaluate(pitchResult) {
    if (!this.running) return null;
    if (this.mode === 'training') return this._evaluateTraining(pitchResult);
    return this._evaluateNormal(pitchResult);
  }

  _evaluateNormal(pitchResult) {
    const now      = this.getTime();
    const expected = this._getActiveNote(now);
    if (!expected) return null;
    const id = expected.time + '_' + expected.midi;
    if (this._gradedIds.has(id)) return null;
    if (!pitchResult.confident || pitchResult.midi !== expected.midi) return null;

    const abs = Math.abs(pitchResult.cents);
    let grade;
    if (abs <= this.perfectThreshold) grade = GRADE.PERFECT;
    else if (abs <= this.greatThreshold) grade = GRADE.GREAT;
    else grade = GRADE.GOOD;

    this._applyGrade(expected, id, grade);
    return { note: expected, grade };
  }

  _evaluateTraining(pitchResult) {
    const note = this._currentTrainingNote;
    if (!note) return null;

    const now = performance.now() / 1000;

    if (!pitchResult.confident || pitchResult.midi !== note.midi) {
      this._tuneStart = null;
      this.trainingProgress = 0;
      return null;
    }

    // User is singing the right note — start/continue hold timer
    if (!this._tuneStart) this._tuneStart = now;
    const held = now - this._tuneStart;
    this.trainingProgress = Math.min(held / this.trainingHoldTime, 1);

    if (held >= this.trainingHoldTime) {
      // Success — grade and advance
      const abs = Math.abs(pitchResult.cents);
      const grade = abs <= this.perfectThreshold ? GRADE.PERFECT
                  : abs <= this.greatThreshold   ? GRADE.GREAT
                  : GRADE.GOOD;
      const id = note.time + '_' + note.midi;
      this._gradedIds.add(id);
      note.hit = grade;
      this[grade]++;
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      const mult = this._comboMult();
      this.score += POINTS[grade] * mult;

      this._tuneStart       = null;
      this.trainingProgress = 0;
      this.trainingIndex++;
      this._currentTrainingNote = this._notes[this.trainingIndex] ?? null;
      if (!this._currentTrainingNote) this.finished = true;
      return { note, grade };
    }
    return null;
  }

  /** Skip current training note (user pressed "Siguiente") */
  skipTrainingNote() {
    if (this.mode !== 'training' || !this._currentTrainingNote) return;
    const note = this._currentTrainingNote;
    const id   = note.time + '_' + note.midi;
    this._gradedIds.add(id);
    note.hit = 'miss';
    this.miss++;
    this.combo = 0;
    this._tuneStart       = null;
    this.trainingProgress = 0;
    this.trainingIndex++;
    this._currentTrainingNote = this._notes[this.trainingIndex] ?? null;
    if (!this._currentTrainingNote) this.finished = true;
    return { note, grade: GRADE.MISS };
  }

  // ── Normal mode tick (miss detection) ────────────────────────────────────

  tick() {
    if (!this.running || this.mode === 'training') return [];
    const now    = this.getTime();
    const missed = [];
    for (const note of this._notes) {
      const id      = note.time + '_' + note.midi;
      const expires = note.time + Math.max(note.duration, 0.15) + 0.1;
      if (expires > now || this._gradedIds.has(id)) continue;
      this._applyGrade(note, id, GRADE.MISS);
      missed.push({ note, grade: GRADE.MISS });
    }
    if (!this.finished && now > this.durationSecs + 1.5) this.finished = true;
    return missed;
  }

  // ── Piano input evaluation (teclado / MIDI) ───────────────────────────────

  evaluatePianoNote(midi) {
    if (!this.running) return null;
    if (this.mode === 'training') {
      const note = this._currentTrainingNote;
      if (!note || note.midi !== midi) return null;
      // Piano input counts as instant "great"
      const id = note.time + '_' + note.midi;
      this._gradedIds.add(id);
      note.hit = GRADE.GREAT;
      this.great++;
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.score += POINTS[GRADE.GREAT] * this._comboMult();
      this._tuneStart       = null;
      this.trainingProgress = 0;
      this.trainingIndex++;
      this._currentTrainingNote = this._notes[this.trainingIndex] ?? null;
      if (!this._currentTrainingNote) this.finished = true;
      return { note, grade: GRADE.GREAT };
    } else {
      // Normal mode: evaluate against active note
      const now      = this.getTime();
      const expected = this._getActiveNote(now);
      if (!expected || expected.midi !== midi) return null;
      const id = expected.time + '_' + expected.midi;
      if (this._gradedIds.has(id)) return null;
      this._applyGrade(expected, id, GRADE.GREAT);
      return { note: expected, grade: GRADE.GREAT };
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _getActiveNote(time) {
    return this._notes.find(n => {
      const id = n.time + '_' + n.midi;
      if (this._gradedIds.has(id)) return false;
      return time >= n.time && time < n.time + Math.max(n.duration, 0.15);
    }) || null;
  }

  _applyGrade(note, id, grade) {
    this._gradedIds.add(id);
    note.hit = grade;
    const pts = POINTS[grade] ?? 0;
    if (grade !== GRADE.MISS) {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    } else { this.combo = 0; }
    this.score += pts * this._comboMult();
    this[grade]++;
  }

  _comboMult() {
    if (this.combo >= 100) return 4;
    if (this.combo >= 50)  return 3;
    if (this.combo >= 20)  return 2;
    return 1;
  }

  getAccuracy() {
    const g = this.perfect + this.great + this.good + this.miss;
    if (!g) return 100;
    return Math.round(((this.perfect + this.great*.75 + this.good*.5) / g) * 100);
  }

  getRank() {
    const a = this.getAccuracy();
    if (a >= 95 && this.miss === 0) return 'S+';
    if (a >= 90) return 'S';
    if (a >= 80) return 'A';
    if (a >= 70) return 'B';
    if (a >= 60) return 'C';
    return 'D';
  }

  getSessionData() {
    return {
      score:    Math.round(this.score),
      accuracy: this.getAccuracy(),
      maxCombo: this.maxCombo,
      perfect:  this.perfect,
      great:    this.great,
      good:     this.good,
      miss:     this.miss,
      time:     Math.round(this.elapsed),
      rank:     this.getRank(),
      mode:     this.mode,
    };
  }

  get currentTrainingNote() { return this._currentTrainingNote; }
}
