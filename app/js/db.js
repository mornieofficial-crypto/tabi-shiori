// 保存先。IndexedDB(端末内)。使えない環境ではメモリのみで動き、persistent=false になる。
const DB_NAME = 'tabi-shiori';
const DB_VERSION = 1;

let db = null;
export let persistent = false;
const mem = { trips: new Map(), meta: new Map() };

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('trips', { keyPath: 'id' });
      req.result.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}

const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const store = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);

export async function init() {
  try {
    db = await open();
    persistent = true;
    // iPhoneで、しばらく開かなくてもデータを消されにくくする要求(拒否されることもある)
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    persistent = false;
  }
  return persistent;
}

export async function loadTrips() {
  if (!persistent) return [...mem.trips.values()];
  return wrap(store('trips').getAll());
}

export async function saveTrip(trip) {
  const copy = structuredClone(trip);
  if (!persistent) return void mem.trips.set(copy.id, copy);
  await wrap(store('trips', 'readwrite').put(copy));
}

export async function deleteTrip(id) {
  if (!persistent) return void mem.trips.delete(id);
  await wrap(store('trips', 'readwrite').delete(id));
}

export async function getMeta(key) {
  if (!persistent) return mem.meta.get(key);
  return wrap(store('meta').get(key));
}

export async function setMeta(key, value) {
  if (!persistent) return void mem.meta.set(key, value);
  await wrap(store('meta', 'readwrite').put(value, key));
}
