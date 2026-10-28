import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

function isDogCatalogPath(pathname: string): boolean {
  return pathname === "/caes";
}

function isDogProfilePath(pathname: string): boolean {
  return /^\/caes\/[^/]+\/?$/.test(pathname);
}

function isDogModalTransition(
  previousPathname: string | null,
  pathname: string,
): boolean {
  if (!previousPathname) return false;
  const previousIsDogContext = isDogCatalogPath(previousPathname) ||
    isDogProfilePath(previousPathname);
  const currentIsDogContext = isDogCatalogPath(pathname) ||
    isDogProfilePath(pathname);
  return previousIsDogContext && currentIsDogContext;
}

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  const previousPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;

    // The adoption wizard manages focus and scrolling between its own steps.
    if (
      previousPathname?.startsWith("/beta/formulario/step/") &&
      pathname.startsWith("/beta/formulario/step/")
    ) return;

    if (isDogModalTransition(previousPathname, pathname)) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pathname]);

  return null;
};

export default ScrollToTop;
