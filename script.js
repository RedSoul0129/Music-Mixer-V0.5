let audioContext;
let mainSource;
let secSource;

// Prévisualisation des fichiers importés
document.getElementById('main-audio').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) document.getElementById('main-preview').src = URL.createObjectURL(file);
});

document.getElementById('sec-audio').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) document.getElementById('sec-preview').src = URL.createObjectURL(file);
});

// Fonction pour lire les fichiers en tant que tampons audio (AudioBuffers)
async function loadAudio(file) {
    const arrayBuffer = await file.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
}

document.getElementById('mix-btn').addEventListener('click', async () => {
    // Initialiser le contexte audio au clic (sécurité des navigateurs)
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const mainFile = document.getElementById('main-audio').files[0];
    const secFile = document.getElementById('sec-audio').files[0];

    if (!mainFile || !secFile) {
        alert("Veuillez importer les deux chansons !");
        return;
    }

    // Arrêter la lecture en cours s'il y en a une
    if (mainSource) mainSource.stop();
    if (secSource) secSource.stop();

    const mainBuffer = await loadAudio(mainFile);
    const secBuffer = await loadAudio(secFile);

    // Configurer la piste principale
    mainSource = audioContext.createBufferSource();
    mainSource.buffer = mainBuffer;
    mainSource.connect(audioContext.destination);

    // Configurer la piste secondaire
    secSource = audioContext.createBufferSource();
    secSource.buffer = secBuffer;

    // --- SMART BPM MATCHER ---
    const mainBpm = parseFloat(document.getElementById('main-bpm').value);
    const secBpm = parseFloat(document.getElementById('sec-bpm').value);
    
    if (mainBpm && secBpm) {
        // Calcule le ratio. Ex: Principale 120, Secondaire 100 -> Ratio 1.2 (joue 20% plus vite)
        const playbackRatio = mainBpm / secBpm;
        secSource.playbackRate.value = playbackRatio;
    }

    // --- SYSTÈME DE MUTE (COUPURE) ---
    const gainNode = audioContext.createGain();
    secSource.connect(gainNode);
    gainNode.connect(audioContext.destination);

    const muteStart = parseFloat(document.getElementById('mute-start').value);
    const muteEnd = parseFloat(document.getElementById('mute-end').value);

    // Si l'utilisateur a entré des valeurs de mute
    if (!isNaN(muteStart) && !isNaN(muteEnd) && muteEnd > muteStart) {
        const currentTime = audioContext.currentTime;
        // Le son est à 1 (normal) jusqu'au début du mute
        gainNode.gain.setValueAtTime(1, currentTime);
        // Baisse à 0 instantanément au temps de début
        gainNode.gain.setValueAtTime(0, currentTime + muteStart);
        // Remonte à 1 à la fin du mute
        gainNode.gain.setValueAtTime(1, currentTime + muteEnd);
    }

    // Lancer les deux musiques en même temps
    mainSource.start(0);
    secSource.start(0);
});

document.getElementById('stop-btn').addEventListener('click', () => {
    if (mainSource) mainSource.stop();
    if (secSource) secSource.stop();
});