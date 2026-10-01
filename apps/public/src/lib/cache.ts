import { getDocs, getDocsFromCache, getDoc, getDocFromCache } from 'firebase/firestore';
import type { Query, QuerySnapshot, DocumentReference, DocumentSnapshot, DocumentData } from 'firebase/firestore';
import { STORAGE_KEYS } from './storage';

const DEFAULT_TTL_MS = 3 * 60 * 60 * 1000; // 3 horas

type CacheKey = string;

function clearExpiredCacheKeys(ttlThreshold: number = DEFAULT_TTL_MS) {
  try {
    const now = Date.now();
    const prefix = STORAGE_KEYS.CACHE.TTL('');
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        const timestampStr = localStorage.getItem(key);
        const timestamp = timestampStr ? parseInt(timestampStr, 10) : 0;

        if (now - timestamp > ttlThreshold) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.warn('Falha ao limpar chaves do cache no localStorage:', e);
  }
}

export async function fetchWithCache<T = DocumentData>(
  query: Query<T, DocumentData>,
  cacheKey: CacheKey,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<QuerySnapshot<T, DocumentData>> {
  setTimeout(() => clearExpiredCacheKeys(ttlMs), 0);

  const now = Date.now();
  const storageKey = STORAGE_KEYS.CACHE.TTL(cacheKey);
  const lastFetchStr = localStorage.getItem(storageKey);
  const lastFetch = lastFetchStr ? parseInt(lastFetchStr, 10) : 0;

  const isDevelopment = import.meta.env.PUBLIC_DEV_TOOLS;
  const isCacheValid = !isDevelopment && (now - lastFetch) < ttlMs;

  if (isCacheValid) {
    try {
      // Try retrieving the cached data from Firebase IndexedDB
      const snapshot = await getDocsFromCache(query);
      if (!snapshot.empty) {
        return snapshot;
      }
    } catch (e) {
      console.warn('Falha ao obter do cache local, realizando fetch remoto:', e);
    }
  }

  // Failed to read the cache, or it has expired/is empty. Searching the network.
  try {
    const snapshot = await getDocs(query);
    localStorage.setItem(storageKey, now.toString());
    return snapshot;
  } catch (error: unknown) {
    console.warn(`[Cache] Fallback ativado para ${cacheKey} devido a erro na rede.`, error);
    try {
      const staleSnapshot = await getDocsFromCache(query);
      if (!staleSnapshot.empty) {
        return staleSnapshot;
      }
    } catch (cacheError) {
      console.warn(`[Cache] Falha ao recuperar fallback do cache para ${cacheKey}`, cacheError);
    }
    throw error;
  }
}

export async function fetchDocWithCache<T = DocumentData>(
  docRef: DocumentReference<T, DocumentData>,
  cacheKey: CacheKey,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<DocumentSnapshot<T, DocumentData>> {
  setTimeout(() => clearExpiredCacheKeys(ttlMs), 0);

  const now = Date.now();
  const storageKey = STORAGE_KEYS.CACHE.TTL(cacheKey);
  const lastFetchStr = localStorage.getItem(storageKey);
  const lastFetch = lastFetchStr ? parseInt(lastFetchStr, 10) : 0;

  const isDevelopment = import.meta.env.PUBLIC_DEV_TOOLS;
  const isCacheValid = !isDevelopment && (now - lastFetch) < ttlMs;

  if (isCacheValid) {
    try {
      const snapshot = await getDocFromCache(docRef);
      // getDocFromCache throws if it misses, but to be sure:
      if (snapshot.exists()) {
        return snapshot;
      }
    } catch (e) {
      console.warn('Falha ao obter documento do cache local, realizando fetch remoto:', e);
    }
  }

  try {
    const snapshot = await getDoc(docRef);
    localStorage.setItem(storageKey, now.toString());
    return snapshot;
  } catch (error: unknown) {
    console.warn(`[Cache] Fallback ativado para documento ${cacheKey} devido a erro na rede.`, error);
    try {
      const staleSnapshot = await getDocFromCache(docRef);
      if (staleSnapshot.exists()) {
        return staleSnapshot;
      }
    } catch (cacheError) {
      console.warn(`[Cache] Falha ao recuperar fallback do cache do doc para ${cacheKey}`, cacheError);
    }
    throw error;
  }
}
