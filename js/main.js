/**
 * main.js — NoteFall Trainer v2 — Controlador principal
 * Nuevas funciones: preescucha, modo entrenamiento, piano MIDI+PC,
 *                   forzado horizontal, pantalla completa
 * Kabert Studio – LMKE
 */

import { MidiEngine }                    from './modules/midi.js';
import { PitchDetector }                 from './modules/pitch.js';
import { MelodyPreview }                 from './modules/preview.js';
import { PianoInput }                    from './modules/piano-input.js';
import { NoteFallRenderer, ParticleField } from './modules/renderer.js';
import { GameEngine }                    from './modules/game.js';
import { StatsManager, ConfigStore }     from './modules/stats.js';

// ── Instancias de módulos ───────────────────────────────────────────────────
const midi        = new MidiEngine();
const pitch       = new PitchDetector();
const preview     = new MelodyPreview();
const pianoInput  = new PianoInput();
const stats       = new StatsManager();
const cfg         = new ConfigStore();

let renderer      = null;
let game          = null;
let menuParticles = null;
let splashParticles = null;
let gameLoopId    = null;
let currentMode   = 'normal';  // 'normal' | 'training'

// ── Splash ──────────────────────────────────────────────────────────────────
(function initSplash() {
  const splash  = document.getElementById('splash-screen');
  const fill    = document.getElementById('loading-fill');
  const loadTxt = document.getElementById('loading-text');
  const skipBtn = document.getElementById('skip-btn');

  const msgs    = ['Cargando motor de audio…','Inicializando detector de tono…','Preparando piano…','¡Listo para entrenar!'];
  splashParticles = new ParticleField('particles-canvas');
  splashParticles.start();

  let step = 0;
  const advance = () => { fill.style.width=`${((++step)/msgs.length)*100}%`; loadTxt.textContent=msgs[step-1]; };
  const times = [400,800,600,500];
  let delay = 0;
  times.forEach((t,i)=>{ delay+=t; setTimeout(()=>{ advance(); if(i===times.length-1) setTimeout(goMenu,700); },delay); });
  skipBtn.addEventListener('click', goMenu);

  function goMenu() {
    splash.classList.add('fade-out');
    splashParticles.stop();
    setTimeout(()=>{ splash.classList.add('hidden'); showScreen('main-menu'); },800);
  }
})();

// ── Gestión de pantallas ────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
  if (id==='main-menu') { if(!menuParticles) menuParticles=new ParticleField('menu-particles'); menuParticles.start(); }
  else menuParticles?.stop();
}
function showModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function hideModal(id)  { document.getElementById(id)?.classList.add('hidden'); }

// ── Pantalla completa ───────────────────────────────────────────────────────
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(()=>{});
  } else {
    document.exitFullscreen().catch(()=>{});
  }
}
function updateFsIcons() {
  const icon = document.fullscreenElement ? '⛶' : '⛶';
  document.querySelectorAll('.fullscreen-btn').forEach(b => b.textContent = document.fullscreenElement ? '⊡' : '⛶');
}
document.addEventListener('fullscreenchange', updateFsIcons);
document.getElementById('btn-fullscreen-menu')?.addEventListener('click', toggleFullscreen);
document.getElementById('btn-fullscreen-game')?.addEventListener('click', toggleFullscreen);

// ── Selector de modo ────────────────────────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
  });
});

// ── Menú principal: botones ─────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  if (!midi.notes.length) { alert('Por favor carga primero un archivo MIDI.'); return; }
  preview.stop();
  startGame(currentMode);
});

document.getElementById('btn-load-midi').addEventListener('click', ()=>document.getElementById('midi-file-input').click());

document.getElementById('midi-file-input').addEventListener('change', async e=>{
  const file = e.target.files[0];
  if (!file) return;
  try {
    const info = await midi.loadFile(file);
    showMidiPreview(info);
    preview.volume = cfg.get('previewVolume') ?? 0.4;
  } catch(err) { alert('Error al leer el archivo MIDI: '+err.message); }
  e.target.value='';
});

