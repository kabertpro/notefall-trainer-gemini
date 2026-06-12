# NOTEFALL TRAINER
**Entrenador de Voz e Instrumentos por Micrófono**

Aplicación web educativa para el entrenamiento de afinación melódica y vocal, desarrollada en HTML5 Canvas y Web Audio API. 

## Características
* **Detección Local:** Utiliza `pitchy.js` (McLeod Pitch Method) para un análisis sin latencia de la voz o instrumentos (Flauta, Violín, Trompeta).
* **Sin Backend:** 100% Client-Side. No envía audios a la nube, respetando la privacidad del estudiante.
* **Parseo MIDI:** Carga de partituras dinámicas gracias a `@tonejs/midi`.

## Instalación y Despliegue (GitHub Pages)
1. Crea un nuevo repositorio en GitHub.
2. Sube todos los archivos (estructura HTML, CSS y JS mencionada).
3. En GitHub, navega a **Settings** > **Pages**.
4. En **Source**, selecciona `main` branch y carpeta `/(root)`.
5. Haz clic en **Save**. En un par de minutos, tu aplicación estará en vivo.

*Nota técnica:* Debido a las políticas de seguridad de los navegadores, la Web Audio API requiere HTTPS (que GitHub Pages proporciona por defecto) y una interacción previa del usuario (clic en "Iniciar Entrenamiento") para solicitar acceso al micrófono.