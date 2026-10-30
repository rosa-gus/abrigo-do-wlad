import { fetchJsonWithCache } from '@/lib/cache';

export interface SystemSettings {
  acceptingApplications: boolean;
}

function isSystemSettings(value: unknown): value is SystemSettings {
  return typeof value === 'object' && value !== null &&
    'acceptingApplications' in value && typeof value.acceptingApplications === 'boolean';
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetchJsonWithCache(
      '/api/system/settings', 'system_settings', isSystemSettings, 60 * 60 * 1000,
      { signal: controller.signal, allowStaleOnError: false },
    );
  } catch (error) {
    console.error('Error fetching system settings:', error);
    throw new Error(controller.signal.aborted
      ? 'A consulta de disponibilidade demorou mais que o esperado. Tente novamente.'
      : 'Não foi possível verificar a disponibilidade do formulário. Verifique sua conexão e tente novamente.');
  } finally {
    clearTimeout(timeout);
  }
}