function showMidiPreview(info) {
  const el  = document.getElementById('midi-info-preview');
  const body = document.getElementById('mp-body');
  body.innerHTML = `
    <div class="mp-title">♪ ${info.name||'Sin nombre'}</div>
    <div class="mp-row"><span>BPM</span><span class="mp-val">${info.bpm}</span></div>
    <div class="mp-row"><span>Duración</span><span class="mp-val">${info.duration}s</span></div>
    <div class="mp-row"><span>Pistas</span><span class="mp-val">${info.tracks}</span></div>
    <div class="mp-row"><span>Notas totales</span><span class="mp-val">${info.totalNotes}</span></div>
    <div class="mp-row"><span>Compás</span><span class="mp-val">${info.timeSignature}</span></div>
  `;
  el.classList.remove('hidden');
}

// ── Preescucha ──────────────────────────────────────────────────────────────
document.getElementById('btn-preview-play')?.addEventListener('click', async ()=>{
  if (preview.isPlaying) { preview.stop(); resetPreviewUI(); return; }
  if (!midi.notes.length) return;

  const btnPlay = document.getElementById('btn-preview-play');
  const progRow  = document.getElementById('preview-progress');
  const fill     = document.getElementById('preview-fill');
  btnPlay.disabled = true;
  btnPlay.textContent = '■ Detener';
  btnPlay.disabled = false;
  progRow.classList.remove('hidden');

  preview.volume = cfg.get('previewVolume') ?? 0.4;
  await preview.play(
    midi.notes,
    cfg.get('speed') ?? 1,
    (t, total) => { fill.style.width = Math.min(100, (t/total)*100)+'%'; },
    () => resetPreviewUI()
  );
});

document.getElementById('btn-preview-stop')?.addEventListener('click', ()=>{ preview.stop(); resetPreviewUI(); });

function resetPreviewUI() {
  const btnPlay = document.getElementById('btn-preview-play');
  const progRow  = document.getElementById('preview-progress');
  const fill     = document.getElementById('preview-fill');
  if (btnPlay) { btnPlay.textContent='▶ Preescuchar'; btnPlay.disabled=false; }
  if (progRow) progRow.classList.add('hidden');
  if (fill)    fill.style.width='0%';
}

// ── Modales del menú ────────────────────────────────────────────────────────
document.getElementById('btn-config').addEventListener('click', ()=>{ loadConfigUI(); showModal('config-modal'); });
document.getElementById('btn-stats').addEventListener('click',  ()=>{ loadStatsUI();  showModal('stats-modal'); });
document.getElementById('btn-help').addEventListener('click',   ()=>showModal('help-modal'));
document.getElementById('btn-credits').addEventListener('click',()=>showModal('credits-modal'));
['config','stats','help','credits'].forEach(n=>
  document.getElementById(`btn-${n}-close`)?.addEventListener('click',()=>hideModal(`${n}-modal`))
);

// ── Configuración UI ────────────────────────────────────────────────────────
function loadConfigUI() {
  const c = cfg.getAll();
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=v; };
  set('cfg-sensitivity', c.sensitivity);
  set('cfg-tolerance',   c.toleranceCents);
  set('cfg-speed',       c.speed);
  set('cfg-metronome',   c.previewVolume);
  set('cfg-hold-time',   c.holdTime);
  set('cfg-theme',       c.theme);
  const ef = document.getElementById('cfg-effects');    if(ef) ef.checked = c.effects;
  const ps = document.getElementById('cfg-piano-sound'); if(ps) ps.checked = c.pianoSound;
  bindCfgLabel('cfg-sensitivity','cfg-sensitivity-val', v=>v);
  bindCfgLabel('cfg-tolerance',  'cfg-tolerance-val',  v=>v+'¢');
  bindCfgLabel('cfg-speed',      'cfg-speed-val',       v=>v+'×');
  bindCfgLabel('cfg-metronome',  'cfg-metronome-val',  v=>v);
  bindCfgLabel('cfg-hold-time',  'cfg-hold-time-val',  v=>v+'s');
}
function bindCfgLabel(inputId, labelId, fmt) {
  const input=document.getElementById(inputId), label=document.getElementById(labelId);
  if(!input||!label) return;
  label.textContent=fmt(input.value);
  input.oninput=()=>label.textContent=fmt(input.value);
}

