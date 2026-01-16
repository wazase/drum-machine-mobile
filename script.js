const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const buffers = {};
const pads = document.querySelectorAll(".drum-pad");
const uploader = document.getElementById("sampleUploader");
let currentTargetSound = null;

// Sblocca l'audio su mobile con qualsiasi interazione
["click", "pointerdown", "touchstart"].forEach(evt => {
    window.addEventListener(evt, () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }, { once: true });
});

async function loadSample(name) {
    try {
        const response = await fetch(`sounds/${name}.wav`);
        const arrayBuffer = await response.arrayBuffer();
        return await audioCtx.decodeAudioData(arrayBuffer);
    } catch (error) {
        console.warn(`File non trovato: sounds/${name}.wav`);
    }
}

async function loadAllSamples() {
    const sampleNames = ["kick", "snare", "clap", "rim", "closed_hat", "open_hat", "crash", "perc", "perc2", "tom"];
    for (let name of sampleNames) {
        const buf = await loadSample(name);
        if (buf) buffers[name] = buf;
    }
}
loadAllSamples();

uploader.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file && currentTargetSound) {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        buffers[currentTargetSound] = audioBuffer;
    }
});

function openUploader(soundName) {
    currentTargetSound = soundName;
    uploader.click();
}

document.querySelectorAll(".row-label").forEach(label => {
    label.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const soundName = label.parentElement.dataset.sound;
        openUploader(soundName);
    });
});

function playSample(name, velocity = 1) {
    const buffer = buffers[name];
    if (!buffer) return;
    const source = audioCtx.createBufferSource();
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = velocity * velocity; 
    source.buffer = buffer;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(0);
}

function flashPad(pad) {
    pad.classList.add("active");
    setTimeout(() => pad.classList.remove("active"), 100);
}

// Gestione Pad: pointerdown è universale (mouse e touch)
pads.forEach(pad => {
    pad.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const soundName = pad.dataset.sound;
        playSample(soundName);
        flashPad(pad);
    });
});

document.addEventListener("keydown", (event) => {
    if(event.repeat) return;
    const keyCode = event.key.toUpperCase().charCodeAt(0);
    const pad = Array.from(pads).find(p => Number(p.dataset.key) === keyCode);
    if (pad) {
        playSample(pad.dataset.sound);
        flashPad(pad);
    }
});

const NUM_STEPS = 16;
let currentStep = 0;
let isPlaying = false;
let seqInterval;

function updateStepColor(step) {
    const vel = parseInt(step.dataset.velocity);
    if (!step.classList.contains("active")) {
        const index = parseInt(step.dataset.index);
        step.style.backgroundColor = (index % 4 === 0) ? "#555" : "#444";
        step.style.boxShadow = "0 2px 0 #222";
        return;
    }
    let color = vel < 50 ? "#00bcd4" : vel < 100 ? "#ffeb3b" : "#ff2222ff";
    step.style.backgroundColor = color;
    step.style.boxShadow = `0 0 10px ${color}, 0 2px 0 ${color}`;
}

document.querySelectorAll(".seq-row").forEach(row => {
    const stepsContainer = row.querySelector(".steps");
    stepsContainer.innerHTML = '';

    for (let i = 0; i < NUM_STEPS; i++) {
        const step = document.createElement("div");
        step.classList.add("step");
        step.dataset.index = i;
        step.dataset.velocity = 100;

        // Gestione Mobile: Pressione e Trascinamento per Velocity
        let startY = 0;
        let startVel = 0;

        step.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            startY = e.clientY;
            startVel = parseInt(step.dataset.velocity);

            if (e.shiftKey) {
                let newVel = prompt("Velocity (0-127):", step.dataset.velocity);
                if (newVel !== null) {
                    newVel = Math.min(127, Math.max(0, parseInt(newVel) || 0));
                    step.dataset.velocity = newVel;
                    newVel > 0 ? step.classList.add("active") : step.classList.remove("active");
                }
            } else {
                step.classList.toggle("active");
                if(step.classList.contains("active") && step.dataset.velocity == 0) step.dataset.velocity = 100;
            }
            updateStepColor(step);
            
            // Attiva il tracciamento del movimento solo se lo step è attivo
            if (step.classList.contains("active")) {
                const onPointerMove = (moveEvent) => {
                    const deltaY = startY - moveEvent.clientY;
                    let newVel = startVel + Math.round(deltaY / 2);
                    newVel = Math.min(127, Math.max(1, newVel));
                    step.dataset.velocity = newVel;
                    updateStepColor(step);
                };
                
                const onPointerUp = () => {
                    window.removeEventListener("pointermove", onPointerMove);
                    window.removeEventListener("pointerup", onPointerUp);
                };

                window.addEventListener("pointermove", onPointerMove);
                window.addEventListener("pointerup", onPointerUp);
            }
        });

        // Supporto rotellina ancora presente per desktop
        step.addEventListener("wheel", (e) => {
            e.preventDefault();
            if(!step.classList.contains("active")) return;
            let vel = parseInt(step.dataset.velocity);
            vel += e.deltaY < 0 ? 10 : -10;
            vel = Math.min(127, Math.max(1, vel));
            step.dataset.velocity = vel;
            updateStepColor(step);
        }, { passive: false });

        stepsContainer.appendChild(step);
    }
});

// Logica Play/Stop, Export e Canvas rimane invariata rispetto alla tua versione 
// (Assicurati di includerla qui sotto per far funzionare tutto)

