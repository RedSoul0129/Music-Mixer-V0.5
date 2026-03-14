let audioContext;
let mixes = [];
let mixCounter = 1;

// Variables pour le lecteur
let activeMix = null;
let mainLiveSource = null;
let secLiveSource = null;
let mainLiveGain = null;
let secLiveGain = null;
let isPlaying = false;
let startTime = 0;
let pauseTime = 0;
let animationFrame;

// Fonction pour décoder l'audio
async function loadAudio(file) {
    const arrayBuffer = await file.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
}

// ALGORITHME DE DÉTECTION DE BPM (Estimation basée sur les pics de volume)
function guessBPM(buffer) {
    const data = buffer.getChannelData(0);
    let max = 0;
    for (let i = 0; i < data.length; i++) if (Math.abs(data[i]) > max) max = Math.abs(data[i]);
    
    const threshold = max * 0.8; // Seuil pour détecter un coup fort (beat)
    let peaks = [];
    
    for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > threshold) {
            peaks.push(i);
            i += buffer.sampleRate / 4; // Saute 1/4 de sec pour éviter les doubles détections
        }
    }
    
    if(peaks.length < 2) return 120; // BPM par défaut si introuvable
    
    let intervals = [];
    for(let i=1; i<peaks.length; i++) intervals.push((peaks[i] - peaks[i-1]) / buffer.sampleRate);
    
    let avgInterval = intervals.reduce((a,b)=>a+b, 0) / intervals.length;
    let bpm = Math.round(60 / avgInterval);
    
    // Garde le BPM dans des limites logiques
    while(bpm < 70) bpm *= 2;
    while(bpm > 160) bpm /= 2;
    
    return bpm || 120;
}

// 1. GÉNÉRER LE MIX
document.getElementById('mix-btn').addEventListener('click', async () => {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    const mainFile = document.getElementById('main-audio').files[0];
    const secFile = document.getElementById('sec-audio').files[0];
    const btn = document.getElementById('mix-btn');

    if (!mainFile || !secFile) { alert("Importez les 2 chansons !"); return; }

    btn.innerText = "Analyse des tempos en cours...";
    btn.disabled = true;

    try {
        const mainBuffer = await loadAudio(mainFile);
        const secBuffer = await loadAudio(secFile);

        // Détection Auto
        const mainBpm = guessBPM(mainBuffer);
        const secBpm = guessBPM(secBuffer);
        const ratio = mainBpm / secBpm; // Calcul de synchronisation

        const duration = Math.max(mainBuffer.duration, secBuffer.duration / ratio);

        // Enregistre le mix dans la librairie
        const mix = {
            id: mixCounter++,
            name: `Smart Mix: ${mainFile.name.substring(0,10)}... + ${secFile.name.substring(0,10)}...`,
            mainBuffer, secBuffer, ratio, duration,
            muteStart: parseFloat(document.getElementById('mute-start').value),
            muteEnd: parseFloat(document.getElementById('mute-end').value)
        };
        
        mixes.push(mix);
        updateLibraryUI();
        
        btn.innerText = "Générer le Smart Mix (Auto BPM)";
        btn.disabled = false;
        
    } catch(e) {
        alert("Erreur lors de l'analyse audio.");
        btn.innerText = "Générer le Smart Mix (Auto BPM)";
        btn.disabled = false;
    }
});

// Mettre à jour l'affichage de la librairie
function updateLibraryUI() {
    const list = document.getElementById('mix-list');
    list.innerHTML = "";
    mixes.forEach(mix => {
        const li = document.createElement('li');
        li.innerText = `${mix.name} (${formatTime(mix.duration)})`;
        li.onclick = () => loadMixToPlayer(mix);
        list.appendChild(li);
    });
}

// 2. CHARGER DANS LE LECTEUR DU BAS
function loadMixToPlayer(mix) {
    if(isPlaying) stopPlayback();
    activeMix = mix;
    pauseTime = 0;
    
    document.getElementById('current-mix-name').innerText = mix.name;
    document.getElementById('time-total').innerText = formatTime(mix.duration);
    document.getElementById('time-current').innerText = "0:00";
    document.getElementById('progress-bar').value = 0;
    
    document.getElementById('play-pause-btn').disabled = false;
    document.getElementById('play-pause-btn').innerText = "▶️";
}

