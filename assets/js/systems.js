/*
 * systems.js
 * Console metadata and ROM-extension detection.
 *
 * The `core` values are EmulatorJS core identifiers. They come from the
 * EmulatorJS cores table; do not rename them.
 */

export const SYSTEMS = {
  nes: {
    core: 'nes',
    name: 'NES',
    longName: 'Nintendo Entertainment System / Famicom',
    era: '8-bit',
    year: 1983,
    extensions: ['nes', 'fds', 'unf', 'unif'],
    accent: '#e2574c',
  },
  snes: {
    core: 'snes',
    name: 'SNES',
    longName: 'Super Nintendo / Super Famicom',
    era: '16-bit',
    year: 1990,
    extensions: ['sfc', 'smc', 'fig', 'swc'],
    accent: '#8b7fd4',
  },
  gb: {
    core: 'gb',
    name: 'Game Boy',
    longName: 'Game Boy / Game Boy Color',
    era: '8-bit handheld',
    year: 1989,
    extensions: ['gb', 'gbc', 'dmg', 'cgb'],
    accent: '#7ec96f',
  },
  gba: {
    core: 'gba',
    name: 'Game Boy Advance',
    longName: 'Game Boy Advance',
    era: '32-bit handheld',
    year: 2001,
    extensions: ['gba', 'agb'],
    accent: '#5aa9e6',
  },
  segaMD: {
    core: 'segaMD',
    name: 'Genesis',
    longName: 'Sega Genesis / Mega Drive',
    era: '16-bit',
    year: 1988,
    extensions: ['md', 'gen', 'smd', 'bin'],
    accent: '#4d8fd6',
  },
  segaMS: {
    core: 'segaMS',
    name: 'Master System',
    longName: 'Sega Master System',
    era: '8-bit',
    year: 1985,
    extensions: ['sms'],
    accent: '#d67b4d',
  },
  segaGG: {
    core: 'segaGG',
    name: 'Game Gear',
    longName: 'Sega Game Gear',
    era: '8-bit handheld',
    year: 1990,
    extensions: ['gg'],
    accent: '#c25fa8',
  },
  sega32x: {
    core: 'sega32x',
    name: '32X',
    longName: 'Sega 32X',
    era: '32-bit',
    year: 1994,
    extensions: ['32x'],
    accent: '#8a8fa8',
  },
  n64: {
    core: 'n64',
    name: 'Nintendo 64',
    longName: 'Nintendo 64',
    era: '64-bit',
    year: 1996,
    extensions: ['z64', 'n64', 'v64'],
    accent: '#d4b03c',
    heavy: true,
  },
  psx: {
    core: 'psx',
    name: 'PlayStation',
    longName: 'Sony PlayStation',
    era: '32-bit',
    year: 1994,
    extensions: ['cue', 'chd', 'pbp', 'iso', 'img', 'm3u'],
    accent: '#9aa3b2',
    heavy: true,
    needsBios: true,
  },
};

/** Display order for filter tabs and grouping. */
export const SYSTEM_ORDER = [
  'nes', 'snes', 'gb', 'gba', 'segaMD', 'segaMS', 'segaGG', 'sega32x', 'n64', 'psx',
];

/**
 * Extensions that more than one console claims. `.bin` is the worst offender:
 * it is a Genesis cartridge dump, a PlayStation disc track, and a generic blob.
 * These never auto-select; the player asks instead.
 */
const AMBIGUOUS = new Set(['bin', 'iso', 'img', 'zip', '7z']);

const EXT_TO_SYSTEM = (() => {
  const map = new Map();
  for (const [key, sys] of Object.entries(SYSTEMS)) {
    for (const ext of sys.extensions) {
      if (AMBIGUOUS.has(ext)) continue;
      if (!map.has(ext)) map.set(ext, key);
    }
  }
  return map;
})();

export function extensionOf(filename = '') {
  const clean = String(filename).split(/[?#]/)[0];
  const dot = clean.lastIndexOf('.');
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase();
}

/**
 * Best-guess console for a filename.
 * Returns { system, confident }. `confident` is false when the caller
 * should show a console picker rather than just booting something.
 */
export function detectSystem(filename) {
  const ext = extensionOf(filename);
  if (!ext) return { system: null, confident: false };
  if (AMBIGUOUS.has(ext)) return { system: null, confident: false };
  const system = EXT_TO_SYSTEM.get(ext) || null;
  return { system, confident: Boolean(system) };
}

/** Every extension the file picker should advertise. */
export function acceptAttribute() {
  const exts = new Set(['zip']);
  for (const sys of Object.values(SYSTEMS)) sys.extensions.forEach((e) => exts.add(e));
  return [...exts].map((e) => `.${e}`).join(',');
}

export function systemName(key) {
  return SYSTEMS[key]?.name || key || 'Unknown';
}