document.getElementById('btn-config-save')?.addEventListener('click',()=>{
  cfg.save({
    sensitivity:   parseFloat(document.getElementById('cfg-sensitivity').value),
    toleranceCents:parseInt(document.getElementById('cfg-tolerance').value),
    speed:         parseFloat(document.getElementById('cfg-speed').value),
    previewVolume: parseFloat(document.getElementById('cfg-metronome').value),
    holdTime:      parseFloat(document.getElementById('cfg-hold-time').value),
    theme:         document.getElementById('cfg-theme').value,
    effects:       document.getElementById('cfg-effects').checked,
    pianoSound:    document.getElementById('cfg-piano-sound').checked,
  });
  pitch.sensitivity = cfg.get('sensitivity');
  if(game) { game.toleranceCents=cfg.get('toleranceCents'); game.trainingHoldTime=cfg.get('holdTime'); }
  hideModal('config-modal');
});

// ── Estadísticas UI ─────────────────────────────────────────────────────────
function loadStatsUI() {
  const data = stats.getAll();
  const container = document.getElementById('stats-content');
  const rows=[
    ['Sesiones totales',   data.totalSessions],
    ['Tiempo de práctica', stats.formatTime(data.totalPracticeMs)],
    ['Mejor puntuación',   data.bestScore.toLocaleString()],
    ['Mejor precisión',    data.bestAccuracy+'%'],
    ['Mejor combo',        data.bestCombo+'×'],
  ];
  let html=rows.map(([k,v])=>`<div class="stat-row"><span class="stat-key">${k}</span><span class="stat-val">${v}</span></div>`).join('');
  if(data.sessions.length>0){
    html+=`<div class="session-list"><h3 style="color:var(--accent2);font-size:12px;margin:10px 0 5px;font-family:var(--font-display);letter-spacing:.05em">Historial reciente</h3>`;
    data.sessions.slice(0,8).forEach(s=>{
      html+=`<div class="session-item">${s.date} — <strong>${s.songName||'—'}</strong> [${s.mode||'normal'}] | ${s.score} pts | ${s.accuracy}% | ${s.rank}</div>`;
    });
    html+=`</div>`;
  } else html+=`<p style="color:var(--text2);font-size:12px;margin-top:10px">Aún no hay sesiones registradas.</p>`;
  container.innerHTML=html;
}

// ── MIDI device status display ──────────────────────────────────────────────
function updateMidiStatus() {
  const el = document.getElementById('midi-device-status');
  if (!el) return;
  const devices = pianoInput.getMIDIDevices();
  if (devices.length > 0) {
    el.textContent = '🎹 MIDI: ' + devices.join(', ');
  } else {
    el.textContent = '⌨ Piano: teclado PC activo (Q W E R T…)';
  }
}

