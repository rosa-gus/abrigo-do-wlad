import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import * as Lucide from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import { Dock, DockAction, DockItem } from "@jaci/ui/Dock";
import * as Dialog from "@jaci/ui/Dialog";
import PixModal from "@/components/PixModal";
import { getVLibrasAccessButton, openVLibras, VLIBRAS_READY_EVENT } from "@/components/common/VLibrasWidget/vlibrasBridge";
import { analytics } from "@/utils/analytics";
import { useTheme } from "@/hooks/useTheme";

import styles from "./MobileDock.module.css";

const carouselDestinations = [
  { href: "/caes", label: "Cães", tone: "danger", icon: <Lucide.Dog size={22} strokeWidth={2} /> },
  { href: "/tampinhas", label: "Tampinhas", tone: "success", icon: <Lucide.Recycle size={22} strokeWidth={2} /> },
  { href: "/sobre", label: "Sobre", tone: "info", icon: <Lucide.Info size={22} strokeWidth={2} /> },
  { href: "/formulario", label: "Formulário", tone: undefined, icon: <Lucide.ClipboardList size={22} strokeWidth={2} /> },
] as const;

const SWIPE_THRESHOLD = 35;
const REVEAL_DISTANCE = 58;
const PREVIEW_DISTANCE = 40;
const MAX_CAROUSEL_INDEX = carouselDestinations.length - 2;
const CAROUSEL_STEP = 100 / carouselDestinations.length;

function getCarouselIndex(pathname: string) {
  const destinationIndex = carouselDestinations.findIndex((destination) =>
    pathname === destination.href || pathname.startsWith(`${destination.href}/`),
  );
  return Math.min(Math.max(destinationIndex, 0), MAX_CAROUSEL_INDEX);
}