const clearBtn = document.getElementById("clearBtn");
clearBtn.addEventListener("click", () => {
    if(confirm("Vuoi cancellare l'intera sequenza?")) {
        document.querySelectorAll(".step").forEach(step => {
            step.classList.remove("active");
            step.dataset.velocity = 100;
            updateStepColor(step);
        });
    }
});

function sequencerTick() {
    const rows = document.querySelectorAll(".seq-row");
    document.querySelectorAll(".step.playhead").forEach(s => s.classList.remove("playhead"));
    rows.forEach(row => {
        const soundName = row.dataset.sound;
        const steps = row.querySelectorAll(".step");
        const step = steps[currentStep];
        step.classList.add("playhead");
        if (step.classList.contains("active")) {
            const vel = parseInt(step.dataset.velocity) / 127;
            playSample(soundName, vel);
            triggerExplosion(soundName); 
        }
    });
    currentStep = (currentStep + 1) % NUM_STEPS;
}

const startBtn = document.getElementById("startStopBtn");
function togglePlay() {
    isPlaying = !isPlaying;
    if (isPlaying) {
        const bpm = parseInt(document.getElementById("bpmInput").value);
        const interval = (60000 / bpm) / 4;
        seqInterval = setInterval(sequencerTick, interval);
        startBtn.innerText = "STOP";
        startBtn.style.background = "#ff9800";
    } else {
        clearInterval(seqInterval);
        startBtn.innerText = "START";
        startBtn.style.background = "#d32f2f";
    }
}
startBtn.addEventListener("click", togglePlay);

document.getElementById("bpmInput").addEventListener("change", function() {
    if(isPlaying) {
        clearInterval(seqInterval);
        const bpm = parseInt(this.value);
        const interval = (60000 / bpm) / 4;
        seqInterval = setInterval(sequencerTick, interval);
    }
});

// --- EXPORT E CANVAS --- (Logica esistente già ottimizzata)
const exportBtn = document.getElementById("exportBtn");
exportBtn.addEventListener("click", async () => {
    if (Object.keys(buffers).length === 0) return;
    const originalText = exportBtn.innerText;
    exportBtn.innerText = "rendering...";
    try { await renderAndExport(); } catch (err) { console.error(err); }
    finally { exportBtn.innerText = originalText; }
});

async function renderAndExport() {
    const bpm = parseInt(document.getElementById("bpmInput").value);
    const secondsPerStep = (60 / bpm) / 4;
    const TOTAL_LOOPS = 4;
    const totalDuration = secondsPerStep * 16 * TOTAL_LOOPS;
    const offlineCtx = new OfflineAudioContext(2, 44100 * totalDuration, 44100);
    const rows = document.querySelectorAll(".seq-row");
    for (let loop = 0; loop < TOTAL_LOOPS; loop++) {
        const loopOffset = loop * (secondsPerStep * 16);
        rows.forEach(row => {
            const soundName = row.dataset.sound;
            const buffer = buffers[soundName];
            if (!buffer) return;
            const steps = row.querySelectorAll(".step");
            steps.forEach((step, index) => {
                if (step.classList.contains("active")) {
                    const time = loopOffset + (index * secondsPerStep);
                    const source = offlineCtx.createBufferSource();
                    const gainNode = offlineCtx.createGain();
                    source.buffer = buffer;
                    gainNode.gain.value = Math.pow(parseInt(step.dataset.velocity) / 127, 2);
                    source.connect(gainNode);
                    gainNode.connect(offlineCtx.destination);
                    source.start(time);
                }
            });
        });
    }
    const renderedBuffer = await offlineCtx.startRendering();
    const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);
    const url = URL.createObjectURL(wavBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `beat_${bpm}bpm.wav`;
    link.click();
}

function bufferToWave(abuffer, len) {
    let numOfChan = abuffer.numberOfChannels, length = len * numOfChan * 2 + 44, buffer = new ArrayBuffer(length), view = new DataView(buffer),
        channels = [], i, sample, offset = 0, pos = 0;
    const setUint32 = (data) => { view.setUint32(offset, data, true); offset += 4; };
    const setUint16 = (data) => { view.setUint16(offset, data, true); offset += 2; };
    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
    setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
    setUint32(abuffer.sampleRate); setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - offset - 4);
    for(i = 0; i < numOfChan; i++) channels.push(abuffer.getChannelData(i));
    while(pos < len) {
        for(i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][pos]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0;
            view.setInt16(offset, sample, true); offset += 2;
        }
        pos++;
    }
    return new Blob([buffer], { type: "audio/wav" });
}

const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const instrumentColors = {
    'kick': '#69ff52ff', 'snare': '#18ffff', 'clap': '#e040fb', 'rim': '#b2ff59',
    'closed_hat': '#ffff00', 'open_hat': '#ffab40', 'crash': '#ffffff', 'perc': '#ff4081', 'perc2': '#7c4dff','tom': '#ff9800'
};

let flashColor = { r: 0, g: 0, b: 0, alpha: 0 };
function triggerExplosion(soundName) {
    const hex = instrumentColors[soundName] || '#ffffff';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    flashColor = { r, g, b, alpha: 0.6 };
}

function animate() {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (flashColor.alpha > 0) {
        ctx.fillStyle = `rgba(${flashColor.r}, ${flashColor.g}, ${flashColor.b}, ${flashColor.alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        flashColor.alpha -= 0.05; 
    }
    requestAnimationFrame(animate);
}
animate();