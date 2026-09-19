/*
 * player.js
 * Boots EmulatorJS for either a library entry (?g=slug) or a file the visitor
 * handed over on the home page (?local=1), and handles the cases where the
 * console cannot be worked out from the filename.
 */

import { SYSTEMS, SYSTEM_ORDER, systemName, detectSystem } from './systems.js';
import { takeRom } from './rom-store.js';

/* Which EmulatorJS build to pull cores from.
   'stable'  - tested code and cores (recommended)
   'latest'  - latest code, stable cores
   'nightly' - latest everything, may break */
const EJS_CHANNEL = 'stable';
const EJS_DATA = `https://cdn.emulatorjs.org/${EJS_CHANNEL}/data/`;

const el = (id) => document.getElementById(id);

const overlay = el('overlay');
const overlaySpinner = el('overlay-spinner');
const overlayTitle = el('overlay-title');
const overlayText = el('overlay-text');
const overlayDetail = el('overlay-detail');
const overlayActions = el('overlay-actions');
const picker = el('console-picker');
const titleEl = el('game-title');
const subEl = el('game-sub');
const frame = el('screen-frame');

const params = new URLSearchParams(window.location.search);

/* ---------------------------------------------------------------- states */

function showBusy(title, text) {
  overlay.hidden = false;
  overlaySpinner.hidden = false;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayDetail.hidden = true;
  picker.hidden = true;
  overlayActions.hidden = true;
}

function showProblem(title, text, detail) {
  overlay.hidden = false;
  overlaySpinner.hidden = true;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  picker.hidden = true;
  overlayActions.hidden = false;
  if (detail) {
    overlayDetail.textContent = detail;
    overlayDetail.hidden = false;
  } else {
    overlayDetail.hidden = true;
  }
}

function showPicker(title, text, onPick) {
  overlay.hidden = false;
  overlaySpinner.hidden = true;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayDetail.hidden = true;
  overlayActions.hidden = false;

  picker.innerHTML = '';
  for (const key of SYSTEM_ORDER) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = SYSTEMS[key].name;
    btn.title = SYSTEMS[key].longName;
    btn.addEventListener('click', () => onPick(key));
    picker.appendChild(btn);
  }
  picker.hidden = false;
}

function hideOverlay() {
  overlay.hidden = true;
}

/* ----------------------------------------------------------------- boot */

let booted = false;

