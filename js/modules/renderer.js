/**
 * renderer.js — Motor gráfico NoteFall (Canvas 2D, 60 FPS)
 * Estilo Synthesia: notas cayendo + piano interactivo + partículas
 * Kabert Studio – LMKE
 */

const PIANO_START = 21;   // A0
const PIANO_END   = 108;  // C8
const LOOK_AHEAD  = 4;    // segundos visibles sobre la línea
const HIT_Y_RATIO = 0.88; // línea de ejecución al 88% de altura

export class NoteFallRenderer {
  constructor(canvasId, pianoCanvasId) {
    this.canvas      = document.getElementById(canvasId);
    this.pianoCanvas = document.getElementById(pianoCanvasId);
    this.ctx         = this.canvas.getContext('2d');
    this.pianoCtx    = this.pianoCanvas.getContext('2d');

    this.notes       = [];
    this.currentTime = 0;
    this.showEffects = true;
    this.activeMidi  = null;      // nota resaltada en piano (voz/mic)
    this.heldMidi    = new Set(); // teclas presionadas (piano input)
    this.trainingMidi= null;      // nota esperada en modo entrenamiento
    this.particles   = [];

    this._running = false;
    this._raf     = null;
    this._keys    = this._buildKeys();
    this._dpr     = window.devicePixelRatio || 1;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  // ── Pública ──────────────────────────────────────────────────────────────

  start(notes) {
    this.notes = notes;
    this._running = true;
    if (!this._raf) this._raf = requestAnimationFrame(() => this._frame());
  }

  stop() {
    this._running = false;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  setTime(t)          { this.currentTime = t; }
  setActiveMidi(m)    { this.activeMidi = m; }
  setHeldMidi(set)    { this.heldMidi = set; }
  setTrainingMidi(m)  { this.trainingMidi = m; }
  setShowEffects(v)   { this.showEffects = v; }

  spawnHitEffect(grade) {
    if (!this.showEffects) return;
    const colors = { perfect:'#69ff47', great:'#00e5ff', good:'#ffea00', miss:'#ff4081' };
    const color  = colors[grade] || '#fff';
    const cx     = this.canvas.width  / (2 * this._dpr);
    const cy     = this.canvas.height / this._dpr * HIT_Y_RATIO;
    const count  = grade === 'miss' ? 5 : 14;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const spd   = 1.5 + Math.random() * 3;
      this.particles.push({ x:cx, y:cy, vx:Math.cos(angle)*spd, vy:Math.sin(angle)*spd - 1.2, life:1, color, size:3+Math.random()*3 });
    }
  }

  // ── Loop ─────────────────────────────────────────────────────────────────

  _frame() {
    if (!this._running) return;
    this._raf = requestAnimationFrame(() => this._frame());
    this._draw();
  }

  _draw() {
    const { ctx, canvas } = this;
    const W = canvas.width  / this._dpr;
    const H = canvas.height / this._dpr;
    const hitY = H * HIT_Y_RATIO;

    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, W, H);

    // Grid
    this._drawGrid(W, H, hitY);
    // Notes
    this._drawNotes(W, H, hitY);
    // Hit line
    this._drawHitLine(W, hitY);
    // Particles
    this._drawParticles();
    // Training highlight
    if (this.trainingMidi) this._drawTrainingTarget(W, hitY);
    // Piano
    this._drawPiano();
  }

