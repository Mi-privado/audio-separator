const HF_API_URL = "https://robinsonof-audio-separator.hf.space/separate";

// ── DOM ──
const audioFileInput         = document.getElementById('audioFile');
const uploadText             = document.getElementById('uploadText');
const separateBtn            = document.getElementById('separateBtn');
const uploadProgressSection  = document.getElementById('uploadProgressSection');
const uploadProgressFill     = document.getElementById('uploadProgressFill');
const uploadStatusText       = document.getElementById('uploadStatusText');
const uploadPercent          = document.getElementById('uploadPercent');
const processProgressSection = document.getElementById('processProgressSection');
const processProgressFill    = document.getElementById('processProgressFill');
const processStatusText      = document.getElementById('processStatusText');
const processPercent         = document.getElementById('processPercent');
const uploadScreen           = document.getElementById('uploadScreen');
const studioScreen           = document.getElementById('studioScreen');
const audioVoz               = document.getElementById('audioVoz');
const audioInstrumental      = document.getElementById('audioInstrumental');

let selectedFile     = null;
let vozBlob          = null;
let instrumentalBlob = null;
let mutedTracks      = { voz: false, instrumental: false };
let soloTrack        = null;
let isPlaying        = false;
let loopEnabled      = false;
let rafId            = null;

// ── FILE SELECT ──
audioFileInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) handleFile(f);
});

// ── DRAG & DROP ──
const uploadArea = document.getElementById('uploadArea');
uploadArea.addEventListener('dragover',  e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', ()  => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('audio/')) handleFile(f);
});

function handleFile(file) {
  selectedFile = file;
  const mb = (file.size / 1024 / 1024).toFixed(1);
  uploadText.textContent = `✓  ${file.name}  ·  ${mb} MB`;
  separateBtn.disabled = false;
}

// ── SEPARATE ──
separateBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  separateBtn.disabled = true;

  uploadProgressSection.style.display  = 'flex';
  processProgressSection.style.display = 'none';

  // ✅ FIX: el campo debe llamarse 'file', no 'audio'
  const formData = new FormData();
  formData.append('file', selectedFile, selectedFile.name);

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', HF_API_URL);

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setProgress(uploadProgressFill, uploadPercent, pct);
        uploadStatusText.textContent = pct < 100 ? 'Uploading…' : '✓ Uploaded';
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
    await simulateProgress(processProgressFill, processPercent, processStatusText, 'Separating stems…', 0, 95, 3500);

    if (response.status !== 200) throw new Error('Server error ' + response.status);

    const data = JSON.parse(response.responseText);
    setProgress(processProgressFill, processPercent, 100);
    processStatusText.textContent = '✓ Done!';

    // ✅ Backend devuelve base64 directo en data.vocals y data.instrumental
    vozBlob          = base64ToBlob(data.vocals,       'audio/wav');
    instrumentalBlob = base64ToBlob(data.instrumental, 'audio/wav');

    const vozURL   = URL.createObjectURL(vozBlob);
    const instrURL = URL.createObjectURL(instrumentalBlob);

    audioVoz.src          = vozURL;
    audioInstrumental.src = instrURL;

    document.getElementById('topFilename').textContent = selectedFile.name;

    uploadScreen.style.display = 'none';
    studioScreen.style.display = 'flex';

    requestAnimationFrame(async () => {
      await Promise.all([
        drawWaveform(vozURL,   'waveformVoz',          '#00e5cc'),
        drawWaveform(instrURL, 'waveformInstrumental', '#00bfad'),
      ]);
      buildTimeline();
      startLoop();
    });

    separateBtn.disabled = false;

  } catch (err) {
    uploadStatusText.textContent = '✗ ' + err.message;
    console.error(err);
    separateBtn.disabled = false;
  }
});

// ── BACK ──
function backToUpload() {
  masterStop();
  studioScreen.style.display = 'none';
  uploadScreen.style.display = 'flex';
}

// ── PLAY / PAUSE / STOP ──
function togglePlay() {
  isPlaying ? masterPause() : masterPlay();
}

function masterPlay() {
  if (!mutedTracks.voz)          audioVoz.play();
  if (!mutedTracks.instrumental) audioInstrumental.play();
  isPlaying = true;
  document.getElementById('playIcon').innerHTML = '<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>';
}

