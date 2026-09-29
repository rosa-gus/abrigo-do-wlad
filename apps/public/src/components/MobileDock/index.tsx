import { useEffect, useState } from "react";
import * as Lucide from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import { DockAction, DockItem } from "@jaci/ui/Dock";
import { MobileDock as SharedMobileDock, type MobileDockDestination } from "@jaci/ui/MobileDock";
import * as Dialog from "@jaci/ui/Dialog";
import PixModal from "@/components/PixModal";
import { getVLibrasAccessButton, openVLibras, VLIBRAS_READY_EVENT } from "@/components/common/VLibrasWidget/vlibrasBridge";
import { analytics } from "@/utils/analytics";
import { STORE_URL } from "@/utils/links";
import { useTheme } from "@/hooks/useTheme";

const primary = { href: "/", label: "Início", icon: <Lucide.House size={22} strokeWidth={2} /> };
const destinations: readonly MobileDockDestination[] = [
  { href: "/caes", label: "Cães", tone: "danger", icon: <Lucide.Dog size={22} strokeWidth={2} /> },
  { href: "/tampinhas", label: "Tampinhas", tone: "success", icon: <Lucide.Recycle size={22} strokeWidth={2} /> },
  { href: "/sobre", label: "Sobre", tone: "info", icon: <Lucide.Info size={22} strokeWidth={2} /> },
  { href: "/formulario", label: "Formulário", icon: <Lucide.ClipboardList size={22} strokeWidth={2} /> },
];

function DonationAction() {
  return (
    <Dialog.Dialog>
      <Dialog.DialogTrigger asChild>
        <DockAction
          icon={<Lucide.HeartHandshake size={22} strokeWidth={2} />}
          label="Doar"
          showLabel
          onClick={() => analytics.trackButtonClick("dock_donate")}
        />
      </Dialog.DialogTrigger>
      <PixModal />
    </Dialog.Dialog>
  );
}

export function MobileDock() {
  const { pathname } = useLocation();
  const isForm = pathname.startsWith("/beta/formulario");
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const [vlibrasReady, setVLibrasReady] = useState(false);
  const [previewEnabled] = useState(() => !pathname.startsWith("/beta/formulario"));

  useEffect(() => {
    const updateReady = () => setVLibrasReady(Boolean(getVLibrasAccessButton()));
    window.addEventListener(VLIBRAS_READY_EVENT, updateReady);
    updateReady();
    return () => window.removeEventListener(VLIBRAS_READY_EVENT, updateReady);
  }, []);

  return (
    <SharedMobileDock
      pathname={isForm ? "/formulario" : pathname}
      onNavigate={navigate}
      primary={primary}
      destinations={destinations}
      previewEnabled={previewEnabled}
      edgeCollapse={isForm}
      compactAction={<DonationAction />}
      expandedActions={
        <>
          <DonationAction />
          <DockItem
            href={STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            icon={<Lucide.ShoppingBag size={22} strokeWidth={2} />}
            label="Bazar"
            showLabel
            onClick={() => analytics.trackButtonClick("dock_bazar")}
          />
          <DockAction
            icon={<Lucide.Languages size={22} strokeWidth={2} />}
            label="Libras"
            showLabel
            disabled={!vlibrasReady}
            onClick={() => openVLibras()}
          />
          <DockAction
            icon={isDark ? <Lucide.Sun size={22} strokeWidth={2} /> : <Lucide.Moon size={22} strokeWidth={2} />}
            label="Tema"
            showLabel
            aria-pressed={isDark}
            title={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
            onClick={toggleTheme}
          />
        </>
      }
    />
  );
}
