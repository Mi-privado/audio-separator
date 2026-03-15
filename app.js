const HF_API_URL = "const HF_API_URL = "https://robinsonof-audio-separator.hf.space/separate";
";
// ☝️ Reemplaza con tu URL de Hugging Face Spaces

const audioFile    = document.getElementById('audioFile');
const uploadText   = document.getElementById('uploadText');
const separateBtn  = document.getElementById('separateBtn');
const status       = document.getElementById('status');
const progressFill = document.getElementById('progressFill');
const progressBar  = document.getElementById('progressBar');
const results      = document.getElementById('results');

let selectedFile = null;

audioFile.addEventListener('change', (e) => {
  selectedFile = e.target.files[0];
  if (selectedFile) {
    uploadText.textContent = `✅ ${selectedFile.name}`;
    separateBtn.disabled = false;
  }
});

separateBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  setStatus('⏳ Enviando audio al servidor...');
  showProgress(20);
  separateBtn.disabled = true;
  results.classList.add('hidden');

  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    setStatus('🤖 Demucs está procesando tu canción...');
    showProgress(50);

    const response = await fetch(HF_API_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error(`Error del servidor: ${response.status}`);

    showProgress(85);
    setStatus('📦 Descargando resultados...');

    const data = await response.json();
    // Espera: { vocals: "base64...", instrumental: "base64..." }

    showProgress(100);
    renderResults(data);

  } catch (err) {
    setStatus(`❌ Error: ${err.message}`);
    console.error(err);
  } finally {
    separateBtn.disabled = false;
  }
});

function renderResults(data) {
  const vocalsBlob        = base64ToBlob(data.vocals, 'audio/wav');
  const instrumentalBlob  = base64ToBlob(data.instrumental, 'audio/wav');

  const vocalsURL         = URL.createObjectURL(vocalsBlob);
  const instrumentalURL   = URL.createObjectURL(instrumentalBlob);

  document.getElementById('vocalsAudio').src          = vocalsURL;
  document.getElementById('instrumentalAudio').src    = instrumentalURL;
  document.getElementById('vocalsDownload').href      = vocalsURL;
  document.getElementById('instrumentalDownload').href = instrumentalURL;

  results.classList.remove('hidden');
  setStatus('✅ ¡Listo! Escucha o descarga tus pistas.');
}

function base64ToBlob(base64, mimeType) {
  const bytes = atob(base64);
  const arr   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

function setStatus(msg) {
  status.textContent = msg;
  status.classList.remove('hidden');
}

function showProgress(pct) {
  progressBar.classList.remove('hidden');
  progressFill.style.width = `${pct}%`;
}
