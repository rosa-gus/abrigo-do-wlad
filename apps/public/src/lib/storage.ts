// Preferences need explicit migrations; obsolete cache data can be discarded.
const STORAGE_DOMAINS = {
  feedback: { version: 1, discardObsolete: false },
  ui: { version: 1, discardObsolete: false },
  cache: { version: 2, discardObsolete: true },
} as const;

function storageKey(domain: keyof typeof STORAGE_DOMAINS, suffix: string): string {
  return `app:v${STORAGE_DOMAINS[domain].version}:${domain}:${suffix}`;
}

/**
 * Storage keys constants
 * Format: app:v{version}:{domain}:{feature}:{identifier}
 */
export const STORAGE_KEYS = {
  FEEDBACK: {
    PAGE_VOTE: (path: string) => storageKey("feedback", `page_vote:${path}`),
  },
  UI: {
    THEME: storageKey("ui", "theme"),
    INDICATORS_VISIBLE: storageKey("ui", "indicators_visible"),
  },
  CACHE: {
    DATA: (key: string) => storageKey("cache", `data:${key}`),
  },
} as const;

export function cleanupObsoleteStorage(): void {
  try {
    const storage = window.localStorage;
    // Walk backwards because removing a key shifts the remaining indexes.
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      const match = key?.match(/^app:v(\d+):([^:]+):.+$/);
      if (!key || !match) continue;

      const version = Number(match[1]);
      const policy = Object.entries(STORAGE_DOMAINS).find(([domain]) => domain === match[2])?.[1];
      if (
        policy?.discardObsolete && Number.isSafeInteger(version) &&
        version >= 1 && version < policy.version
      ) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Blocked storage must not prevent the application from starting.
  }
}
