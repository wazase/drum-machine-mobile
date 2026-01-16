const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const buffers = {};
const pads = document.querySelectorAll(".drum-pad");
const uploader = document.getElementById("sampleUploader");
let currentTargetSound = null;

// --- SBLOCCO AUDIO MOBILE ---
const unlockAudio = () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
};
["click", "touchstart"].forEach(evt => window.addEventListener(evt, unlockAudio, { once: true }));

// --- CARICAMENTO CAMPIONI ---
async function loadSample(name) {
    try {
        const response = await fetch(`sounds/${name}.wav`);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        return await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) { console.warn(`Sound ${name} non caricato.`); return null; }
}

async function loadAllSamples() {
    const names = ["kick", "snare", "clap", "rim", "closed_hat", "open_hat", "crash", "perc", "perc2", "tom"];
    for (let name of names) {
        const buf = await loadSample(name);
        if (buf) buffers[name] = buf;
    }
}
loadAllSamples();

// --- GESTIONE UPLOADER (FIX MOBILE) ---
uploader.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file && currentTargetSound) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            buffers[currentTargetSound] = await audioCtx.decodeAudioData(arrayBuffer);
            alert(`Suono caricato per: ${currentTargetSound.toUpperCase()}`);
        } catch(err) { alert("Errore nel caricamento del file."); }
    }
});

// Usiamo 'click' invece di 'pointerdown' per garantire l'apertura dell'uploader su iOS/Android
document.querySelectorAll(".row-label").forEach(label => {
    label.addEventListener("click", (e) => {
        currentTargetSound = label.parentElement.dataset.sound;
        uploader.click();
    });
});

// --- AUDIO ENGINE ---
function playSample(name, velocity = 1, time = 0) {
    const buffer = buffers[name];
    if (!buffer) return;
    const source = audioCtx.createBufferSource();
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = Math.pow(velocity, 2);
    source.buffer = buffer;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(time || audioCtx.currentTime);
}

// --- SEQUENCER LOGIC ---
const NUM_STEPS = 16;
let currentStep = 0;
let isPlaying = false;
let nextNoteTime = 0.0;
let timerID;

function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + 0.1) {
        scheduleNote(currentStep, nextNoteTime);
        advanceNote();
    }
    timerID = setTimeout(scheduler, 25);
}

function scheduleNote(stepIndex, time) {
    const rows = document.querySelectorAll(".seq-row");
    requestAnimationFrame(() => {
        document.querySelectorAll(".step.playhead").forEach(s => s.classList.remove("playhead"));
        rows.forEach(row => {
            const step = row.querySelectorAll(".step")[stepIndex];
            if(step) step.classList.add("playhead");
        });
    });

    rows.forEach(row => {
        const step = row.querySelectorAll(".step")[stepIndex];
        if (step && step.classList.contains("active")) {
            playSample(row.dataset.sound, parseInt(step.dataset.velocity) / 127, time);
            triggerExplosion(row.dataset.sound);
        }
    });
}

function advanceNote() {
    const bpm = parseInt(document.getElementById("bpmInput").value) || 120;
    nextNoteTime += (60.0 / bpm) / 4;
    currentStep = (currentStep + 1) % NUM_STEPS;
}

// --- INTERFACCIA ---
const startBtn = document.getElementById("startStopBtn");
startBtn.addEventListener("click", () => {
    isPlaying = !isPlaying;
    if (isPlaying) {
        currentStep = 0;
        nextNoteTime = audioCtx.currentTime;
        scheduler();
        startBtn.innerText = "STOP";
        startBtn.classList.add("playing");
    } else {
        clearTimeout(timerID);
        startBtn.innerText = "START";
        startBtn.classList.remove("playing");
        document.querySelectorAll(".step.playhead").forEach(s => s.classList.remove("playhead"));
    }
});