// ── Inicio del juego ────────────────────────────────────────────────────────
async function startGame(mode = 'normal') {
  showScreen('game-screen');
  hideModal('pause-modal');
  hideModal('results-modal');

  // Renderer
  if (!renderer) renderer = new NoteFallRenderer('notefall-canvas','piano-canvas');
  renderer.setShowEffects(cfg.get('effects'));

  // Reset notas (quitar hit anterior)
  midi.notes.forEach(n=>n.hit=null);

  // Game engine
  game = new GameEngine({
    toleranceCents:   cfg.get('toleranceCents'),
    mode,
    trainingHoldTime: cfg.get('holdTime') ?? 0.8,
  });
  game.init(midi.notes, midi.durationSeconds);

  // HUD
  document.getElementById('song-name-display').textContent = midi.name||'—';
  const badge = document.getElementById('hud-mode-badge');
  if (badge) {
    badge.textContent  = mode==='training' ? '🎓 ENTRENAMIENTO' : '🎮 NORMAL';
    badge.className    = 'hud-mode ' + mode;
  }

  // Training UI
  const tnd = document.getElementById('training-note-display');
  if (mode==='training') {
    tnd?.classList.remove('hidden');
    renderer.setTrainingMidi(null);
  } else {
    tnd?.classList.add('hidden');
    renderer.setTrainingMidi(null);
  }

  updateHUD();

  // Renderer: en training no hay tiempo corriendo; en normal sí
  renderer.start(midi.notes);

  // Piano input
  pianoInput.onNote((midiNote, velocity, isOn)=>{
    if (!isOn || !game?.running) return;
    // Sonido
    if (cfg.get('pianoSound')) preview.playNote(midiNote, 0.4);
    renderer.setHeldMidi(pianoInput.getHeld());
    renderer.setActiveMidi(midiNote);

    // Evaluate
    const hit = game.evaluatePianoNote(midiNote);
    if (hit) { triggerHitFeedback(hit.grade); renderer.spawnHitEffect(hit.grade); updateHUD(); }
    if (mode==='training') updateTrainingDisplay();
  });
  // Piano note off
  pianoInput.onNote((midiNote, velocity, isOn)=>{
    if (isOn) return;
    renderer.setHeldMidi(pianoInput.getHeld());
  });

  // Start mic
  pitch.sensitivity = cfg.get('sensitivity');
  try { await pitch.start(); } catch(err){ console.warn('Mic no disponible:',err); }

  pitch.onResult(result=>{
    if (!game?.running) return;
    updatePitchUI(result);
    renderer.setActiveMidi(result.confident ? result.midi : null);

    const hit = game.evaluate(result);
    if (hit) {
      triggerHitFeedback(hit.grade);
      renderer.spawnHitEffect(hit.grade);
      updateHUD();
    }
    if (mode==='training') {
      updateTrainingProgress(game.trainingProgress);
      updateTrainingDisplay();
    }
  });

  // Game start
  game.start();
  if (mode==='training') updateTrainingDisplay();

  // Game loop
  if (gameLoopId) clearInterval(gameLoopId);
  gameLoopId = setInterval(()=>{
    if (!game?.running) return;

    if (mode==='normal') {
      renderer.setTime(game.getTime());
      const missed = game.tick();
      missed.forEach(({grade})=>{ triggerHitFeedback(grade); renderer.spawnHitEffect(grade); });
    } else {
      // Training: advance renderer time to show next note
      const tn = game.currentTrainingNote;
      if (tn) {
        renderer.setTime(tn.time - 1.5); // keep target note in view
        renderer.setTrainingMidi(tn.midi);
      }
    }

    updateHUD();
    if (game.finished) { clearInterval(gameLoopId); endGame(); }
  }, 16);
}

// ── Training display ────────────────────────────────────────────────────────
function updateTrainingDisplay() {
  if (!game || game.mode!=='training') return;
  const note = game.currentTrainingNote;
  const noteEl = document.getElementById('tnd-note');
  const freqEl = document.getElementById('tnd-freq');
  if (!note) { if(noteEl) noteEl.textContent='✓ FIN'; return; }
  if (noteEl) noteEl.textContent = note.name || '—';
  if (freqEl) {
    const freq = 440 * Math.pow(2,(note.midi-69)/12);
    freqEl.textContent = `${Math.round(freq)} Hz`;
  }
  renderer.setTrainingMidi(note.midi);
}

// Ring progress inside pitch feedback for training
function updateTrainingProgress(progress) {
  const ring = document.getElementById('pf-ring-fill');
  if (!ring) return;
  const R  = 20;
  const C  = 2 * Math.PI * R;
  ring.style.strokeDasharray  = `${C}`;
  ring.style.strokeDashoffset = `${C * (1 - (progress||0))}`;
}