function masterPause() {
  audioVoz.pause();
  audioInstrumental.pause();
  isPlaying = false;
  document.getElementById('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
}

function masterStop() {
  audioVoz.pause();
  audioInstrumental.pause();
  audioVoz.currentTime = 0;
  audioInstrumental.currentTime = 0;
  isPlaying = false;
  document.getElementById('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
}

function skipBackward() {
  audioVoz.currentTime          = Math.max(0, audioVoz.currentTime - 5);
  audioInstrumental.currentTime = audioVoz.currentTime;
}

function skipForward() {
  audioVoz.currentTime          = Math.min(audioVoz.duration || 0, audioVoz.currentTime + 5);
  audioInstrumental.currentTime = audioVoz.currentTime;
}

function toggleLoop() {
  loopEnabled = !loopEnabled;
  audioVoz.loop          = loopEnabled;
  audioInstrumental.loop = loopEnabled;
  document.getElementById('loopBtn').classList.toggle('loop-active', loopEnabled);
}

// ── SEEK ──
function seekTo(e) {
  const area = document.getElementById('tracksArea');
  const rect = area.getBoundingClientRect();
  const pct  = (e.clientX - rect.left) / rect.width;
  const dur  = audioVoz.duration || 0;
  const t    = pct * dur;
  audioVoz.currentTime          = t;
  audioInstrumental.currentTime = t;
}

// ── MUTE / SOLO ──
function toggleMute(track) {
  mutedTracks[track] = !mutedTracks[track];
  const audio = track === 'voz' ? audioVoz : audioInstrumental;
  audio.muted = mutedTracks[track];
  document.getElementById('mute' + cap(track)).classList.toggle('active', mutedTracks[track]);
}

function toggleSolo(track) {
  soloTrack = soloTrack === track ? null : track;
  ['voz', 'instrumental'].forEach(t => {
    const audio = t === 'voz' ? audioVoz : audioInstrumental;
    audio.muted = soloTrack ? t !== soloTrack : mutedTracks[t];
    document.getElementById('solo' + cap(t)).classList.toggle('active', soloTrack === t);
  });
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── VOLUME ──
function setVolume(track, val) {
  (track === 'voz' ? audioVoz : audioInstrumental).volume = parseFloat(val);
}

// ── PLAYHEAD LOOP ──
function startLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  function tick() {
    const cur = audioVoz.currentTime || 0;
    const dur = audioVoz.duration    || 1;
    const pct = (cur / dur) * 100;
    document.getElementById('playhead').style.left = pct + '%';
    document.getElementById('timeDisplay').textContent = fmt(cur) + ' / ' + fmt(dur);
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
}

// ── TIMELINE RULER ──
function buildTimeline() {
  const tl  = document.getElementById('timeline');
  const dur = audioVoz.duration || 60;
  tl.innerHTML = '';
  const step = dur > 120 ? 30 : dur > 60 ? 15 : dur > 30 ? 10 : 5;
  for (let t = 0; t <= dur; t += step) {
    const pct  = (t / dur) * 100;
    const mark = document.createElement('div');
    mark.style.cssText = `
      position:absolute; left:${pct}%; top:0;
      height:100%; border-left:1px solid #333;
      padding-left:4px; font-size:0.65rem;
      color:#555; display:flex; align-items:center;
      pointer-events:none; user-select:none;
    `;
    mark.textContent = fmt(t);
    tl.appendChild(mark);
  }
}

// ── WAVEFORM ──
async function drawWaveform(url, canvasId, color) {
  const canvas = document.getElementById(canvasId);
  const ctx    = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth  || 1000;
  canvas.height = canvas.offsetHeight || 90;

  const audioCtx = new AudioContext();
  const res      = await fetch(url);
  const buf      = await res.arrayBuffer();
  const decoded  = await audioCtx.decodeAudioData(buf);
  const data     = decoded.getChannelData(0);

  const W    = canvas.width;
  const H    = canvas.height;
  const step = Math.ceil(data.length / W);
  const amp  = H / 2;

  ctx.clearRect(0, 0, W, H);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,    color + 'ff');
  grad.addColorStop(0.45, color + 'dd');
  grad.addColorStop(1,    color + '44');
  ctx.fillStyle = grad;

  for (let i = 0; i < W; i++) {
    let min = 1, max = -1;
    for (let j = 0; j < step; j++) {
      const v = data[i * step + j] || 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const y = (1 + min) * amp;
    const h = Math.max(1, (max - min) * amp);
    ctx.fillRect(i, y, 1, h);
  }
}

// ── DOWNLOAD ──
function downloadTrack(track) {
  const blob     = track === 'voz' ? vozBlob : instrumentalBlob;
  const filename = track === 'voz' ? 'vocals.wav' : 'instrumental.wav';
  if (!blob) return;
  const a = document.createElement('a');
  a.href  = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ── BASE64 → BLOB ──
function base64ToBlob(b64, mime) {
  const bin  = atob(b64);
  const arr  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ── PROGRESS HELPERS ──
function setProgress(fill, percentEl, value) {
  fill.style.width        = value + '%';
  percentEl.textContent   = value + '%';
}

async function simulateProgress(fill, percentEl, statusEl, msg, from, to, duration) {
  statusEl.textContent = msg;
  const steps    = 40;
  const interval = duration / steps;
  const increment = (to - from) / steps;
  let current = from;
  return new Promise(resolve => {
    const id = setInterval(() => {
      current += increment;
      if (current >= to) {
        setProgress(fill, percentEl, to);
        clearInterval(id);
        resolve();
      } else {
        setProgress(fill, percentEl, Math.round(current));
      }
    }, interval);
  });
}
