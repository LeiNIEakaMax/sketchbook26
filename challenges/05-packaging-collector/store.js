// The shelf: saved boxes live in this browser's IndexedDB (photos included),
// so a collection survives reloads. Nothing leaves the device.

const DB = 'sketchbook26-05-packaging';
const STORE = 'boxes';

let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}

async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Saving was cancelled'));
  });
}

export const listBoxes = async () => {
  const all = (await run('readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => b.updated - a.updated);
};
export const getBox = (id) => run('readonly', (s) => s.get(id));
export const putBox = (rec) => run('readwrite', (s) => s.put(rec));
export const deleteBox = (id) => run('readwrite', (s) => s.delete(id));

export function toBlob(canvas, type = 'image/jpeg', q = 0.88) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, q));
}

export async function toCanvas(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close && bmp.close();
  return c;
}
