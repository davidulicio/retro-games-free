#!/usr/bin/env node
/*
 * sync-library.mjs
 *
 * Fills data/games.json from the community homebrew databases maintained by
 * the gbdev project, and optionally copies the ROMs and screenshots into
 * games/ so this site can serve them itself.
 *
 * The licence filter is the point of this script. An entry is only ever
 * marked redistributable, and only ever copied locally, when its stated
 * licence clearly permits redistribution. Entries with a stated but
 * restrictive licence are still listed, with their card linking visitors to
 * the developer instead of serving a file from your server. Entries with no
 * stated licence at all are left out by default, because "no licence" means
 * all rights reserved, not "free for anyone".
 *
 *   node scripts/sync-library.mjs                     # metadata only
 *   node scripts/sync-library.mjs --download          # + fetch permitted ROMs and art
 *   node scripts/sync-library.mjs --platform gb       # gb | gba | all
 *   node scripts/sync-library.mjs --include-unlicensed
 *   node scripts/sync-library.mjs --keep-clones       # leave the git mirrors in place
 *
 * Requires git. Nothing else: no API keys, no rate limits. Each source is
 * cloned blobless and shallow (under a megabyte), then only the files that
 * pass the licence filter are actually fetched.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile, readdir, copyFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const run = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const GAMES_DIR = join(ROOT, 'games');
const MANIFEST = join(ROOT, 'data', 'games.json');
const WORK = join(tmpdir(), 'retro-arcade-sync');

/* ------------------------------------------------------------- sources */

const SOURCES = [
  {
    id: 'gb',
    url: 'https://github.com/gbdev/database.git',
    label: 'Game Boy / Game Boy Color',
    credit: 'Homebrew Hub (gbdev)',
    entryUrl: (slug) => `https://hh.gbdev.io/entry/${slug}`,
    /* game.json "platform" -> our console key */
    platforms: { GB: 'gb', GBC: 'gb' },
    /* used when an entry omits "platform" */
    extFallback: { '.gb': 'gb', '.gbc': 'gb' },
  },
  {
    id: 'gba',
    url: 'https://github.com/gbadev-org/games.git',
    label: 'Game Boy Advance',
    credit: 'GBA homebrew database (gbadev)',
    entryUrl: (slug) => `https://hh.gbdev.io/entry/${slug}`,
    platforms: { GBA: 'gba' },
    extFallback: { '.gba': 'gba' },
  },
];

/* -------------------------------------------------------------- licences */

/*
 * Licences whose terms permit redistributing the compiled binary. Several
 * require attribution, which is why every card and the player page print the
 * licence and credit the developer. If you are unsure about one, leave it out.
 *
 * Deliberately absent: "Freeware", "Free", "Proprietary", anything
 * non-commercial (-NC) and anything no-derivatives (-ND). Free to play is not
 * the same as free to redistribute, and no-derivatives terms can be read to
 * forbid repackaging.
 */
const REDISTRIBUTABLE = [
  '0BSD', 'BSD-2-CLAUSE', 'BSD-3-CLAUSE', 'BSD',
  'MIT', 'ISC', 'ZLIB', 'APACHE-2.0', 'APACHE', 'MPL-2.0', 'BSL-1.0',
  'GPL-2.0', 'GPL-3.0', 'GPL', 'LGPL-2.1', 'LGPL-3.0', 'LGPL', 'AGPL-3.0', 'AGPL',
  'UNLICENSE', 'WTFPL', 'WTFPL-2.0', 'CC0-1.0', 'CC0', 'PUBLIC DOMAIN', 'PUBLIC-DOMAIN',
  'CC-BY-4.0', 'CC-BY-3.0', 'CC-BY-SA-4.0', 'CC-BY-SA-3.0', 'CC-BY-SA', 'CC-BY',
];

function licenceVerdict(raw) {
  const stated = String(raw || '').trim();
  if (!stated) return { stated: '', known: false, redistributable: false };

  const norm = stated.toUpperCase();

  /* Reject before accepting: "CC-BY-NC-SA-4.0" contains "CC-BY". */
  if (/-NC\b|-NC-|NONCOMMERCIAL|NON-COMMERCIAL/.test(norm)) {
    return { stated, known: true, redistributable: false };
  }
  if (/-ND\b|-ND-|NODERIV|NO-DERIV/.test(norm)) {
    return { stated, known: true, redistributable: false };
  }

  /* Hedged wording such as "CC-BY ish" is not a licence grant. */
  if (/\bISH\b|\bPROBABLY\b|\bUNKNOWN\b|\?/.test(norm)) {
    return { stated, known: true, redistributable: false };
  }

  const ok = REDISTRIBUTABLE.some((id) => {
    const re = new RegExp(`(^|[^A-Z0-9])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z0-9]|$)`);
    return re.test(norm);
  });

  return { stated, known: true, redistributable: ok };
}

