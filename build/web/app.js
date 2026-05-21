// ── Section switching (wired to shell.js tab buttons) ─────────────────────
document.querySelectorAll('.tab[data-section]').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.section;
    document.querySelectorAll('.section').forEach(s => {
      s.classList.toggle('hidden', !s.id.startsWith(id));
      s.classList.toggle('active', s.id.startsWith(id));
    });
  });
});

function showSection(name) {
  const btn = document.querySelector(`.tab[data-section="${name}"]`);
  if (btn) btn.click();
}

// ── Player state ───────────────────────────────────────────────────────────
const allTracks = [];
let currentIndex = -1;

const audio       = document.getElementById('audio');
const bgBlur      = document.getElementById('bg-blur');
const coverArt    = document.getElementById('cover-art');
const trackInfo   = document.getElementById('track-info');
const trackTitle  = document.getElementById('track-title');
const trackSub    = document.getElementById('track-subtitle');
const seekSection = document.getElementById('seek-section');
const seekBar     = document.getElementById('seek-bar');
const tCurrent    = document.getElementById('t-current');
const tDuration   = document.getElementById('t-duration');
const controls    = document.getElementById('controls');
const iconPlay    = document.getElementById('icon-play');
const iconPause   = document.getElementById('icon-pause');
const treeRoot    = document.getElementById('tree-root');

// ── Player (only runs when logged in) ─────────────────────────────────────
if (treeRoot) {

bgBlur.style.backgroundImage = "url('/background.jpg')";

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(s) {
  if (!isFinite(s)) return '0:00';
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function parseTime(str) {
  const parts = str.trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

// ── Inline time input ──────────────────────────────────────────────────────
tCurrent.addEventListener('focus', () => tCurrent.select());

tCurrent.addEventListener('blur', () => {
  const t = parseTime(tCurrent.value);
  if (t !== null && isFinite(audio.duration)) {
    audio.currentTime = Math.max(0, Math.min(t, audio.duration));
  }
  tCurrent.value = fmt(audio.currentTime);
});

tCurrent.addEventListener('keydown', e => {
  if (e.key === 'Enter')  tCurrent.blur();
  if (e.key === 'Escape') { tCurrent.value = fmt(audio.currentTime); tCurrent.blur(); }
});

// ── Progress persistence ───────────────────────────────────────────────────
const PROG_KEY = 'blur_progress';

function saveProgressLocal(path, pos) {
  localStorage.setItem(PROG_KEY, JSON.stringify({ path, pos, dirty: true }));
}

async function saveProgressServer(path, pos) {
  try {
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, position: pos }),
    });
    const saved = JSON.parse(localStorage.getItem(PROG_KEY) || '{}');
    if (saved.path === path) { saved.dirty = false; localStorage.setItem(PROG_KEY, JSON.stringify(saved)); }
  } catch { /* offline — stays dirty */ }
}

function saveProgress() {
  if (currentIndex < 0 || !isFinite(audio.currentTime)) return;
  const path = allTracks[currentIndex].path;
  const pos  = audio.currentTime;
  saveProgressLocal(path, pos);
  saveProgressServer(path, pos);
}

window.addEventListener('online', () => {
  const saved = JSON.parse(localStorage.getItem(PROG_KEY) || '{}');
  if (saved.dirty && saved.path) saveProgressServer(saved.path, saved.pos);
});

window.addEventListener('beforeunload', () => {
  if (currentIndex < 0) return;
  navigator.sendBeacon('/api/progress', new Blob(
    [JSON.stringify({ path: allTracks[currentIndex].path, position: audio.currentTime })],
    { type: 'application/json' }
  ));
});

