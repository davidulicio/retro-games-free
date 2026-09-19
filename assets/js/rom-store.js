/*
 * rom-store.js
 * Hands a locally-chosen ROM file from the library page to the player page.
 *
 * The file never leaves the visitor's browser. IndexedDB is used purely as a
 * handoff across the page navigation (blob: URLs do not survive it), and the
 * record is cleared as soon as the player has read it.
 */

const DB_NAME = 'retro-arcade';
const DB_VERSION = 1;
const STORE = 'pending';
const KEY = 'rom';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser has no IndexedDB, so local ROMs cannot be handed to the player.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open local storage.'));
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let result;
    try {
      result = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    transaction.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Store a File (plus the console the visitor picked, if any) for the player page. */
export async function stashRom(file, system) {
  const db = await openDb();
  try {
    await tx(db, 'readwrite', (store) =>
      store.put({ file, name: file.name, system: system || null, at: Date.now() }, KEY)
    );
  } finally {
    db.close();
  }
}

/** Read and immediately clear the stashed ROM. Returns null if there is none. */
export async function takeRom() {
  const db = await openDb();
  try {
    const record = await tx(db, 'readonly', (store) => store.get(KEY));
    if (record) await tx(db, 'readwrite', (store) => store.delete(KEY));
    return record || null;
  } finally {
    db.close();
  }
}
