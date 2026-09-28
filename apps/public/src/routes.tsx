import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { VLibrasWidget } from "./components/common/VLibrasWidget";
import { MobileDock } from "./components/MobileDock";
import Home from "./pages/Home";
import About from "./pages/About";
import Recycle from "./pages/Recycle";
import Dogs from "./pages/Dogs";
import PrivacyPolicy from "./pages/Legal";
import ScrollToTop from "./components/common/ScrollToTop";
import BetaForm from "./pages/BetaForm";

export function AppRoutes() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <VLibrasWidget />

      <Header />
      <MobileDock />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sobre" element={<About />} />
        <Route path="/tampinhas" element={<Recycle />} />
        <Route path="/caes" element={<Dogs />} />
        <Route path="/caes/:publicSlug" element={<Dogs />} />

        <Route
          path="/formulario"
          element={<Navigate to="/beta/formulario" />}
        />
        <Route
          path="/beta/formulario"
          element={<Navigate to="/beta/formulario/step/1" replace />}
        />
        <Route path="/beta/formulario/step/:step" element={<BetaForm />} />

        <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>

      <Footer />
    </BrowserRouter>
  );
}