async function restoreProgress() {
  let prog = null;
  try {
    const res = await fetch('/api/progress');
    if (res.ok) prog = await res.json();
  } catch {
    const raw = localStorage.getItem(PROG_KEY);
    if (raw) { const s = JSON.parse(raw); prog = { path: s.path, position: s.pos }; }
  }
  if (!prog?.path) return;

  const idx = allTracks.findIndex(t => t.path === prog.path);
  if (idx < 0) return;

  currentIndex = idx;
  const t = allTracks[idx];

  audio.src = t.path;
  audio.addEventListener('loadedmetadata', () => {
    if (isFinite(audio.duration) && audio.duration - prog.position > 5)
      audio.currentTime = prog.position;
  }, { once: true });

  const name = t.name.replace(/\.[^.]+$/, '');
  const sub  = t.path.split('/').slice(1, -1).join(' / ') || 'media';
  trackTitle.textContent = name;
  trackSub.textContent   = sub;

  if (t.cover) {
    coverArt.innerHTML = `<img src="${t.cover}" alt="cover" />`;
    bgBlur.style.backgroundImage = `url("${t.cover}")`;
  } else {
    coverArt.innerHTML = '<span class="cover-placeholder">♪</span>';
    bgBlur.style.backgroundImage = '';
  }

  trackInfo.classList.remove('hidden');
  seekSection.classList.remove('hidden');
  controls.classList.remove('hidden');

  const row = treeRoot.querySelector(`[data-idx="${idx}"]`);
  if (row) row.classList.add('playing');
}

// ── Play by index ──────────────────────────────────────────────────────────
function playByIndex(i) {
  if (i < 0 || i >= allTracks.length) return;
  currentIndex = i;
  const t = allTracks[i];
  saveProgressServer(t.path, 0);
  saveProgressLocal(t.path, 0);

  audio.src = t.path;
  audio.play();

  const name = t.name.replace(/\.[^.]+$/, '');
  const sub  = t.path.split('/').slice(1, -1).join(' / ') || 'media';

  trackTitle.textContent = name;
  trackSub.textContent   = sub;

  if (t.cover) {
    coverArt.innerHTML = `<img src="${t.cover}" alt="cover" />`;
    bgBlur.style.backgroundImage = `url("${t.cover}")`;
  } else {
    coverArt.innerHTML = '<span class="cover-placeholder">♪</span>';
    bgBlur.style.backgroundImage = '';
  }

  trackInfo.classList.remove('hidden');
  seekSection.classList.remove('hidden');
  controls.classList.remove('hidden');

  document.querySelectorAll('.audio-row.playing').forEach(r => r.classList.remove('playing'));
  const row = treeRoot.querySelector(`[data-idx="${i}"]`);
  if (row) row.classList.add('playing');
}

