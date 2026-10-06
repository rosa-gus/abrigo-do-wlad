import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getRecyclePoints } from './recycleService';
import { getSystemSettings } from './systemService';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test('loads recycling points and closed form settings from fixed API routes', async () => {
  const points = [{ id: 'point', zone: 'Centro', neighborhood: 'Vila', address: 'Rua 1' }];
  const fetchMock = vi.fn<typeof fetch>(async input => Response.json(
    input === '/api/recycle-points' ? points : { acceptingApplications: false },
  ));
  vi.stubGlobal('fetch', fetchMock);
  expect(await getRecyclePoints()).toEqual(points);
  expect(await getSystemSettings()).toEqual({ acceptingApplications: false });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/recycle-points', '/api/system/settings']);
});
test('preserves existing defaults when both API and cache are unavailable', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(null, { status: 503 })));
  expect(await getRecyclePoints()).toEqual([]);
  expect(await getSystemSettings()).toEqual({ acceptingApplications: true });
});