// Preview de nota individual en modo entrenamiento
document.getElementById('tnd-preview-btn')?.addEventListener('click',()=>{
  const note = game?.currentTrainingNote;
  if (!note) return;
  preview.volume = cfg.get('previewVolume') ?? 0.4;
  preview.playNote(note.midi, 0.6);
});

// Saltar nota en modo entrenamiento
document.getElementById('tnd-skip-btn')?.addEventListener('click',()=>{
  if (!game || game.mode!=='training') return;
  const hit = game.skipTrainingNote();
  if (hit) {
    triggerHitFeedback(GRADE_MISS);
    renderer.spawnHitEffect('miss');
    updateHUD();
    updateTrainingDisplay();
  }
});
const GRADE_MISS = 'miss';

// ── HUD ─────────────────────────────────────────────────────────────────────
function updateHUD() {
  if (!game) return;
  document.getElementById('score-display').textContent    = Math.round(game.score).toLocaleString();
  document.getElementById('accuracy-display').textContent = game.getAccuracy()+'%';
  document.getElementById('combo-display').textContent    = game.combo+'×';
}

// ── Pitch UI ─────────────────────────────────────────────────────────────────
function updatePitchUI(result) {
  const noteEl   = document.getElementById('pf-note');
  const centsEl  = document.getElementById('pf-cents');
  const needleEl = document.getElementById('pf-needle');
  const statusEl = document.getElementById('pf-status');

  noteEl.textContent = result.noteName || '—';

  if (!result.confident) {
    if(centsEl)  centsEl.textContent  = '0¢';
    if(needleEl) needleEl.style.left  = '50%';
    if(statusEl) { statusEl.textContent='Esperando audio…'; statusEl.className='pf-status miss'; }
    updateTrainingProgress(0);
    return;
  }

  const cents = Math.round(result.cents);
  if(centsEl) centsEl.textContent = (cents>=0?'+':'')+cents+'¢';
  if(needleEl) {
    const pct = 50 + (cents/50)*45;
    needleEl.style.left = Math.max(5,Math.min(95,pct))+'%';
  }
  if(statusEl) {
    const abs = Math.abs(cents);
    if      (abs<=15) { statusEl.textContent='✓ AFINADO'; statusEl.className='pf-status tune'; }
    else if (cents<0) { statusEl.textContent='▼ GRAVE';   statusEl.className='pf-status flat'; }
    else              { statusEl.textContent='▲ AGUDO';   statusEl.className='pf-status sharp'; }
  }
}

// ── Ring SVG para entrenamiento (inyectado dentro de .pitch-feedback) ────────
;(function injectRingSVG() {
  const pf = document.getElementById('pitch-feedback');
  if (!pf) return;
  const div = document.createElement('div');
  div.className = 'pf-progress-ring';
  div.innerHTML = `
    <svg class="pf-ring-svg" width="48" height="48" viewBox="0 0 48 48">
      <circle class="pf-ring-bg"   cx="24" cy="24" r="20"/>
      <circle class="pf-ring-fill" cx="24" cy="24" r="20" id="pf-ring-fill"
        style="stroke-dasharray:125.66;stroke-dashoffset:125.66;"/>
    </svg>`;
  pf.appendChild(div);
})();

// ── Hit feedback ─────────────────────────────────────────────────────────────
const HIT_LABELS = { perfect:'PERFECT!', great:'GREAT', good:'GOOD', miss:'MISS' };
let _hitTimer = null;
function triggerHitFeedback(grade) {
  const el = document.getElementById('hit-feedback');
  if (!el) return;
  if (_hitTimer) clearTimeout(_hitTimer);
  el.innerHTML = `<span class="hit-label ${grade}">${HIT_LABELS[grade]||grade}</span>`;
  _hitTimer = setTimeout(()=>el.innerHTML='',600);

  // Training: success ring animation
  if (grade!=='miss' && game?.mode==='training') {
    const ring = document.createElement('div');
    ring.className = 'training-success-ring';
    document.querySelector('.game-area')?.appendChild(ring);
    setTimeout(()=>ring.remove(), 900);
  }
}