function boot({ url, system, name, revokeAfter }) {
  if (booted) return;
  booted = true;

  const sys = SYSTEMS[system];
  if (!sys) {
    showProblem('Unknown console', `"${system}" is not a console this player knows about.`);
    return;
  }

  titleEl.textContent = name;
  document.title = `${name} · Retro Arcade`;
  subEl.textContent = sys.longName;

  if (sys.heavy) frame.classList.add('is-wide');

  showBusy(
    'Warming up the cabinet',
    sys.heavy
      ? 'Loading the core. This console is a heavy one, so give it a few seconds.'
      : 'Loading the core. The first time takes a moment; after that it is cached.'
  );

  /* EmulatorJS is configured entirely through globals, which must all be in
     place before its loader script runs. */
  window.EJS_player = '#game';
  window.EJS_core = sys.core;
  window.EJS_gameUrl = url;
  window.EJS_gameName = name;
  window.EJS_pathtodata = EJS_DATA;
  window.EJS_startOnLoaded = true;
  window.EJS_color = '#4fd1b0';
  window.EJS_backgroundColor = '#000000';
  window.EJS_alignStartButton = 'center';
  window.EJS_language = document.documentElement.lang || 'en-US';

  /* Threads need cross-origin isolation headers to be served. When they are
     present the heavier cores run far better; when they are not, this simply
     falls back to a single thread. See README for the header snippets. */
  window.EJS_threads = Boolean(window.crossOriginIsolated);

  window.EJS_ready = () => {
    hideOverlay();
    if (revokeAfter) setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  window.EJS_onGameStart = () => hideOverlay();

  const script = document.createElement('script');
  script.src = `${EJS_DATA}loader.js`;
  script.addEventListener('error', () => {
    showProblem(
      'The emulator could not be reached',
      'The core files are served from the EmulatorJS CDN. Check the connection, or whether a blocker is stopping that request, then reload.',
      `${EJS_DATA}loader.js`
    );
  });
  document.body.appendChild(script);

  /* If nothing has rendered after a generous wait, say so rather than spinning
     forever. Heavy cores legitimately take a while, so the window is wide. */
  setTimeout(() => {
    if (!overlay.hidden && !overlaySpinner.hidden) {
      overlayText.textContent =
        'Still loading. Large cores can take a while on a slow connection; if this does not clear, reload the page.';
    }
  }, sys.heavy ? 45000 : 20000);
}

/* ------------------------------------------------------- library entries */

async function startFromLibrary(slug) {
  let game;
  try {
    const res = await fetch('data/games.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`games.json returned ${res.status}`);
    const payload = await res.json();
    const list = Array.isArray(payload) ? payload : (payload.games || []);
    game = list.find((g) => g.slug === slug);
  } catch (err) {
    showProblem('The library could not be read', 'The game list failed to load.', err.message);
    return;
  }

  if (!game) {
    showProblem('Game not found', `Nothing in the library has the id "${slug}".`);
    return;
  }

  if (!game.rom) {
    showProblem(
      'This one is not hosted here',
      `${game.title} is free, but its file is not bundled with this site. Grab it from the developer, then load it with the file picker.`,
      game.homepage || game.download || ''
    );
    return;
  }

  fillCredits(game);
  boot({
    url: game.rom,
    system: game.system,
    name: game.title || slug,
    revokeAfter: false,
  });
}

function fillCredits(game) {
  const card = el('credit-card');
  if (!card) return;
  const desc = el('credit-desc');
  const lic = el('credit-license');
  const links = el('credit-links');

  desc.textContent = game.description || '';
  desc.hidden = !game.description;

  const bits = [];
  if (game.author) bits.push(`By ${game.author}`);
  if (game.license) bits.push(`Licence: ${game.license}`);
  lic.textContent = bits.join(' · ');
  lic.hidden = bits.length === 0;

  links.innerHTML = '';
  const add = (href, label) => {
    if (!href) return;
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (links.childNodes.length) links.appendChild(document.createTextNode(' · '));
    links.appendChild(a);
  };
  add(game.homepage, 'Official page');
  add(game.source, 'Source code');
  links.hidden = links.childNodes.length === 0;

  card.hidden = false;
}

/* --------------------------------------------------------- local  files */

async function startFromLocalFile() {
  let record;
  try {
    record = await takeRom();
  } catch (err) {
    showProblem('The file could not be read back', 'Local storage was not available in this browser.', err.message);
    return;
  }

  if (!record || !record.file) {
    showProblem(
      'No game file waiting',
      'Nothing was handed to the player. Pick a file on the home page and it will open here.'
    );
    return;
  }

  const file = record.file;
  const url = URL.createObjectURL(file);
  const name = file.name.replace(/\.[^.]+$/, '') || 'Untitled';

  const chosen = params.get('sys') || record.system;
  if (chosen && SYSTEMS[chosen]) {
    boot({ url, system: chosen, name, revokeAfter: true });
    return;
  }

  const guess = detectSystem(file.name);
  if (guess.confident) {
    boot({ url, system: guess.system, name, revokeAfter: true });
    return;
  }

  titleEl.textContent = name;
  subEl.textContent = file.name;
  showPicker(
    'Which console is this?',
    `"${file.name}" uses an extension that several consoles share, so pick the right one and it will start.`,
    (key) => boot({ url, system: key, name, revokeAfter: true })
  );
}

/* --------------------------------------------------------------- chrome */

el('btn-fullscreen')?.addEventListener('click', () => {
  const target = frame;
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    (target.requestFullscreen || target.webkitRequestFullscreen)?.call(target);
  }
});

/* ------------------------------------------------------------------ go */

const slug = params.get('g');
if (slug) {
  startFromLibrary(slug);
} else if (params.get('local') === '1') {
  startFromLocalFile();
} else {
  showProblem(
    'Nothing to play',
    'Open a game from the library, or load a file from your own device on the home page.'
  );
}
