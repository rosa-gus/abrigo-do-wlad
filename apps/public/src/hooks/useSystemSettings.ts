import { useState, useEffect, useCallback } from "react";
import { getSystemSettings, type SystemSettings } from "@/services/systemService";

export function useSystemSettings(onError?: (message: string) => void) {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    async function fetchSettings() {
      setLoading(true);
      setError(null);
      try {
        const data = await getSystemSettings();
        if (active) setSettings(data);
      } catch (error) {
        console.error("Failed to fetch system settings", error);
        if (active) {
          const message = error instanceof Error ? error.message : "Não foi possível carregar o formulário. Tente novamente.";
          setSettings(null);
          setError(message);
          onError?.(message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchSettings();
    return () => { active = false; };
  }, [attempt, onError]);

  return { settings, loading, error, retry };
}