// 3. JOUER LE MIX
function startPlayback() {
    if(!activeMix) return;
    
    // Piste Principale
    mainLiveSource = audioContext.createBufferSource();
    mainLiveSource.buffer = activeMix.mainBuffer;
    mainLiveGain = audioContext.createGain();
    mainLiveGain.gain.value = document.getElementById('main-volume').value;
    mainLiveSource.connect(mainLiveGain);
    mainLiveGain.connect(audioContext.destination);

    // Piste Secondaire
    secLiveSource = audioContext.createBufferSource();
    secLiveSource.buffer = activeMix.secBuffer;
    secLiveSource.playbackRate.value = activeMix.ratio; // Applique le Smart BPM
    secLiveGain = audioContext.createGain();
    secLiveSource.connect(secLiveGain);
    secLiveGain.connect(audioContext.destination);

    // Système de coupure (Mute) calculé en direct
    if (!isNaN(activeMix.muteStart) && !isNaN(activeMix.muteEnd) && activeMix.muteEnd > activeMix.muteStart) {
        const now = audioContext.currentTime;
        const start = activeMix.muteStart - pauseTime;
        const end = activeMix.muteEnd - pauseTime;
        
        if(start > 0) {
            secLiveGain.gain.setValueAtTime(1, now + start);
            secLiveGain.gain.setValueAtTime(0, now + start + 0.01);
        } else if (end > 0) {
            secLiveGain.gain.setValueAtTime(0, now); // Déjà en zone muette
        }
        
        if(end > 0) {
            secLiveGain.gain.setValueAtTime(0, now + end);
            secLiveGain.gain.setValueAtTime(1, now + end + 0.01);
        }
    }

    mainLiveSource.start(0, pauseTime);
    secLiveSource.start(0, pauseTime);
    
    isPlaying = true;
    document.getElementById('play-pause-btn').innerText = "⏸️";
    
    // Fait tourner les vinyles
    document.getElementById('vinyl-main').classList.add('playing');
    document.getElementById('vinyl-sec').classList.add('playing');
    
    updateProgress();
}

function stopPlayback() {
    if(mainLiveSource) mainLiveSource.stop();
    if(secLiveSource) secLiveSource.stop();
    isPlaying = false;
    document.getElementById('play-pause-btn').innerText = "▶️";
    
    // Arrête les vinyles
    document.getElementById('vinyl-main').classList.remove('playing');
    document.getElementById('vinyl-sec').classList.remove('playing');
    cancelAnimationFrame(animationFrame);
}

// Bouton Play/Pause
document.getElementById('play-pause-btn').addEventListener('click', () => {
    if(isPlaying) {
        pauseTime += audioContext.currentTime - startTime;
        stopPlayback();
    } else {
        startTime = audioContext.currentTime;
        startPlayback();
    }
});

// Gérer le slider de volume de la piste principale
document.getElementById('main-volume').addEventListener('input', (e) => {
    if (mainLiveGain) mainLiveGain.gain.value = e.target.value;
});

// Mise à jour de la barre de progression
function updateProgress() {
    if(!isPlaying) return;
    const current = audioContext.currentTime - startTime + pauseTime;
    
    if (current >= activeMix.duration) {
        pauseTime = 0;
        stopPlayback();
        document.getElementById('progress-bar').value = 100;
        document.getElementById('time-current').innerText = formatTime(activeMix.duration);
        return;
    }

    document.getElementById('progress-bar').value = (current / activeMix.duration) * 100;
    document.getElementById('time-current').innerText = formatTime(current);
    animationFrame = requestAnimationFrame(updateProgress);
}

// Utilitaire pour formater les secondes en MM:SS
function formatTime(seconds) {
    if(isNaN(seconds)) return "0:00";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
}
