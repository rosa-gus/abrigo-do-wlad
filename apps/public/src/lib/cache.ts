import { STORAGE_KEYS } from './storage';

const DEFAULT_TTL_MS = 3 * 60 * 60 * 1000;

type Validator<T> = (value: unknown) => value is T;

interface CacheEntry<T> {
  updatedAt: number;
  data: T;
}

function readCache<T>(key: string, validate: Validator<T>): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: unknown = JSON.parse(raw);
    if (
      typeof entry === 'object' && entry !== null &&
      'updatedAt' in entry && typeof entry.updatedAt === 'number' &&
      Number.isFinite(entry.updatedAt) && entry.updatedAt <= Date.now() &&
      'data' in entry && validate(entry.data)
    ) {
      return { updatedAt: entry.updatedAt, data: entry.data };
    }
  } catch {
    // Storage may be unavailable or contain data from an interrupted write.
  }
  return null;
}

export async function fetchJsonWithCache<T>(
  url: string,
  cacheKey: string,
  validate: Validator<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const key = STORAGE_KEYS.CACHE.DATA(cacheKey);
  const cached = readCache(key, validate);
  if (
    cached && !import.meta.env.PUBLIC_DEV_TOOLS &&
    Date.now() - cached.updatedAt < ttlMs
  ) {
    return cached.data;
  }

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Falha ao carregar dados (HTTP ${response.status}).`);
    const data: unknown = await response.json();
    if (!validate(data)) throw new Error('A API retornou dados públicos inválidos.');
    try {
      localStorage.setItem(key, JSON.stringify({ updatedAt: Date.now(), data }));
    } catch {
      // A storage failure must not discard a successful network response.
    }
    return data;
  } catch (error) {
    if (cached) return cached.data;
    throw error;
  }
}
