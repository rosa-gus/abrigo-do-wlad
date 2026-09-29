import { Outlet } from "react-router";
import { Header } from "../Header";
import { Footer } from "../Footer";
import { AdminNav } from "../AdminNav";
import { AdminMobileDock } from "../AdminMobileDock";

export function AdminLayout() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "var(--bg-body)" }}>
      <Header />
      <AdminNav />
      <AdminMobileDock />

      <main style={{ flex: 1 }}>
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