// ── Library tree ───────────────────────────────────────────────────────────
function buildTree(entries, container, inheritedCover) {
  const coverEntry = entries.find(e => e.type === 'cover');
  const localCover = coverEntry ? '/media/' + coverEntry.path.replace(/^media\//, '') : inheritedCover;

  for (const e of entries) {
    if (e.type === 'cover') continue;

    if (e.type === 'dir') {
      const row = document.createElement('div');
      row.className = 'tree-row';
      row.innerHTML = `<span class="row-icon">📁</span><span class="row-label">${e.name}</span><span class="row-arrow">›</span>`;

      const kids = document.createElement('div');
      kids.className = 'tree-children hidden';

      row.addEventListener('click', () => {
        const open = row.classList.toggle('open');
        kids.classList.toggle('hidden', !open);
      });

      container.appendChild(row);
      container.appendChild(kids);
      buildTree(e.children || [], kids, localCover);

    } else if (e.type === 'audio') {
      const idx = allTracks.length;
      const filePath = '/media/' + e.path.replace(/^media\//, '');
      allTracks.push({ ...e, path: filePath, cover: localCover });

      const row = document.createElement('div');
      row.className = 'tree-row audio-row';
      row.dataset.idx = idx;
      row.innerHTML = `<span class="row-icon">♪</span><span class="row-label">${e.name}</span>`;

      row.addEventListener('click', () => playByIndex(idx));
      container.appendChild(row);
    }
  }
}

// ── Audio wiring ───────────────────────────────────────────────────────────
audio.addEventListener('timeupdate', () => {
  if (!isFinite(audio.duration)) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  seekBar.value = pct;
  seekBar.style.setProperty('--p', pct + '%');
  if (document.activeElement !== tCurrent) {
    tCurrent.value = fmt(audio.currentTime);
  }
  tDuration.textContent = fmt(audio.duration);
});

let progressTimer = null;

audio.addEventListener('play', () => {
  iconPlay.classList.add('hidden');
  iconPause.classList.remove('hidden');
  if (!progressTimer) progressTimer = setInterval(saveProgress, 10_000);
});

audio.addEventListener('pause', () => {
  iconPlay.classList.remove('hidden');
  iconPause.classList.add('hidden');
  clearInterval(progressTimer); progressTimer = null;
  saveProgress();
});

audio.addEventListener('ended', () => {
  clearInterval(progressTimer); progressTimer = null;
  if (autoplay) playByIndex(currentIndex + 1);
});

seekBar.addEventListener('input', () => {
  if (!isFinite(audio.duration)) return;
  audio.currentTime = (seekBar.value / 100) * audio.duration;
  seekBar.style.setProperty('--p', seekBar.value + '%');
});

document.getElementById('btn-play').addEventListener('click', () => audio.paused ? audio.play() : audio.pause());
document.getElementById('btn-prev').addEventListener('click', () => playByIndex(currentIndex - 1));
document.getElementById('btn-next').addEventListener('click', () => playByIndex(currentIndex + 1));

// ── Volume ─────────────────────────────────────────────────────────────────
const btnVol    = document.getElementById('btn-vol');
const volPopup  = document.getElementById('vol-popup');
const volSlider = document.getElementById('vol-slider');
const volIconPath = document.getElementById('vol-icon-path');

const D_VOL_HIGH = 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z';
const D_VOL_LOW  = 'M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z';
const D_VOL_MUTE = 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM11 7.18l-2.23 2.23L11 11.63V7.18z';

function updateVolIcon(v) {
  volIconPath.setAttribute('d', v === 0 ? D_VOL_MUTE : v <= 0.5 ? D_VOL_LOW : D_VOL_HIGH);
}

function setVolUI(v) {
  volSlider.value = v * 100;
  volSlider.style.setProperty('--vp', Math.round(v * 100) + '%');
  updateVolIcon(v);
}

const savedVol = parseFloat(localStorage.getItem('volume') ?? '1');
audio.volume = savedVol;
setVolUI(savedVol);

btnVol.addEventListener('click', e => {
  e.stopPropagation();
  volPopup.classList.toggle('hidden');
});

volSlider.addEventListener('input', () => {
  const v = volSlider.value / 100;
  audio.volume = v;
  localStorage.setItem('volume', v);
  setVolUI(v);
});

document.addEventListener('click', e => {
  if (!document.getElementById('vol-wrap').contains(e.target)) {
    volPopup.classList.add('hidden');
  }
});

// ── Autoplay ───────────────────────────────────────────────────────────────
const btnAutoplay = document.getElementById('btn-autoplay');
let autoplay = localStorage.getItem('autoplay') !== 'false';

function updateAutoplayBtn() {
  btnAutoplay.classList.toggle('on', autoplay);
  btnAutoplay.title = autoplay ? 'Autoplay: on' : 'Autoplay: off';
}
updateAutoplayBtn();

btnAutoplay.addEventListener('click', () => {
  autoplay = !autoplay;
  localStorage.setItem('autoplay', autoplay);
  updateAutoplayBtn();
});

// ── Load tree ──────────────────────────────────────────────────────────────
fetch('/api/tree')
  .then(r => r.json())
  .then(tree => { buildTree(tree, treeRoot, null); restoreProgress(); })
  .catch(() => {
    treeRoot.innerHTML = '<div style="padding:20px;color:var(--text-dim)">Could not load library.</div>';
  });

} // end if (treeRoot)