  _drawGrid(W, H, hitY) {
    const { ctx } = this;
    const pps = hitY / LOOK_AHEAD;
    // Vertical octave lines
    ctx.strokeStyle = 'rgba(124,77,255,0.05)';
    ctx.lineWidth = 1;
    for (let m = PIANO_START; m <= PIANO_END; m++) {
      if (m % 12 === 0) {
        const x = this._midiToX(m, W);
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,hitY); ctx.stroke();
      }
    }
    // Horizontal time marks every second
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    for (let s = 1; s <= LOOK_AHEAD; s++) {
      const y = hitY - s * pps;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    }
  }

  _drawNotes(W, H, hitY) {
    const { ctx } = this;
    const pps     = hitY / LOOK_AHEAD;
    const now     = this.currentTime;
    const winEnd  = now + LOOK_AHEAD;
    const nw      = Math.max(this._noteWidth(W) - 2, 5);

    for (const note of this.notes) {
      if (note.time > winEnd) continue;
      if (note.time + note.duration < now - 0.6) continue;

      const x    = this._midiToX(note.midi, W) - nw / 2;
      const topY = hitY - (note.time + note.duration - now) * pps;
      const botY = hitY - (note.time - now) * pps;
      const nh   = Math.max(botY - topY, 7);
      const r    = Math.min(4, nw/2, nh/2);

      let color = note.color;
      let alpha = 1;
      if (note.hit === 'perfect') color = '#69ff47';
      else if (note.hit === 'great') color = '#00e5ff';
      else if (note.hit === 'good')  color = '#ffea00';
      else if (note.hit === 'miss')  { color = '#ff4081'; alpha = 0.4; }

      // Training dim: only highlight target note
      if (this.trainingMidi !== null && note.midi !== this.trainingMidi) alpha *= 0.25;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 10;

      // Rounded rect
      ctx.beginPath();
      ctx.moveTo(x+r, topY);
      ctx.lineTo(x+nw-r, topY);
      ctx.quadraticCurveTo(x+nw,topY,x+nw,topY+r);
      ctx.lineTo(x+nw,topY+nh-r);
      ctx.quadraticCurveTo(x+nw,topY+nh,x+nw-r,topY+nh);
      ctx.lineTo(x+r,topY+nh);
      ctx.quadraticCurveTo(x,topY+nh,x,topY+nh-r);
      ctx.lineTo(x,topY+r);
      ctx.quadraticCurveTo(x,topY,x+r,topY);
      ctx.closePath();

      const grad = ctx.createLinearGradient(x,topY,x,topY+nh);
      grad.addColorStop(0, this._lighten(color,0.3));
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = this._lighten(color,0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawHitLine(W, hitY) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = '#7c4dff';
    ctx.shadowBlur  = 18;
    const grad = ctx.createLinearGradient(0,0,W,0);
    grad.addColorStop(0,'transparent');
    grad.addColorStop(0.08,'rgba(124,77,255,0.85)');
    grad.addColorStop(0.92,'rgba(0,229,255,0.85)');
    grad.addColorStop(1,'transparent');
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 2.5;
    ctx.beginPath(); ctx.moveTo(0,hitY); ctx.lineTo(W,hitY); ctx.stroke();
    ctx.restore();
  }

  _drawTrainingTarget(W, hitY) {
    const { ctx } = this;
    const x  = this._midiToX(this.trainingMidi, W);
    const nw = this._noteWidth(W);
    // Vertical guide beam
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle   = '#69ff47';
    ctx.fillRect(x - nw/2, 0, nw, hitY);
    // Arrow at bottom
    ctx.globalAlpha = 0.7;
    ctx.fillStyle   = '#69ff47';
    ctx.shadowColor = '#69ff47';
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.moveTo(x, hitY + 4);
    ctx.lineTo(x - 8, hitY - 10);
    ctx.lineTo(x + 8, hitY - 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawParticles() {
    if (!this.showEffects) return;
    const { ctx } = this;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.life -= 0.04;
      if (p.life <= 0) { this.particles.splice(i,1); continue; }
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Piano ────────────────────────────────────────────────────────────────

  _drawPiano() {
    const { pianoCtx:ctx, pianoCanvas:cv, _keys:keys } = this;
    const W = cv.width  / this._dpr;
    const H = cv.height / this._dpr;
    const whites = keys.filter(k => !k.isBlack);
    const ww     = W / whites.length;
    const bw     = ww * 0.6;
    const bh     = H * 0.62;

    ctx.fillStyle = '#06060d';
    ctx.fillRect(0, 0, W, H);

    // White keys
    for (const key of whites) {
      const x = key.wi * ww;
      const held   = this.heldMidi.has(key.midi);
      const active = key.midi === this.activeMidi;
      const isTgt  = key.midi === this.trainingMidi;

      const grad = ctx.createLinearGradient(x,0,x,H);
      if (isTgt)   { grad.addColorStop(0,'#b9ffaa'); grad.addColorStop(1,'#69ff47'); }
      else if (held||active) { grad.addColorStop(0,'#c8a0ff'); grad.addColorStop(1,'#7c4dff'); }
      else         { grad.addColorStop(0,'#e8e8ef'); grad.addColorStop(1,'#c8c8d5'); }

      ctx.save();
      if (held||active||isTgt) { ctx.shadowColor = isTgt?'#69ff47':'#7c4dff'; ctx.shadowBlur = 14; }
      ctx.fillStyle   = grad;
      ctx.fillRect(x+1, 0, ww-2, H);
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth   = 1;
      ctx.strokeRect(x+1,0,ww-2,H);
      ctx.restore();

      // Note label on white key
      if (key.midi % 12 === 0) { // C notes
        ctx.fillStyle = '#666';
        ctx.font = `${Math.max(8, ww*0.5)}px Inter`;
        ctx.textAlign = 'center';
        ctx.fillText(`C${Math.floor(key.midi/12)-1}`, x + ww/2, H - 4);
      }
    }

    // Black keys
    for (const key of keys.filter(k=>k.isBlack)) {
      const lw  = whites.find(k => k.midi === key.lw);
      if (!lw) continue;
      const x    = lw.wi * ww + ww - bw/2;
      const held = this.heldMidi.has(key.midi);
      const active = key.midi === this.activeMidi;
      const isTgt  = key.midi === this.trainingMidi;

      const grad = ctx.createLinearGradient(x,0,x,bh);
      if (isTgt)   { grad.addColorStop(0,'#60d050'); grad.addColorStop(1,'#2a8020'); }
      else if (held||active) { grad.addColorStop(0,'#a07aff'); grad.addColorStop(1,'#5a20c0'); }
      else         { grad.addColorStop(0,'#2a2a3a'); grad.addColorStop(1,'#111120'); }

      ctx.save();
      if (held||active||isTgt) { ctx.shadowColor = isTgt?'#69ff47':'#7c4dff'; ctx.shadowBlur = 12; }
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, bw, bh);
      ctx.restore();
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  _buildKeys() {
    const blackPat  = [0,1,0,1,0,0,1,0,1,0,1,0]; // 1=black
    const lwOffset  = { 1:0, 3:2, 6:5, 8:7, 10:9 };
    const keys = [];
    let wi = 0;
    for (let m = PIANO_START; m <= PIANO_END; m++) {
      const sem     = m % 12;
      const isBlack = !!blackPat[sem];
      const key     = { midi:m, isBlack };
      if (!isBlack) { key.wi = wi++; }
      else { const off = lwOffset[sem]; if (off!==undefined) key.lw = m - sem + off; }
      keys.push(key);
    }
    return keys;
  }

  _noteWidth(W) {
    const whites = this._keys.filter(k=>!k.isBlack).length;
    return (W / whites) * 0.88;
  }

  _midiToX(midi, W) {
    const whites = this._keys.filter(k=>!k.isBlack).length;
    const ww     = W / whites;
    const key    = this._keys.find(k=>k.midi===midi);
    if (!key) return W/2;
    if (!key.isBlack) return key.wi * ww + ww/2;
    const lk = this._keys.find(k=>!k.isBlack&&k.midi===key.lw);
    return lk ? lk.wi * ww + ww : W/2;
  }

  _resize() {
    this._dpr = window.devicePixelRatio || 1;
    const d   = this._dpr;
    [
      [this.canvas,      this.ctx],
      [this.pianoCanvas, this.pianoCtx],
    ].forEach(([cv, cx]) => {
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      cv.width  = r.width  * d;
      cv.height = r.height * d;
      cx.setTransform(d, 0, 0, d, 0, 0);
    });
  }

  _lighten(hex, amt) {
    const n = parseInt(hex.replace('#',''),16);
    const r = Math.min(255,(n>>16)+Math.round(255*amt));
    const g = Math.min(255,((n>>8)&0xff)+Math.round(255*amt));
    const b = Math.min(255,(n&0xff)+Math.round(255*amt));
    return `rgb(${r},${g},${b})`;
  }
}

// ── Partículas decorativas (splash / menú) ────────────────────────────────

export class ParticleField {
  constructor(canvasId) {
    this.canvas  = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx     = this.canvas.getContext('2d');
    this.parts   = [];
    this._raf    = null;
    this._active = false;
    this._resize();
    this._populate();
    window.addEventListener('resize', () => { this._resize(); this._populate(); });
  }

  start() {
    if (this._active) return;
    this._active = true;
    this._raf = requestAnimationFrame(() => this._tick());
  }

  stop() {
    this._active = false;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  _populate() {
    if (!this.canvas) return;
    this.parts = [];
    const n = Math.floor((this.canvas.width * this.canvas.height) / 9000);
    const syms = ['♪','♫','♩','♬','♭','♮','♯'];
    for (let i=0;i<n;i++) this.parts.push({
      x:Math.random()*this.canvas.width, y:Math.random()*this.canvas.height,
      vx:(Math.random()-.5)*.4, vy:-.25-.5*Math.random(),
      alpha:.05+.12*Math.random(), size:10+16*Math.random(),
      sym:syms[Math.floor(Math.random()*syms.length)],
      hue:250+Math.random()*60,
    });
  }

  _tick() {
    if (!this._active||!this.canvas) return;
    this._raf = requestAnimationFrame(()=>this._tick());
    const {ctx,canvas} = this;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (const p of this.parts) {
      p.x+=p.vx; p.y+=p.vy;
      if (p.y<-20) p.y=canvas.height+20;
      if (p.x<-20||p.x>canvas.width+20) p.x=Math.random()*canvas.width;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle   = `hsl(${p.hue},80%,70%)`;
      ctx.font        = `${p.size}px serif`;
      ctx.fillText(p.sym, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  _resize() {
    if (!this.canvas) return;
    this.canvas.width  = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }
}
