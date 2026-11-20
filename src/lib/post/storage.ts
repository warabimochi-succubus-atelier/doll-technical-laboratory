// 投稿アプリの設定（リポジトリ名・トークン）を端末のブラウザ内（IndexedDB）に保存する。
// トークンは GitHub API 以外へは送らない。
const DB_NAME = 'doll-lab-post';
const STORE = 'settings';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export interface Settings {
  repo: string; // owner/name
  token: string;
}

export const loadSettings = () => run<Settings | undefined>('readonly', (s) => s.get('settings'));
export const saveSettings = (v: Settings) => run<void>('readwrite', (s) => s.put(v, 'settings'));
export const clearSettings = () => run<void>('readwrite', (s) => s.delete('settings'));
