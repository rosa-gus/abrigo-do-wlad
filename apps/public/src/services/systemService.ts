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
    const response = await fetch('/api/system/settings', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Falha ao carregar disponibilidade (HTTP ${response.status}).`);
    const settings: unknown = await response.json();
    if (!isSystemSettings(settings)) throw new Error('A API retornou uma disponibilidade inválida.');
    return settings;
  } catch (error) {
    console.error('Error fetching system settings:', error);
    throw new Error(controller.signal.aborted
      ? 'A consulta de disponibilidade demorou mais que o esperado. Tente novamente.'
      : 'Não foi possível verificar a disponibilidade do formulário. Verifique sua conexão e tente novamente.');
  } finally {
    clearTimeout(timeout);
  }
}
