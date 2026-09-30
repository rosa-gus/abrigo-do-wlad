import * as React from "react";
import { type Dog } from "@/types/dogs";

export function useDailyDog() {
  const [dog, setDog] = React.useState<Dog | null>(null);

  React.useEffect(() => {
    if (import.meta.env.PUBLIC_DEV_TOOLS) return;

    async function fetchDailyDog() {
      try {
        const response = await fetch("/api/hero-dog");
        if (response.ok) {
          const payload = (await response.json()) as {
            data?: Dog;
          } & Dog;

          setDog(payload.data ?? (payload as Dog));
        }
      } catch (error) {
        console.error("Erro ao carregar o daily dog:", error);
      }
    }
    fetchDailyDog();
  }, []);

  return dog;
}
