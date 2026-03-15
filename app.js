const HF_API_URL = "https://robinsonof-audio-separator.hf.space/separate";

// ── DOM refs ──
const audioFileInput          = document.getElementById('audioFile');
const uploadText              = document.getElementById('uploadText');
const separateBtn             = document.getElementById('separateBtn');
const uploadProgressSection   = document.getElementById('uploadProgressSection');
const uploadProgressFill      = document.getElementById('uploadProgressFill');
const uploadStatusText        = document.getElementById('uploadStatusText');
const uploadPercent           = document.getElementById('uploadPercent');
const processProgressSection  = document.getElementById('processProgressSection');
const processProgressFill     = document.getElementById('processProgressFill');
const processStatusText       = document.getElementById('processStatusText');
const processPercent          = document.getElementById('processPercent');
const editor                  = document.getElementById('editor');
const heroSection             = document.getElementById('heroSection');
const audioVoz                = document.getElementById('audioVoz');
const audioInstrumental       = document.getElementById('audioInstrumental');

let selectedFile   = null;
let vozBlob        = null;
let instrumentalBlob = null;
let mutedTracks    = { voz: false, instrumental: false };
let soloTrack      = null;
let rafId          = null;
let audioDuration  = 0;

// ── FILE SELECT ──
audioFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

// ── DRAG & DROP ──
const uploadArea = document.getElementById('uploadArea');
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('audio/')) handleFile(file);
});

function handleFile(file) {
  selectedFile = file;
  const sizeMB = (file.size / 1024 / 1024).toFixed(1);
  uploadText.textContent = `✓ ${file.name} · ${sizeMB} MB`;
  separateBtn.disabled = false;
}

// ── SEPARATE ──
separateBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  separateBtn.disabled = true;
  editor.style.display = 'none';

  uploadProgressSection.style.display  = 'flex';
  processProgressSection.style.display = 'none';

  const formData = new FormData();
  formData.append('audio', selectedFile);

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', HF_API_URL);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setProgress(uploadProgressFill, uploadPercent, pct);
        uploadStatusText.textContent = pct < 100 ? 'Uploading...' : '✓ Uploaded';
      }
    });

    const response = await new Promise((resolve, reject) => {
      xhr.onload  = () => resolve(xhr);
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(formData);
    });

    setProgress(uploadProgressFill, uploadPercent, 100);
    uploadStatusText.textContent = '✓ Uploaded';

    processProgressSection.style.display = 'flex';
    await simulateProgress(processProgressFill, processPercent, processStatusText, 'Separating stems...', 0, 95, 3500);

    if (response.status !== 200) throw new Error('Server error ' + response.status);

    const data = JSON.parse(response.responseText);
    setProgress(processProgressFill, processPercent, 100);
    processStatusText.textContent = '✓ Done!';

    vozBlob         = base64ToBlob(data.vocals,       'audio/wav');
    instrumentalBlob = base64ToBlob(data.instrumental, 'audio/wav');

    const vozURL   = URL.createObjectURL(vozBlob);
    const instrURL = URL.createObjectURL(instrumentalBlob);

    audioVoz.src          = vozURL;
    audioInstrumental.src = instrURL;

    document.getElementById('studioFilename').textContent = selectedFile.name;

    await Promise.all([
      drawWaveform(vozURL,   'waveformVoz',          '#a78bfa'),
      drawWaveform(instrURL, 'waveformInstrumental',  '#34d399'),
    ]);

    audioVoz.addEventListener('loadedmetadata', () => {
      audioDuration = audioVoz.duration;
    });

    // Switch view
    heroSection.style.display = 'none';
    editor.style.display      = 'flex';
    startPlayheadLoop();
    separateBtn.disabled = false;

  } catch (err) {
    uploadStatusText.textContent = '✗ ' + err.message;
    separateBtn.disabled = false;
  }
});

// ── MASTER PLAY / STOP ──
function masterPlay() {
  audioVoz.currentTime          = 0;
  audioInstrumental.currentTime = 0;
  if (!mutedTracks.voz)          audioVoz.play();
  if (!mutedTracks.instrumental) audioInstrumental.play();
  document.getElementById('masterPlayBtn').innerHTML =
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg> Pause`;
  document.getElementById('masterPlayBtn').onclick = masterPause;
}

function masterPause() {
  audioVoz.pause();
  audioInstrumental.pause();
  document.getElementById('masterPlayBtn').innerHTML =
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play All`;
  document.getElementById('masterPlayBtn').onclick = masterPlay;
}

