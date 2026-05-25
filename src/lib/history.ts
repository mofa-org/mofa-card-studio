export interface HistoryItem {
  jobId: string;
  style: string;
  styleName: string;
  variant: string;
  prompt: string;
  flexibility: string;
  imageUrl: string;
  thumbnail: string;
  createdAt: number;
}

const DB_NAME = 'card-studio-history';
const STORE_NAME = 'cards';
const DB_VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'jobId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveToHistory(item: HistoryItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getHistory(): Promise<HistoryItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('createdAt').getAll();
    req.onsuccess = () => resolve((req.result as HistoryItem[]).reverse());
    req.onerror = () => reject(req.error);
  });
}

export async function deleteHistoryItem(jobId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(jobId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cleanupOldHistory(): Promise<void> {
  const items = await getHistory();
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const item of items) {
    if (item.createdAt < cutoff) await deleteHistoryItem(item.jobId);
  }
}

export async function createThumbnail(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 200;
      const ratio = Math.min(size / img.width, size / img.height);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve('');
    img.src = imageUrl;
  });
}
