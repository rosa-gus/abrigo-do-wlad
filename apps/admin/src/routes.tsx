import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { Card, CardBody, CardContent, CardHeader, CardTitle } from "@jaci/ui/Card";
import { AdminLayout } from "./components/AdminLayout";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import AdoptionsDashboard from "./pages/AdoptionsDashboard";
import Dashboard from "./pages/Dashboard";
import DogDashboard from "./pages/DogDashboard";
import DogArchive from "./pages/DogArchive";
import EditDog from "./pages/EditDog";
import EditRecycle from "./pages/EditRecycle";
import NewDog from "./pages/NewDog";
import NewRecycle from "./pages/NewRecycle";
import RecycleDashboard from "./pages/RecycleDashboard";
import DeveloperOptions from "./pages/DeveloperOptions";
import AdoptionPrint from "./pages/AdoptionPrint";
import styles from "./routes.module.css";

function RouteState({ title, message, tone = "neutral" }: {
  title: string;
  message: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <main className={styles.routeState}>
      <Card variant="callout" tone={tone} size="sm" className={styles.routeCard}>
        <CardBody>
          <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
          <CardContent><p>{message}</p></CardContent>
        </CardBody>
      </Card>
    </main>
  );
}

function ProtectedLayout() {
  const { user, loading, error } = useAuth();
  if (loading) {
    return <RouteState title="Validando sessão" message="Aguarde enquanto confirmamos seu acesso ao painel." />;
  }
  if (!user) {
    return <RouteState title="Acesso não autorizado" message={error ?? "Esta identidade não possui acesso ao painel."} tone="danger" />;
  }
  return <Outlet />;
}

function DeveloperLayout() {
  const { user } = useAuth();
  return user?.role === "developer" ? <Outlet /> : <Navigate to="/admin" replace />;
}

export default function AppRoutes() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<ProtectedLayout />}>
            <Route path="/admin/adoptions/:id/print" element={<AdoptionPrint />} />
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/dog" element={<DogDashboard />} />
              <Route path="/admin/archived" element={<DogArchive />} />
              <Route path="/admin/dog/archive" element={<Navigate to="/admin/archived" replace />} />
              <Route path="/admin/dog/new" element={<NewDog />} />
              <Route path="/admin/dog/edit/:id" element={<EditDog />} />
              <Route path="/admin/recycle" element={<RecycleDashboard />} />
              <Route path="/admin/recycle/new" element={<NewRecycle />} />
              <Route path="/admin/recycle/edit/:id" element={<EditRecycle />} />
              <Route path="/admin/adoptions" element={<AdoptionsDashboard />} />
              <Route element={<DeveloperLayout />}>
                <Route path="/admin/dev-options" element={<DeveloperOptions />} />
                <Route
                  path="/admin/system-keys"
                  element={<Navigate to="/admin/dev-options" replace />}
                />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
