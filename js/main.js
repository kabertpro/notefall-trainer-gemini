document.addEventListener('DOMContentLoaded', () => {
    // Referencias UI
    const screens = document.querySelectorAll('.screen');
    const btnSkip = document.getElementById('skip-splash');
    const btnStart = document.getElementById('btn-start');
    const btnLoadMidi = document.getElementById('btn-load-midi');
    const midiUpload = document.getElementById('midi-upload');
    const btnCredits = document.getElementById('btn-credits');
    const btnBackCredits = document.getElementById('btn-back-credits');
    const btnExit = document.getElementById('btn-exit-game');
    
    // UI HUD
    const tunerNeedle = document.getElementById('tuner-needle');
    const currentNoteEl = document.getElementById('current-note');
    const centsDevEl = document.getElementById('cents-dev');
    const scoreEl = document.getElementById('score');
    
    let gfxEngine;
    let gameLoopId;
    let startTime = 0;
    let score = 0;

    // Navegación
    const showScreen = (id) => {
        screens.forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    };

    // Eventos
    setTimeout(() => showScreen('main-menu'), 4000); // Splash timeout
    btnSkip.addEventListener('click', () => showScreen('main-menu'));
    btnCredits.addEventListener('click', () => showScreen('credits-screen'));
    btnBackCredits.addEventListener('click', () => showScreen('main-menu'));
    
    btnLoadMidi.addEventListener('click', () => midiUpload.click());
    midiUpload.addEventListener('change', async (e) => {
        if (e.target.files[0]) {
            await midiEngine.loadFile(e.target.files[0]);
            document.getElementById('song-name').innerText = e.target.files[0].name;
            document.getElementById('track-info').classList.remove('hidden');
        }
    });

    btnStart.addEventListener('click', async () => {
        if (midiEngine.notes.length === 0) {
            alert("Por favor, carga un archivo MIDI primero.");
            return;
        }
        await audio.initMicrophone();
        gfxEngine = new GraphicsEngine('game-canvas');
        showScreen('game-screen');
        startGame();
    });

    btnExit.addEventListener('click', () => {
        cancelAnimationFrame(gameLoopId);
        showScreen('main-menu');
    });

    // Bucle de Juego
    function startGame() {
        startTime = Tone.now(); // Usar reloj preciso
        score = 0;
        gameLoop();
    }

    function gameLoop() {
        const currentTime = Tone.now() - startTime;
        
        // Detección de Pitch
        const freq = audio.currentPitch;
        let detectedMidi = 0;
        
        if (freq > 0) {
            const rawMidi = audio.getMidiFromFreq(freq);
            detectedMidi = Math.round(rawMidi);
            const cents = audio.getCentsDeviation(freq);
            
            // Actualizar Afinador Visual
            currentNoteEl.innerText = audio.getNoteName(detectedMidi);
            centsDevEl.innerText = cents;
            
            // Mover aguja (rango visual -50 a +50 cents)
            const needlePos = 50 + (cents); // 50% es el centro
            tunerNeedle.style.left = `${Math.max(0, Math.min(100, needlePos))}%`;

            // Evaluación de colisiones/Afinación (Lógica básica)
            midiEngine.notes.forEach(note => {
                const noteActiveTime = note.time;
                const noteEndTime = note.time + note.duration;
                
                // Si la nota está pasando por la línea de ejecución
                if (currentTime >= noteActiveTime && currentTime <= noteEndTime) {
                    if (detectedMidi === note.midi && Math.abs(cents) < 30) {
                        note.hit = true;
                        score += 10;
                        scoreEl.innerText = score;
                    }
                }
            });
        }

        gfxEngine.drawFrame(currentTime, midiEngine.notes, detectedMidi);
        gameLoopId = requestAnimationFrame(gameLoop);
    }
});