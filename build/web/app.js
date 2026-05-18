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

// ── Play by index ──────────────────────────────────────────────────────────
function playByIndex(i) {
  if (i < 0 || i >= allTracks.length) return;
  currentIndex = i;
  const t = allTracks[i];

  audio.src = t.path;
  audio.play();

  const name = t.name.replace(/\.[^.]+$/, '');
  const sub  = t.path.split('/').slice(1, -1).join(' / ') || 'media';

  trackTitle.textContent = name;
  trackSub.textContent   = sub;

  if (t.cover) {
    coverArt.innerHTML = `<img src="${t.cover}" alt="cover" />`;
    bgBlur.style.backgroundImage = `url(${t.cover})`;
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

  showSection('player');
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

audio.addEventListener('play',  () => { iconPlay.classList.add('hidden');    iconPause.classList.remove('hidden'); });
audio.addEventListener('pause', () => { iconPlay.classList.remove('hidden'); iconPause.classList.add('hidden'); });
audio.addEventListener('ended', () => playByIndex(currentIndex + 1));

seekBar.addEventListener('input', () => {
  if (!isFinite(audio.duration)) return;
  audio.currentTime = (seekBar.value / 100) * audio.duration;
  seekBar.style.setProperty('--p', seekBar.value + '%');
});

document.getElementById('btn-play').addEventListener('click', () => audio.paused ? audio.play() : audio.pause());
document.getElementById('btn-prev').addEventListener('click', () => playByIndex(currentIndex - 1));
document.getElementById('btn-next').addEventListener('click', () => playByIndex(currentIndex + 1));

// ── Load tree ──────────────────────────────────────────────────────────────
fetch('/api/tree')
  .then(r => r.json())
  .then(tree => buildTree(tree, treeRoot, null))
  .catch(() => {
    treeRoot.innerHTML = '<div style="padding:20px;color:var(--text-dim)">Could not load library.</div>';
  });

} // end if (treeRoot)
