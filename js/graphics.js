class GraphicsEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.pixelsPerSecond = 200; // Velocidad de caída
        this.playheadY = this.canvas.height * 0.8; // Línea de ejecución
        this.minMidi = 48; // C3
        this.maxMidi = 84; // C6
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.playheadY = this.canvas.height * 0.8;
    }

    drawFrame(currentTime, notes, currentDetectedMidi) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Dibujar línea de ejecución
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.playheadY);
        this.ctx.lineTo(this.canvas.width, this.playheadY);
        this.ctx.strokeStyle = "rgba(102, 252, 241, 0.5)"; // Neon Blue
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        const noteWidth = this.canvas.width / (this.maxMidi - this.minMidi + 1);

        // Dibujar Notas
        notes.forEach(note => {
            if (note.midi < this.minMidi || note.midi > this.maxMidi) return;

            const yPos = this.playheadY - ((note.time - currentTime) * this.pixelsPerSecond);
            const height = note.duration * this.pixelsPerSecond;
            const xPos = (note.midi - this.minMidi) * noteWidth;

            // No dibujar si ya pasó mucho la pantalla
            if (yPos > this.canvas.height || yPos + height < 0) return;

            this.ctx.fillStyle = note.hit ? "var(--perfect-gold)" : (note.missed ? "var(--dark-grey)" : "var(--neon-green)");
            this.ctx.fillRect(xPos, yPos - height, noteWidth - 2, height);
            
            // Brillo
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = this.ctx.fillStyle;
        });
        
        this.ctx.shadowBlur = 0; // reset

        // Dibujar posición de la voz/instrumento actual
        if (currentDetectedMidi > 0) {
            const currentX = (currentDetectedMidi - this.minMidi) * noteWidth;
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
            this.ctx.beginPath();
            this.ctx.arc(currentX + noteWidth/2, this.playheadY, noteWidth/2, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
}