// ── Pausa ────────────────────────────────────────────────────────────────────
document.getElementById('btn-pause')?.addEventListener('click', pauseGame);
document.getElementById('btn-resume')?.addEventListener('click', resumeGame);
document.getElementById('btn-restart')?.addEventListener('click',()=>{ hideModal('pause-modal'); endGame(true); setTimeout(()=>startGame(currentMode),100); });
document.getElementById('btn-quit-pause')?.addEventListener('click',()=>{ hideModal('pause-modal'); quitToMenu(); });
document.getElementById('btn-quit-game')?.addEventListener('click',()=>{ pauseGame(); });

function pauseGame()  { game?.pause(); renderer?.stop(); showModal('pause-modal'); }
function resumeGame() { hideModal('pause-modal'); game?.resume(); renderer?.start(midi.notes); }

// ── Fin de partida ───────────────────────────────────────────────────────────
function endGame(silent=false) {
  if (gameLoopId) { clearInterval(gameLoopId); gameLoopId=null; }
  renderer?.stop();
  pitch.stop();
  document.getElementById('training-note-display')?.classList.add('hidden');

  if (silent) return;

  const data = game?.getSessionData() || {};
  stats.recordSession(midi.name, data);

  document.getElementById('res-score').textContent    = (data.score||0).toLocaleString();
  document.getElementById('res-accuracy').textContent = (data.accuracy||0)+'%';
  document.getElementById('res-combo').textContent    = data.maxCombo||0;
  document.getElementById('res-perfect').textContent  = data.perfect||0;
  document.getElementById('res-great').textContent    = data.great||0;
  document.getElementById('res-good').textContent     = data.good||0;
  document.getElementById('res-miss').textContent     = data.miss||0;
  document.getElementById('res-time').textContent     = (data.time||0)+'s';

  const rank = data.rank||'D';
  const rankColors={'S+':'#69ff47','S':'#69ff47','A':'#00e5ff','B':'#ffea00','C':'#ff6d00','D':'#ff4081'};
  const rd = document.getElementById('rank-display');
  if(rd){ rd.textContent=rank; rd.style.color=rankColors[rank]||'#fff'; rd.style.textShadow=`0 0 40px ${rankColors[rank]||'#fff'}`; }
  showModal('results-modal');
}

document.getElementById('btn-play-again')?.addEventListener('click',()=>{ hideModal('results-modal'); startGame(currentMode); });
document.getElementById('btn-results-menu')?.addEventListener('click',()=>{ hideModal('results-modal'); quitToMenu(); });

function quitToMenu() {
  if(gameLoopId){ clearInterval(gameLoopId); gameLoopId=null; }
  renderer?.stop();
  pitch.stop();
  game=null;
  resetPreviewUI();
  showScreen('main-menu');
  updateMidiStatus();
}

// ── Teclado (Esc = pausa) ────────────────────────────────────────────────────
document.addEventListener('keydown', e=>{
  if (e.key==='Escape') {
    if (document.getElementById('game-screen').classList.contains('hidden')) return;
    const pm = document.getElementById('pause-modal');
    if (!pm.classList.contains('hidden')) resumeGame(); else pauseGame();
  }
  if (e.key==='F11') { e.preventDefault(); toggleFullscreen(); }
});

// ── Inicialización de piano input ─────────────────────────────────────────────
pianoInput.start().then(()=>updateMidiStatus());

// ── Orientación forzada: feedback al user ─────────────────────────────────────
// El CSS @media (orientation:portrait) muestra el overlay; aquí solo aseguramos
// que la app intenta la orientación landscape si la API está disponible.
if (screen.orientation && screen.orientation.lock) {
  screen.orientation.lock('landscape').catch(()=>{});
}
