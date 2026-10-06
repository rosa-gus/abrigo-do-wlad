import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fetchJsonWithCache } from './cache';
import { STORAGE_KEYS } from './storage';

const validate = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');
let values: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  });
  fetchMock = vi.fn<typeof fetch>(async () => Response.json(['fresh']));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('PUBLIC_DEV_TOOLS', '');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function cache(data: unknown, age: number) {
  values.set(STORAGE_KEYS.CACHE.DATA('points'), JSON.stringify({
    data, updatedAt: Date.now() - age,
  }));
}

test('caches validated JSON and reuses it within the TTL', async () => {
  expect(await fetchJsonWithCache('/api/recycle-points', 'points', validate)).toEqual(['fresh']);
  expect(await fetchJsonWithCache('/api/recycle-points', 'points', validate)).toEqual(['fresh']);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test('empty results are valid cached data', async () => {
  cache([], 100);
  expect(await fetchJsonWithCache('/api/recycle-points', 'points', validate)).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});
test('refreshes expired data and falls back on network failure', async () => {
  cache(['stale'], 2000);
  fetchMock.mockRejectedValue(new Error('offline'));
  expect(await fetchJsonWithCache('/api/recycle-points', 'points', validate, 1000)).toEqual(['stale']);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test('HTTP errors and malformed responses do not overwrite stale data', async () => {
  cache(['stale'], 2000);
  fetchMock.mockResolvedValueOnce(Response.json({ error: 'unavailable' }, { status: 503 }));
  fetchMock.mockResolvedValueOnce(Response.json({ invalid: true }));
  for (let i = 0; i < 2; i++) {
    expect(await fetchJsonWithCache('/api/recycle-points', 'points', validate, 1000)).toEqual(['stale']);
  }
});
test('ignores corrupt cached data and rejects invalid network data', async () => {
  cache({ invalid: true }, 0);
  fetchMock.mockResolvedValue(Response.json({ invalid: true }));
  await expect(fetchJsonWithCache('/api/recycle-points', 'points', validate)).rejects.toThrow('inválidos');
});
test('storage failures do not prevent a network response', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('quota'); },
  });
  expect(await fetchJsonWithCache('/api/recycle-points', 'points', validate)).toEqual(['fresh']);
});
test('development bypasses a fresh cache', async () => {
  cache(['cached'], 0);
  vi.stubEnv('PUBLIC_DEV_TOOLS', 'true');
  expect(await fetchJsonWithCache('/api/recycle-points', 'points', validate)).toEqual(['fresh']);
});
