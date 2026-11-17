import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest, apiErrorMessage } from "../services/api";

export interface AdminSession {
  email: string;
  role: "administrator" | "developer";
}

interface AuthContextType {
  user: AdminSession | null;
  loading: boolean;
  error: string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<AdminSession>("/api/session", { signal: controller.signal })
      .then(setUser)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(apiErrorMessage(cause, "Sua sessão administrativa não pôde ser validada."));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  function logout() {
    window.location.assign("/cdn-cgi/access/logout");
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// The hook intentionally shares this module with its provider and private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
