import type { RecyclePoint } from '../types/recycle';

function isRecyclePoints(value: unknown): value is RecyclePoint[] {
  return Array.isArray(value) && value.every((point: unknown) => {
    if (typeof point !== 'object' || point === null) return false;
    const data = point as Record<string, unknown>;
    return (
      typeof data.id === 'string' && typeof data.zone === 'string' &&
      typeof data.neighborhood === 'string' && typeof data.address === 'string' &&
      (data.name === undefined || typeof data.name === 'string') &&
      (data.googleMapsUrl === undefined || typeof data.googleMapsUrl === 'string')
    );
  });
}

export async function getRecyclePoints(): Promise<RecyclePoint[]> {
  try {
    const response = await fetch('/api/recycle-points', {
      cache: 'no-store', headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Falha ao carregar pontos (HTTP ${response.status}).`);
    const points: unknown = await response.json();
    if (!isRecyclePoints(points)) throw new Error('A API retornou pontos inválidos.');
    return points;
  } catch (error) {
    console.error('Erro ao buscar pontos de coleta:', error);
    return [];
  }
}
