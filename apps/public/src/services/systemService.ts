import { fetchJsonWithCache } from '@/lib/cache';

export interface SystemSettings {
  acceptingApplications: boolean;
}

function isSystemSettings(value: unknown): value is SystemSettings {
  return typeof value === 'object' && value !== null &&
    'acceptingApplications' in value && typeof value.acceptingApplications === 'boolean';
}

export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    return await fetchJsonWithCache(
      '/api/system/settings', 'system_settings', isSystemSettings, 60 * 60 * 1000,
    );
  } catch (error) {
    console.error('Error fetching system settings:', error);
    return { acceptingApplications: true };
  }
}