function DonationAction({ className }: { className?: string }) {
  return (
    <Dialog.Dialog>
      <Dialog.DialogTrigger asChild>
        <DockAction
          className={className}
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
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [drag, setDrag] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(() => getCarouselIndex(pathname));
  const [preview, setPreview] = useState(false);
  const [vlibrasReady, setVLibrasReady] = useState(false);
  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);
  const gestureAxis = useRef<"x" | "y" | null>(null);
  const suppressClick = useRef(false);
  const hasInteracted = useRef(false);
  const initialPathname = useRef(pathname);

  useEffect(() => {
    if (
      initialPathname.current.startsWith("/beta/formulario") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;

    const showPreview = window.setTimeout(() => {
      if (!hasInteracted.current) setPreview(true);
    }, 800);
    const hidePreview = window.setTimeout(() => setPreview(false), 2200);

    return () => {
      window.clearTimeout(showPreview);
      window.clearTimeout(hidePreview);
    };
  }, []);

  useEffect(() => {
    setExpanded(false);
    setCarouselIndex(getCarouselIndex(pathname));
  }, [pathname]);

  useEffect(() => {
    const updateReady = () => setVLibrasReady(Boolean(getVLibrasAccessButton()));
    window.addEventListener(VLIBRAS_READY_EVENT, updateReady);
    updateReady();
    return () => window.removeEventListener(VLIBRAS_READY_EVENT, updateReady);
  }, []);

  if (pathname.startsWith("/beta/formulario")) return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const handleNavigation = (event: MouseEvent<HTMLAnchorElement>, href: string, index?: number) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    hasInteracted.current = true;
    setPreview(false);
    if (index !== undefined) setCarouselIndex(Math.min(index, MAX_CAROUSEL_INDEX));
    navigate(href);
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    hasInteracted.current = true;
    setPreview(false);
    suppressClick.current = false;
    startX.current = event.clientX;
    startY.current = event.clientY;
    gestureAxis.current = null;
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (startY.current === null || startX.current === null) return;
    const deltaY = event.clientY - startY.current;
    const deltaX = event.clientX - startX.current;
    if (!gestureAxis.current) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) <= 10) return;
      gestureAxis.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
    }
    if (gestureAxis.current === "x") return;
    if (Math.abs(deltaY) > 10 && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDrag(Math.max(0, Math.min(REVEAL_DISTANCE, expanded ? REVEAL_DISTANCE + deltaY : -deltaY)));
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (startY.current === null || startX.current === null) return;
    const deltaY = event.clientY - startY.current;
    const deltaX = event.clientX - startX.current;
    const axis = gestureAxis.current ?? (Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y");
    if (axis === "y" && Math.abs(deltaY) > SWIPE_THRESHOLD) {
      setExpanded(deltaY < 0);
      suppressClick.current = true;
    } else if (axis === "x" && Math.abs(deltaX) > SWIPE_THRESHOLD) {
      suppressClick.current = true;
    }
    startY.current = null;
    startX.current = null;
    gestureAxis.current = null;
    setDrag(0);
  };

  const onPointerCancel = () => {
    startY.current = null;
    startX.current = null;
    gestureAxis.current = null;
    setDrag(0);
  };

  const reveal = drag || (expanded ? REVEAL_DISTANCE : preview ? PREVIEW_DISTANCE : 0);
  const visibleCarouselIndex = expanded ? 0 : carouselIndex;
  const activeCarouselIndex = carouselDestinations.findIndex(({ href }) => isActive(href));
  const activeCarouselSlot = activeCarouselIndex - visibleCarouselIndex;

  return (
    <div
      className={styles.dockStack}
      style={{
        "--dock-reveal": `${reveal}px`,
        "--dock-progress": reveal / REVEAL_DISTANCE,
        "--carousel-offset": `-${visibleCarouselIndex * CAROUSEL_STEP}%`,
      } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }}
    >
      <Dock className={styles.mobileDock} data-expanded={expanded}>
        <button
          className={styles.handle}
          type="button"
          aria-expanded={expanded}
          aria-controls="mobile-dock-more"
          aria-label={expanded ? "Recolher opções de navegação" : "Mostrar mais opções de navegação"}
          onClick={() => {
            hasInteracted.current = true;
            setPreview(false);
            setExpanded((value) => !value);
          }}
        />

        <div
          className={styles.row}
          data-active-carousel-slot={activeCarouselSlot === 0 || activeCarouselSlot === 1 ? activeCarouselSlot : undefined}
          data-active-carousel-tone={activeCarouselSlot === 0 || activeCarouselSlot === 1
            ? carouselDestinations[activeCarouselIndex]?.tone
            : undefined}
        >
          <DockItem
            href="/"
            icon={<Lucide.House size={22} strokeWidth={2} />}
            label="Início"
            showLabel
            active={isActive("/")}
            onClick={(event) => handleNavigation(event, "/", 0)}
          />
          <div className={styles.carouselViewport}>
            <div className={styles.carouselTrack}>
              {carouselDestinations.map((destination, index) => {
                const { icon, label } = destination;
                const visible = index === visibleCarouselIndex || index === visibleCarouselIndex + 1;
                return (
                  <DockItem
                    key={destination.href}
                    href={destination.href}
                    icon={icon}
                    label={label}
                    tone={destination.tone}
                    showLabel
                    active={isActive(destination.href)}
                    aria-hidden={!visible}
                    tabIndex={visible ? undefined : -1}
                    onClick={(event) => handleNavigation(event, destination.href, index)}
                  />
                );
              })}
            </div>
          </div>
          {!expanded && (
            <>
              <span className={styles.donationDivider} aria-hidden="true" />
              <DonationAction />
            </>
          )}
        </div>

        <div id="mobile-dock-more" className={styles.more} aria-hidden={!expanded}>
          <div className={`${styles.row} ${styles.pagesRow}`}>
            <DockItem
              href="/sobre"
              icon={<Lucide.Info size={22} strokeWidth={2} />}
              label="Sobre"
              showLabel
              tone="info"
              active={isActive("/sobre")}
              tabIndex={expanded ? undefined : -1}
              onClick={(event) => handleNavigation(event, "/sobre")}
            />
            <DockItem
              href="/formulario"
              icon={<Lucide.ClipboardList size={22} strokeWidth={2} />}
              label="Formulário"
              showLabel
              active={isActive("/formulario")}
              tabIndex={expanded ? undefined : -1}
              onClick={(event) => handleNavigation(event, "/formulario")}
            />
          </div>
        </div>
      </Dock>
      {expanded && (
        <div className={styles.actionsDock} role="group" aria-label="Ações rápidas">
          <DonationAction className={styles.action} />
          <DockAction
            className={styles.action}
            icon={<Lucide.Languages size={22} strokeWidth={2} />}
            label="Libras"
            showLabel
            disabled={!vlibrasReady}
            onClick={() => openVLibras()}
          />
          <DockAction
            className={styles.action}
            icon={isDark ? <Lucide.Sun size={22} strokeWidth={2} /> : <Lucide.Moon size={22} strokeWidth={2} />}
            label="Tema"
            showLabel
            aria-pressed={isDark}
            title={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
            onClick={toggleTheme}
          />
        </div>
      )}
    </div>
  );
}