document.getElementById("clearBtn").addEventListener("click", () => {
    if(confirm("Vuoi cancellare tutto il pattern?")) {
        document.querySelectorAll(".step").forEach(s => {
            s.classList.remove("active");
            s.dataset.velocity = 100;
            updateStepColor(s);
        });
    }
});

function updateStepColor(step) {
    const vel = parseInt(step.dataset.velocity);
    const index = parseInt(step.dataset.index);
    if (!step.classList.contains("active")) {
        step.style.backgroundColor = (index % 4 === 0) ? "#444" : "#333";
        step.style.boxShadow = "none";
        step.style.filter = "none";
    } else {
        let color = vel < 50 ? "#00bcd4" : vel < 100 ? "#ffeb3b" : "#ff2222";
        step.style.backgroundColor = color;
        step.style.boxShadow = `0 0 ${vel/10}px ${color}`;
        step.style.filter = `brightness(${0.5 + vel/127})`;
    }
}

// --- LOGICA STEP CON VELOCITY SLIDER (MOBILE FRIENDLY) ---
document.querySelectorAll(".seq-row").forEach(row => {
    const container = row.querySelector(".steps");
    for (let i = 0; i < NUM_STEPS; i++) {
        const step = document.createElement("div");
        step.className = i % 4 === 0 ? "step beat-marker" : "step";
        step.dataset.index = i;
        step.dataset.velocity = 100;
        
        let startY, startVel, isDragging = false;

        step.addEventListener("pointerdown", e => {
            e.preventDefault();
            step.releasePointerCapture(e.pointerId); // Fix per alcuni Android
            startY = e.clientY;
            startVel = parseInt(step.dataset.velocity);
            isDragging = false;

            const onMove = moveEvent => {
                const dist = Math.abs(startY - moveEvent.clientY);
                if (dist > 5) { // Se sposti il dito di 5px, diventa drag della velocity
                    isDragging = true;
                    if (!step.classList.contains("active")) step.classList.add("active");
                    let delta = (startY - moveEvent.clientY) * 1.5; // Moltiplicatore sensibilità
                    let newVel = Math.min(127, Math.max(1, startVel + delta));
                    step.dataset.velocity = Math.round(newVel);
                    updateStepColor(step);
                }
            };

            const onUp = () => {
                // Se non c'è stato trascinamento, è un semplice Toggle ON/OFF
                if (!isDragging) {
                    step.classList.toggle("active");
                    updateStepColor(step);
                }
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
            };

            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
        });
        container.appendChild(step);
    }
});

// --- PADS ---
pads.forEach(pad => {
    pad.addEventListener("pointerdown", e => {
        e.preventDefault();
        playSample(pad.dataset.sound);
        pad.classList.add("active");
        setTimeout(() => pad.classList.remove("active"), 100);
    });
});

// --- EXPORT & CANVAS (Sincronizzati) ---
// [Le funzioni bufferToWave, exportBtn listener e animate rimangono quelle del blocco precedente per brevità, sono già ottimizzate]

// --- CANVAS RE-INIT ---
const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
const instrumentColors = { kick: '#69ff52', snare: '#18ffff', clap: '#e040fb', rim: '#b2ff59', closed_hat: '#ffff00', open_hat: '#ffab40', crash: '#ffffff', perc: '#ff4081', perc2: '#7c4dff', tom: '#ff9800' };
let flashColor = { r: 0, g: 0, b: 0, a: 0 };

function triggerExplosion(sound) {
    const hex = instrumentColors[sound] || '#ffffff';
    flashColor = { r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16), a: 0.4 };
}

function animate() {
    ctx.fillStyle = `rgba(0,0,0,0.15)`; // Scia leggermente più lunga
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (flashColor.a > 0) {
        ctx.fillStyle = `rgba(${flashColor.r},${flashColor.g},${flashColor.b},${flashColor.a})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        flashColor.a -= 0.04; // Dissolvenza più rapida per non appesantire il processore
    }
    requestAnimationFrame(animate);
}
window.addEventListener('resize', () => { 
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight; 
});
window.dispatchEvent(new Event('resize'));
animate();
