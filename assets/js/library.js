/*
 * library.js
 * Home page: renders the free-game grid, handles search and console filters,
 * and takes local ROM files handed in by drag-and-drop or the file picker.
 */

import { SYSTEMS, SYSTEM_ORDER, systemName, detectSystem, acceptAttribute } from './systems.js';
import { stashRom } from './rom-store.js';
import { paintCover } from './cover.js';

const el = (id) => document.getElementById(id);

const grid = el('grid');
const empty = el('empty');
const emptyText = el('empty-text');
const searchInput = el('search');
const filtersBox = el('filters');
const resultCount = el('result-count');
const subtitle = el('library-subtitle');

let games = [];
let activeSystem = 'all';
let query = '';

/* ------------------------------------------------------------------ data */

async function loadLibrary() {
  try {
    const res = await fetch('data/games.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`games.json returned ${res.status}`);
    const payload = await res.json();
    games = Array.isArray(payload) ? payload : (payload.games || []);
  } catch (err) {
    games = [];
    console.warn('Library could not be loaded:', err);
    if (subtitle) {
      subtitle.textContent = 'The library file could not be read. The loader above still works.';
    }
  }
  buildFilters();
  render();
}

/* --------------------------------------------------------------- filters */

function buildFilters() {
  if (!filtersBox) return;
  const present = new Set(games.map((g) => g.system));
  const keys = ['all', ...SYSTEM_ORDER.filter((k) => present.has(k))];

  filtersBox.innerHTML = '';
  for (const key of keys) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = key === 'all' ? 'All' : systemName(key);
    btn.setAttribute('aria-pressed', String(key === activeSystem));
    btn.addEventListener('click', () => {
      activeSystem = key;
      for (const c of filtersBox.children) c.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-pressed', 'true');
      render();
    });
    filtersBox.appendChild(btn);
  }
  filtersBox.hidden = keys.length <= 1;
}

function matches(game) {
  if (activeSystem !== 'all' && game.system !== activeSystem) return false;
  if (!query) return true;
  const hay = [game.title, game.author, game.description, (game.tags || []).join(' ')]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(query);
}

/* ---------------------------------------------------------------- render */

function render() {
  if (!grid) return;
  const visible = games.filter(matches);

  grid.innerHTML = '';
  for (const game of visible) grid.appendChild(cardFor(game));

  const hasAny = games.length > 0;
  empty.hidden = visible.length > 0;
  if (!hasAny) {
    emptyText.textContent =
      'The library is empty. Run the sync script to fill it with freely licensed homebrew, ' +
      'or use the loader above to play a file from your own device.';
  } else {
    emptyText.textContent = 'No games match that search.';
  }

  if (resultCount) {
    resultCount.textContent = hasAny
      ? `${visible.length} of ${games.length} game${games.length === 1 ? '' : 's'}`
      : '';
  }
}

function cardFor(game) {
  const li = document.createElement('li');
  li.className = 'card';

  const playable = Boolean(game.rom);
  const href = playable ? `play.html?g=${encodeURIComponent(game.slug)}` : (game.homepage || game.download || '#');

  /* ---- art */
  const art = document.createElement('div');
  art.className = 'card-art';

  if (game.cover) {
    const img = document.createElement('img');
    img.src = game.cover;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      art.innerHTML = '';
      art.appendChild(makeCanvas(game));
      art.appendChild(badge);
    });
    art.appendChild(img);
  } else {
    art.appendChild(makeCanvas(game));
  }

  const badge = document.createElement('span');
  badge.className = 'card-badge';
  badge.textContent = systemName(game.system);
  art.appendChild(badge);

  /* ---- body */
  const body = document.createElement('div');
  body.className = 'card-body';

  const h3 = document.createElement('h3');
  h3.className = 'card-title';
  const a = document.createElement('a');
  a.href = href;
  a.textContent = game.title || game.slug;
  if (!playable) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  h3.appendChild(a);
  body.appendChild(h3);

  const meta = document.createElement('p');
  meta.className = 'card-meta';
  meta.textContent = [game.author, game.year].filter(Boolean).join(' · ');
  if (meta.textContent) body.appendChild(meta);

  if (game.description) {
    const desc = document.createElement('p');
    desc.className = 'card-desc';
    desc.textContent = game.description;
    body.appendChild(desc);
  }

  const foot = document.createElement('div');
  foot.className = 'card-foot';

  const action = document.createElement('a');
  action.className = playable ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  action.href = href;
  action.textContent = playable ? 'Play' : 'Get it free';
  if (!playable) {
    action.target = '_blank';
    action.rel = 'noopener noreferrer';
  }
  foot.appendChild(action);

  if (game.license) {
    const lic = document.createElement('span');
    lic.className = 'card-license';
    lic.textContent = game.license;
    lic.title = `Licence: ${game.license}`;
    foot.appendChild(lic);
  }

  body.appendChild(foot);
  li.appendChild(art);
  li.appendChild(body);
  return li;
}

function makeCanvas(game) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  paintCover(canvas, game.slug || game.title || '', game.system);
  return canvas;
}

/* ----------------------------------------------------------- local files */

const dropzone = el('dropzone');
const fileInput = el('file-input');
const pickButton = el('pick-file');
const dropNote = el('dropzone-note');

if (fileInput) fileInput.accept = acceptAttribute();

function noteError(message) {
  if (!dropNote) return;
  dropNote.textContent = message;
  dropNote.style.color = 'var(--warm)';
}

async function handleFile(file) {
  if (!file) return;

  const { system, confident } = detectSystem(file.name);

  /* A .bin or a .zip could be several consoles. Rather than guess and boot the
     wrong core, send it to the player and let the visitor choose there. */
  const chosen = confident ? system : null;

  try {
    await stashRom(file, chosen);
  } catch (err) {
    noteError(`This browser would not accept the file locally: ${err.message}`);
    return;
  }

  const params = new URLSearchParams({ local: '1' });
  if (chosen) params.set('sys', chosen);
  window.location.href = `play.html?${params.toString()}`;
}

if (pickButton && fileInput) {
  pickButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleFile(fileInput.files?.[0]));
}

if (dropzone) {
  let depth = 0;

  const hot = (on) => dropzone.classList.toggle('is-hot', on);

  ['dragenter', 'dragover'].forEach((type) => {
    window.addEventListener(type, (ev) => {
      if (!ev.dataTransfer?.types?.includes('Files')) return;
      ev.preventDefault();
      if (type === 'dragenter') depth++;
      hot(true);
    });
  });

  window.addEventListener('dragleave', (ev) => {
    if (!ev.dataTransfer?.types?.includes('Files')) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) hot(false);
  });

  window.addEventListener('drop', (ev) => {
    if (!ev.dataTransfer?.files?.length) return;
    ev.preventDefault();
    depth = 0;
    hot(false);
    handleFile(ev.dataTransfer.files[0]);
  });
}

/* ---------------------------------------------------------------- search */

if (searchInput) {
  let timer;
  searchInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = searchInput.value.trim().toLowerCase();
      render();
    }, 120);
  });
}

loadLibrary();
