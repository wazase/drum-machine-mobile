/**
 * MK-808 PROFESSIONAL AUDIO ENGINE & INTERFACE CONTROL
 * Optimized for Mobile Web Audio API
 */

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const buffers = {};
const pads = document.querySelectorAll(".drum-pad");
const uploader = document.getElementById("sampleUploader");
let currentTargetSound = null;

// --- STATE MANAGEMENT ---
const NUM_STEPS = 16;
let currentStep = 0;
let isPlaying = false;
let nextNoteTime = 0.0;
let timerID = null;
const instrumentNames = ["kick", "snare", "clap", "rim", "closed_hat", "open_hat", "crash", "perc", "perc2", "tom"];

// --- AUDIO INITIALIZATION ---
const unlockAudio = async () => {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const source = audioCtx.createBufferSource();
    source.buffer = audioCtx.createBuffer(1, 1, 22050);
    source.connect(audioCtx.destination);
    source.start(0);
};

// Sblocco globale al primo tocco
window.addEventListener('touchstart', unlockAudio, { once: true, passive: false });

async function loadSample(name) {
    try {
        const response = await fetch(`sounds/${name}.wav`);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        return await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) { return null; }
}

(async function init() {
    for (let name of instrumentNames) {
        const buf = await loadSample(name);
        if (buf) buffers[name] = buf;
    }
})();

// --- UPLOADER LOGIC ---
uploader.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file && currentTargetSound) {
        const arrayBuffer = await file.arrayBuffer();
        audioCtx.decodeAudioData(arrayBuffer, (decoded) => {
            buffers[currentTargetSound] = decoded;
        });
    }
});

document.querySelectorAll(".row-label").forEach(label => {
    label.addEventListener("click", (e) => {
        currentTargetSound = label.parentElement.dataset.sound;
        uploader.click();
    });
});

// --- ENGINE CORE ---
function playSample(name, velocity = 1, time = 0) {
    const buffer = buffers[name];
    if (!buffer) return;
    const source = audioCtx.createBufferSource();
    const gainNode = audioCtx.createGain();
    
    // Curva di potenza logaritmica (più naturale per l'orecchio umano)
    gainNode.gain.value = Math.pow(velocity, 2);
    
    source.buffer = buffer;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(time || audioCtx.currentTime);
}

function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + 0.1) {
        scheduleNote(currentStep, nextNoteTime);
        const bpm = parseInt(document.getElementById("bpmInput").value) || 120;
        nextNoteTime += (60.0 / bpm) / 4;
        currentStep = (currentStep + 1) % NUM_STEPS;
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
            const v = parseInt(step.dataset.velocity) / 127;
            playSample(row.dataset.sound, v, time);
            triggerExplosion(row.dataset.sound);
        }
    });
}

// --- INTERFACE INTERACTIONS ---
const startBtn = document.getElementById("startStopBtn");
startBtn.addEventListener("click", () => {
    isPlaying = !isPlaying;
    if (isPlaying) {
        currentStep = 0;
        nextNoteTime = audioCtx.currentTime;
        scheduler();
        startBtn.innerText = "STOP";
        startBtn.style.backgroundColor = "#ff9800";
    } else {
        clearTimeout(timerID);
        startBtn.innerText = "START";
        startBtn.style.backgroundColor = "#d32f2f";
        document.querySelectorAll(".step.playhead").forEach(s => s.classList.remove("playhead"));
    }
});

function updateStepColor(step) {
    const vel = parseInt(step.dataset.velocity);
    if (!step.classList.contains("active")) {
        const index = parseInt(step.dataset.index);
        step.style.backgroundColor = (index % 4 === 0) ? "#444" : "#2a2a2a";
        step.style.boxShadow = "none";
    } else {
        const color = vel < 50 ? "#00bcd4" : vel < 100 ? "#ffeb3b" : "#ff2222";
        step.style.backgroundColor = color;
        step.style.boxShadow = `0 0 ${vel/10}px ${color}`;
    }
}

// --- SMART GESTURE LOGIC (THE "CORE" OF STABILITY) ---
document.querySelectorAll(".seq-row").forEach(row => {
    const container = row.querySelector(".steps");
    for (let i = 0; i < NUM_STEPS; i++) {
        const step = document.createElement("div");
        step.className = i % 4 === 0 ? "step beat-marker" : "step";
        step.dataset.index = i;
        step.dataset.velocity = 100;

        let startY, startX, startVel, mode = null; // mode: 'drag' | 'scroll'

        step.addEventListener("pointerdown", e => {
            startY = e.clientY;
            startX = e.clientX;
            startVel = parseInt(step.dataset.velocity);
            mode = null;
            step.setPointerCapture(e.pointerId);
        });

        step.addEventListener("pointermove", e => {
            if (!step.hasPointerCapture(e.pointerId)) return;

            const dx = Math.abs(e.clientX - startX);
            const dy = Math.abs(e.clientY - startY);

            // Analisi direzione movimento
            if (!mode && (dx > 5 || dy > 5)) {
                mode = dy > dx ? 'drag' : 'scroll';
            }

            if (mode === 'drag') {
                e.preventDefault();
                if (!step.classList.contains("active")) step.classList.add("active");
                const diff = startY - e.clientY;
                const newVel = Math.min(127, Math.max(1, startVel + diff));
                step.dataset.velocity = Math.round(newVel);
                updateStepColor(step);
            }
        });

        step.addEventListener("pointerup", e => {
            if (mode !== 'drag') {
                step.classList.toggle("active");
                updateStepColor(step);
            }
            step.releasePointerCapture(e.pointerId);
            mode = null;
        });

        container.appendChild(step);
    }
});

// Pads
pads.forEach(pad => {
    pad.addEventListener("pointerdown", e => {
        playSample(pad.dataset.sound);
        pad.classList.add("active");
        setTimeout(() => pad.classList.remove("active"), 100);
    });
});

// --- EXPORT & VISUALS ---
document.getElementById("clearBtn").addEventListener("click", () => {
    if(confirm("Cancella tutto il pattern?")) {
        document.querySelectorAll(".step").forEach(s => {
            s.classList.remove("active");
            s.dataset.velocity = 100;
            updateStepColor(s);
        });
    }
});

// 

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
    btn.innerText = "WAIT";
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
    const a = document.createElement("a"); a.href = url; a.download = "mk808_beat.wav"; a.click();
    btn.innerText = "SAVE";
});

// --- CANVAS VISUALS ---
const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
const instrumentColors = { kick: '#69ff52', snare: '#18ffff', clap: '#e040fb', rim: '#b2ff59', closed_hat: '#ffff00', open_hat: '#ffab40', crash: '#ffffff', perc: '#ff4081', perc2: '#7c4dff', tom: '#ff9800' };
let flashColor = { r: 0, g: 0, b: 0, a: 0 };

function triggerExplosion(sound) {
    const hex = instrumentColors[sound] || '#ffffff';
    flashColor = { r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16), a: 0.4 };
}

function animate() {
    ctx.fillStyle = `rgba(0,0,0,0.2)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (flashColor.a > 0) {
        ctx.fillStyle = `rgba(${flashColor.r},${flashColor.g},${flashColor.b},${flashColor.a})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        flashColor.a -= 0.05;
    }
    requestAnimationFrame(animate);
}

window.addEventListener('resize', () => { 
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight; 
});
window.dispatchEvent(new Event('resize'));
animate();