function masterStop() {
  audioVoz.pause();
  audioInstrumental.pause();
  audioVoz.currentTime          = 0;
  audioInstrumental.currentTime = 0;
  document.getElementById('masterPlayBtn').innerHTML =
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play All`;
  document.getElementById('masterPlayBtn').onclick = masterPlay;
}

// ── MUTE / SOLO ──
function toggleMute(track) {
  mutedTracks[track] = !mutedTracks[track];
  const audio = track === 'voz' ? audioVoz : audioInstrumental;
  audio.muted = mutedTracks[track];
  document.getElementById('mute' + capitalize(track))
    .classList.toggle('active', mutedTracks[track]);
}

function toggleSolo(track) {
  soloTrack = soloTrack === track ? null : track;
  ['voz', 'instrumental'].forEach(t => {
    const audio = t === 'voz' ? audioVoz : audioInstrumental;
    audio.muted = soloTrack ? t !== soloTrack : mutedTracks[t];
    document.getElementById('solo' + capitalize(t))
      .classList.toggle('active', soloTrack === t);
  });
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── VOLUME ──
function setVolume(track, val) {
  const audio = track === 'voz' ? audioVoz : audioInstrumental;
  audio.volume = parseFloat(val);
}

// ── PLAYHEAD LOOP ──
function startPlayheadLoop() {
  function loop() {
    const cur = audioVoz.currentTime || 0;
    const dur = audioVoz.duration    || 1;
    const pct = (cur / dur) * 100;

    const laneVoz   = document.querySelector('#trackVoz .track-lane');
    const laneInstr = document.querySelector('#trackInstrumental .track-lane');

    if (laneVoz)   document.getElementById('playheadVoz').style.left   = pct + '%';
    if (laneInstr) document.getElementById('playheadInstrumental').style.left = pct + '%';

    // Time display
    document.getElementById('timeDisplay').textContent =
      formatTime(cur) + ' / ' + formatTime(dur);

    rafId = requestAnimationFrame(loop);
  }
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

// ── WAVEFORM ──
async function drawWaveform(url, canvasId, color) {
  const canvas = document.getElementById(canvasId);
  const ctx    = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth  || 800;
  canvas.height = canvas.offsetHeight || 110;

  const audioCtx    = new AudioContext();
  const res         = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const data        = audioBuffer.getChannelData(0);

  const W = canvas.width;
  const H = canvas.height;
  const step = Math.ceil(data.length / W);
  const amp  = H / 2;

  ctx.clearRect(0, 0, W, H);

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,   color + 'cc');
  grad.addColorStop(0.5, color + '88');
  grad.addColorStop(1,   color + '22');

  ctx.fillStyle = grad;

  for (let i = 0; i < W; i++) {
    let min = 1, max = -1;
    for (let j = 0; j < step; j++) {
      const v = data[i * step + j] || 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const y  = (1 + min) * amp;
    const h  = Math.max(1, (max - min) * amp);
    ctx.fillRect(i, y, 1, h);
  }
}

// ── DOWNLOAD ──
function downloadTrack(track, format) {
  const blob = track === 'voz' ? vozBlob : instrumentalBlob;
  if (!blob) return;
  const mimeMap = { mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac' };
  const out = new Blob([blob], { type: mimeMap[format] });
  triggerDownload(out, `${track}_stem.${format}`);
}

function downloadAll() {
  if (vozBlob)          triggerDownload(vozBlob,          'vocals_stem.wav');
  if (instrumentalBlob) triggerDownload(instrumentalBlob, 'instrumental_stem.wav');
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── HELPERS ──
function setProgress(fill, label, pct) {
  fill.style.width    = pct + '%';
  label.textContent   = pct + '%';
}

function simulateProgress(fill, label, statusEl, text, from, to, duration) {
  statusEl.textContent = text;
  return new Promise((resolve) => {
    const steps    = 40;
    const interval = duration / steps;
    const inc      = (to - from) / steps;
    let cur        = from;
    const t = setInterval(() => {
      cur += inc;
      if (cur >= to) { cur = to; clearInterval(t); resolve(); }
      setProgress(fill, label, Math.round(cur));
    }, interval);
  });
}

function base64ToBlob(base64, mime) {
  const bytes = atob(base64);
  const arr   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
