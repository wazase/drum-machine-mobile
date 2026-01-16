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
        const arrayBuffer = await response.arrayBuffer();
        return await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) { console.warn(`Sound ${name} non trovato.`); }
}

async function loadAllSamples() {
    const names = ["kick", "snare", "clap", "rim", "closed_hat", "open_hat", "crash", "perc", "perc2", "tom"];
    for (let name of names) {
        const buf = await loadSample(name);
        if (buf) buffers[name] = buf;
    }
}
loadAllSamples();

// --- GESTIONE UPLOADER ---
uploader.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file && currentTargetSound) {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        buffers[currentTargetSound] = audioBuffer;
    }
});

document.querySelectorAll(".row-label").forEach(label => {
    label.addEventListener("pointerdown", (e) => {
        e.preventDefault();
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
        rows.forEach(row => row.querySelectorAll(".step")[stepIndex].classList.add("playhead"));
    });

    rows.forEach(row => {
        const step = row.querySelectorAll(".step")[stepIndex];
        if (step.classList.contains("active")) {
            playSample(row.dataset.sound, parseInt(step.dataset.velocity) / 127, time);
            triggerExplosion(row.dataset.sound);
        }
    });
}

function advanceNote() {
    const bpm = parseInt(document.getElementById("bpmInput").value);
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
        startBtn.style.background = "#ff9800";
    } else {
        clearTimeout(timerID);
        startBtn.innerText = "START";
        startBtn.style.background = "#d32f2f";
        document.querySelectorAll(".step.playhead").forEach(s => s.classList.remove("playhead"));
    }
});

document.getElementById("clearBtn").addEventListener("click", () => {
    if(confirm("Cancellare tutto?")) {
        document.querySelectorAll(".step").forEach(s => {
            s.classList.remove("active");
            s.dataset.velocity = 100;
            updateStepColor(s);
        });
    }
});

function updateStepColor(step) {
    const vel = parseInt(step.dataset.velocity);
    if (!step.classList.contains("active")) {
        step.style.backgroundColor = (parseInt(step.dataset.index) % 4 === 0) ? "#555" : "#444";
        step.style.boxShadow = "0 2px 0 #222";
    } else {
        let color = vel < 50 ? "#00bcd4" : vel < 100 ? "#ffeb3b" : "#ff2222";
        step.style.backgroundColor = color;
        step.style.boxShadow = `0 0 10px ${color}, 0 2px 0 ${color}`;
    }
}

// --- INIZIALIZZAZIONE SEQUENCER ROWS ---
document.querySelectorAll(".seq-row").forEach(row => {
    const container = row.querySelector(".steps");
    for (let i = 0; i < NUM_STEPS; i++) {
        const step = document.createElement("div");
        step.className = i % 4 === 0 ? "step beat-marker" : "step";
        step.dataset.index = i;
        step.dataset.velocity = 100;
        
        let startY, startVel;
        step.addEventListener("pointerdown", e => {
            e.preventDefault();
            startY = e.clientY;
            startVel = parseInt(step.dataset.velocity);
            step.classList.toggle("active");
            updateStepColor(step);

            const onMove = moveEvent => {
                if (!step.classList.contains("active")) return;
                let newVel = startVel + Math.round((startY - moveEvent.clientY) / 2);
                step.dataset.velocity = Math.min(127, Math.max(1, newVel));
                updateStepColor(step);
            };
            const onUp = () => {
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

// --- EXPORT WAV ---
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

document.getElementById("exportBtn").addEventListener("click", async () => {
    const btn = document.getElementById("exportBtn");
    btn.innerText = "WAIT...";
    const bpm = parseInt(document.getElementById("bpmInput").value);
    const stepTime = (60 / bpm) / 4;
    const offCtx = new OfflineAudioContext(2, 44100 * stepTime * 16 * 4, 44100);
    
    document.querySelectorAll(".seq-row").forEach(row => {
        const buf = buffers[row.dataset.sound];
        if (!buf) return;
        row.querySelectorAll(".step").forEach((step, i) => {
            if (step.classList.contains("active")) {
                for (let loop = 0; loop < 4; loop++) {
                    const src = offCtx.createBufferSource();
                    const gain = offCtx.createGain();
                    src.buffer = buf;
                    gain.gain.value = Math.pow(parseInt(step.dataset.velocity)/127, 2);
                    src.connect(gain); gain.connect(offCtx.destination);
                    src.start((i * stepTime) + (loop * stepTime * 16));
                }
            }
        });
    });

    const rendered = await offCtx.startRendering();
    const url = URL.createObjectURL(bufferToWave(rendered, rendered.length));
    const a = document.createElement("a"); a.href = url; a.download = "beat.wav"; a.click();
    btn.innerText = "SAVE";
});

// --- CANVAS VISUALIZER ---
const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
const instrumentColors = { kick: '#69ff52', snare: '#18ffff', clap: '#e040fb', rim: '#b2ff59', closed_hat: '#ffff00', open_hat: '#ffab40', crash: '#ffffff', perc: '#ff4081', perc2: '#7c4dff', tom: '#ff9800' };
let flashColor = { r: 0, g: 0, b: 0, a: 0 };

function triggerExplosion(sound) {
    const hex = instrumentColors[sound] || '#ffffff';
    flashColor = { r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16), a: 0.5 };
}

function animate() {
    ctx.fillStyle = `rgba(0,0,0,0.2)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (flashColor.a > 0) {
        ctx.fillStyle = `rgba(${flashColor.r},${flashColor.g},${flashColor.b},${flashColor.a})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        flashColor.a -= 0.02;
    }
    requestAnimationFrame(animate);
}
window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
window.dispatchEvent(new Event('resize'));
animate();
