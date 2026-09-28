import React from "react";
import { useLocation } from "react-router";

import { getVLibrasAccessButton, VLIBRAS_READY_EVENT } from "./vlibrasBridge";
import "./VLibrasWidget.module.css";

type VLibrasWindow = Window &
  typeof globalThis & {
    VLibras?: {
      Widget: new (options: { rootPath: string; position: "L" | "R" }) => unknown;
    };
  };

let vlibrasInitialized = false;

export const VLibrasWidget = () => {
  const { pathname } = useLocation();

  React.useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 768px)");
    let readyAnnounced = false;

    const syncAccessButton = () => {
      const accessButton = getVLibrasAccessButton();
      if (!accessButton) return;

      const useDock = mobileQuery.matches && !pathname.startsWith("/beta/formulario");
      document.documentElement.toggleAttribute("data-vlibras-in-dock", useDock);
      if (!accessButton.hasAttribute("data-original-tabindex")) {
        accessButton.setAttribute("data-original-tabindex", accessButton.getAttribute("tabindex") ?? "");
      }
      const originalTabIndex = accessButton.getAttribute("data-original-tabindex");
      if (useDock) {
        accessButton.setAttribute("tabindex", "-1");
      } else if (originalTabIndex) {
        accessButton.setAttribute("tabindex", originalTabIndex);
      } else {
        accessButton.removeAttribute("tabindex");
      }

      if (!readyAnnounced) {
        readyAnnounced = true;
        window.dispatchEvent(new Event(VLIBRAS_READY_EVENT));
      }
    };

    const readyInterval = window.setInterval(syncAccessButton, 500);

    const initializeVLibras = () => {
      const VLibras = (window as VLibrasWindow).VLibras;
      if (!vlibrasInitialized && VLibras?.Widget) {
        new VLibras.Widget({
          rootPath: "https://vlibras.gov.br/app",
          position: "R",
        });
        vlibrasInitialized = true;
      }
      syncAccessButton();
    };

    initializeVLibras();
    window.addEventListener("load", initializeVLibras);
    mobileQuery.addEventListener("change", syncAccessButton);

    return () => {
      window.removeEventListener("load", initializeVLibras);
      mobileQuery.removeEventListener("change", syncAccessButton);
      window.clearInterval(readyInterval);
      document.documentElement.removeAttribute("data-vlibras-in-dock");
    };
  }, [pathname]);

  return React.createElement(
    "div",
    { vw: "", className: "enabled" } as React.HTMLAttributes<HTMLDivElement>,
    React.createElement("div", { "vw-access-button": "", className: "active" } as React.HTMLAttributes<HTMLDivElement>),
    React.createElement(
      "div",
      { "vw-plugin-wrapper": "" } as React.HTMLAttributes<HTMLDivElement>,
      React.createElement("div", { className: "vw-plugin-top-wrapper" })
    )
  );
};