/* ----------------------------------------------------------------- args */

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const val = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const DOWNLOAD = has('download');
const PLATFORM = String(val('platform', 'all')).toLowerCase();
const INCLUDE_UNLICENSED = has('include-unlicensed');
const KEEP_CLONES = has('keep-clones');
const LIMIT = Number.parseInt(val('limit', '0'), 10) || 0;

const log = (...a) => console.log(...a);

/* ----------------------------------------------------------------- git */

async function git(cwd, ...args) {
  return run('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
}

async function ensureGit() {
  try {
    await run('git', ['--version']);
  } catch {
    console.error('git is required but was not found on the PATH.');
    process.exit(1);
  }
}

/** Blobless shallow clone: the full file list, almost none of the bytes. */
async function prepareClone(source) {
  const dir = join(WORK, source.id);
  if (existsSync(join(dir, '.git'))) {
    try {
      await git(dir, 'fetch', '--depth', '1', 'origin');
      await git(dir, 'reset', '--hard', 'origin/HEAD');
      return dir;
    } catch {
      await rm(dir, { recursive: true, force: true });
    }
  }
  await mkdir(dirname(dir), { recursive: true });
  await run('git', [
    'clone', '--filter=blob:none', '--depth', '1', '--no-checkout',
    source.url, dir,
  ], { maxBuffer: 64 * 1024 * 1024 });
  return dir;
}

/** Fetch exactly the paths given, in one batched operation. */
async function materialise(dir, patterns) {
  if (!patterns.length) return;
  await git(dir, 'sparse-checkout', 'set', '--no-cone', ...patterns);
  await git(dir, 'checkout');
}

/* ------------------------------------------------------------ normalise */

function normalise(raw, source, slug) {
  const files = (raw.files || []).filter((f) => f && f.filename && f.playable !== false);
  const preferred = files.find((f) => f.default) || files[0];
  if (!preferred) return null;

  const declared = String(raw.platform || '').toUpperCase();
  const system = source.platforms[declared]
    || source.extFallback[extname(preferred.filename).toLowerCase()]
    || null;
  if (!system) return null;

  const licence = licenceVerdict(raw.license || raw.licence);
  const tags = (raw.tags || []).map((t) => String(t).trim()).filter(Boolean);
  const screenshot = (raw.screenshots || []).find((s) => /\.(png|jpe?g|bmp|gif)$/i.test(s)) || null;

  const description = String(raw.description || '').trim();

  return {
    slug: `${source.id}-${slug}`,
    title: String(raw.title || slug).trim(),
    system,
    author: String(raw.developer || raw.author || '').trim(),
    year: raw.date ? (Number(String(raw.date).slice(0, 4)) || null) : null,
    description: description || tags.join(' · '),
    license: licence.stated || 'Not stated',
    redistributable: licence.redistributable,
    homepage: raw.repository || raw.website || source.entryUrl(slug),
    source: raw.repository || null,
    download: source.entryUrl(slug),
    credit: source.credit,
    rom: null,
    cover: null,
    tags: tags.map((t) => t.toLowerCase()),
    _local: {
      dir: `entries/${slug}`,
      rom: `entries/${slug}/${preferred.filename}`,
      romName: preferred.filename,
      cover: screenshot ? `entries/${slug}/${screenshot}` : null,
      coverName: screenshot,
      licenceKnown: licence.known,
    },
  };
}

/* -------------------------------------------------------------- harvest */

async function harvest(source) {
  log(`\n· ${source.label}`);
  log(`  cloning ${source.url}`);

  const dir = await prepareClone(source);

  const { stdout } = await git(dir, 'ls-tree', '-r', '--name-only', 'HEAD');
  const paths = stdout.split('\n').filter(Boolean);
  const manifests = paths.filter((p) => /^entries\/[^/]+\/game\.json$/.test(p));
  log(`  ${manifests.length} entries in the database`);

  await materialise(dir, ['/entries/*/game.json']);

  const games = [];
  for (const rel of manifests) {
    const slug = rel.split('/')[1];
    let raw;
    try {
      raw = JSON.parse(await readFile(join(dir, rel), 'utf8'));
    } catch {
      continue;
    }
    const game = normalise(raw, source, slug);
    if (game) games.push(game);
  }

  const known = games.filter((g) => g._local.licenceKnown);
  const free = games.filter((g) => g.redistributable);
  log(`  ${known.length} state a licence, of which ${free.length} allow redistribution`);

  const kept = INCLUDE_UNLICENSED ? games : known;
  const capped = LIMIT > 0 ? kept.slice(0, LIMIT) : kept;

  return { source, dir, games: capped };
}

/* --------------------------------------------------------------- assets */

/*
 * Upstream filenames contain spaces, brackets and the odd accent. Those are
 * legal on disk but make for brittle URLs, so everything served from games/
 * gets a conservative name. The extension is preserved.
 */
function safeName(filename) {
  const ext = extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  const clean = stem
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'rom';
  return clean + ext.toLowerCase().replace(/[^a-z0-9.]/g, '');
}

async function collectAssets(batch) {
  const { source, dir, games } = batch;
  const wanted = games.filter((g) => g.redistributable);
  if (!wanted.length) return 0;

  log(`\n· fetching ${wanted.length} freely licensed title${wanted.length === 1 ? '' : 's'} for ${source.label}`);

  const patterns = [];
  for (const g of wanted) {
    patterns.push(`/${g._local.rom}`);
    if (g._local.cover) patterns.push(`/${g._local.cover}`);
  }

  await materialise(dir, ['/entries/*/game.json', ...patterns]);

  let stored = 0;
  for (const g of wanted) {
    const romSrc = join(dir, g._local.rom);
    if (!existsSync(romSrc)) continue;

    const destDir = join(GAMES_DIR, g.slug);
    await mkdir(destDir, { recursive: true });

    const romName = safeName(g._local.romName);
    await copyFile(romSrc, join(destDir, romName));
    g.rom = `games/${g.slug}/${romName}`;
    stored++;

    if (g._local.cover) {
      const coverSrc = join(dir, g._local.cover);
      if (existsSync(coverSrc)) {
        const coverName = safeName(g._local.coverName);
        await copyFile(coverSrc, join(destDir, coverName));
        g.cover = `games/${g.slug}/${coverName}`;
      }
    }

    /* Ship the licence text next to the binary so the attribution travels
       with it, which several of these licences require. */
    const licenceFile = join(destDir, 'LICENSE.txt');
    await writeFile(
      licenceFile,
      [
        g.title,
        g.author ? `by ${g.author}` : '',
        '',
        `Licence: ${g.license}`,
        g.source ? `Source: ${g.source}` : '',
        `Catalogued by: ${g.credit} — ${g.download}`,
        '',
        'Redistributed here under the terms above. If you are the author and',
        'would like this removed, contact the operator of this site.',
      ].filter(Boolean).join('\n') + '\n'
    );
  }

  return stored;
}

/* ---------------------------------------------------------------- write */

async function loadHandwritten() {
  /* Entries you curated by hand survive a sync. They are recognised by not
     carrying a source prefix in the slug. */
  const prefixes = SOURCES.map((s) => s.id);
  try {
    const current = JSON.parse(await readFile(MANIFEST, 'utf8'));
    const list = Array.isArray(current) ? current : (current.games || []);
    return list.filter((g) => !prefixes.some((p) => String(g.slug || '').startsWith(`${p}-`)));
  } catch {
    return [];
  }
}

async function main() {
  log('Retro Arcade · library sync\n');
  await ensureGit();

  const sources = SOURCES.filter((s) => PLATFORM === 'all' || PLATFORM === s.id);
  if (!sources.length) {
    console.error(`No source matches --platform ${PLATFORM}. Use gb, gba or all.`);
    process.exit(1);
  }

  const batches = [];
  for (const source of sources) {
    try {
      batches.push(await harvest(source));
    } catch (err) {
      console.error(`  failed: ${err.message.split('\n')[0]}`);
    }
  }

  if (!batches.length) {
    console.error('\nNothing was harvested; data/games.json is untouched.');
    process.exit(1);
  }

  if (DOWNLOAD) {
    let total = 0;
    for (const batch of batches) total += await collectAssets(batch);
    log(`\n  ${total} game${total === 1 ? '' : 's'} stored under games/`);
  } else {
    log('\n· metadata only — pass --download to fetch the freely licensed ROMs');
  }

  const harvested = batches.flatMap((b) => b.games);
  const games = [...await loadHandwritten(), ...harvested]
    .map(({ _local, ...rest }) => rest)
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));

  const playable = games.filter((g) => g.rom).length;

  await mkdir(dirname(MANIFEST), { recursive: true });
  await writeFile(MANIFEST, `${JSON.stringify({
    _comment: 'Generated by scripts/sync-library.mjs. Hand-written entries (slugs with no source prefix) are preserved across runs. Never add an entry whose licence does not permit the way you are distributing it.',
    updated: new Date().toISOString().slice(0, 10),
    games,
  }, null, 2)}\n`);

  log(`\nWrote ${games.length} entries to data/games.json`);
  log(`  ${playable} playable on this site, ${games.length - playable} linking out to the developer`);
  if (!DOWNLOAD) log('  run again with --download to make the free ones playable here');

  if (!KEEP_CLONES) {
    await rm(WORK, { recursive: true, force: true }).catch(() => {});
  } else {
    log(`\n  clones kept in ${WORK}`);
  }
}

main().catch((err) => {
  console.error(`\nsync failed: ${err.message}`);
  process.exit(1);
});
