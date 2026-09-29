import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";

import { Dock, DockItem, type DockItemProps } from "../Dock";
import styles from "./MobileDock.module.css";

export type MobileDockDestination = {
  href: string;
  label: string;
  icon: ReactNode;
  tone?: DockItemProps["tone"];
};

export type MobileDockProps = {
  pathname: string;
  onNavigate: (href: string) => void;
  primary: MobileDockDestination;
  destinations: readonly MobileDockDestination[];
  compactAction?: ReactNode;
  expandedActions?: ReactNode;
  previewEnabled?: boolean;
  edgeCollapse?: boolean;
  ariaLabel?: string;
};

const SWIPE_THRESHOLD = 35;
const REVEAL_DISTANCE = 58;
const PREVIEW_DISTANCE = 40;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function getCarouselIndex(pathname: string, destinations: readonly MobileDockDestination[]) {
  const index = destinations.findIndex(({ href }) => isActive(pathname, href));
  return Math.min(Math.max(index, 0), Math.max(0, destinations.length - 2));
}

export function MobileDock({
  pathname,
  onNavigate,
  primary,
  destinations,
  compactAction,
  expandedActions,
  previewEnabled = true,
  edgeCollapse = false,
  ariaLabel = "Navegação principal",
}: MobileDockProps) {
  const [expanded, setExpanded] = useState(false);
  const [closed, setClosed] = useState(false);
  const [drag, setDrag] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(() => getCarouselIndex(pathname, destinations));
  const [preview, setPreview] = useState(false);
  const dockStackRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);
  const gestureAxis = useRef<"x" | "y" | null>(null);
  const suppressClick = useRef(false);
  const hasInteracted = useRef(false);
  const initialPreviewEnabled = useRef(previewEnabled);
  const maxCarouselIndex = Math.max(0, destinations.length - 2);
  const carouselStep = destinations.length ? 100 / destinations.length : 0;

  useEffect(() => {
    if (!initialPreviewEnabled.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

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
    setCarouselIndex(getCarouselIndex(pathname, destinations));
  }, [pathname, destinations]);

  useEffect(() => {
    if (!edgeCollapse) {
      setClosed(false);
      return;
    }

    hasInteracted.current = false;
    setClosed(false);
    const closeTimer = window.setTimeout(() => {
      if (!hasInteracted.current) setClosed(true);
    }, 1100);
    return () => window.clearTimeout(closeTimer);
  }, [edgeCollapse]);

  useEffect(() => {
    if (!edgeCollapse || closed) return;

    const closeOnOutsidePointerDown = (event: globalThis.PointerEvent) => {
      if (dockStackRef.current?.contains(event.target as Node)) return;
      hasInteracted.current = true;
      setExpanded(false);
      setClosed(true);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [edgeCollapse, closed]);

  const handleNavigation = (event: MouseEvent<HTMLAnchorElement>, href: string, index?: number) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    hasInteracted.current = true;
    setPreview(false);
    if (index !== undefined) setCarouselIndex(Math.min(index, maxCarouselIndex));
    onNavigate(href);
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (closed) return;
    hasInteracted.current = true;
    setPreview(false);
    suppressClick.current = false;
    startX.current = event.clientX;
    startY.current = event.clientY;
    gestureAxis.current = null;
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (closed) return;
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
      if (edgeCollapse && deltaY > 0 && !expanded) {
        setClosed(true);
        suppressClick.current = false;
      } else {
        setExpanded(deltaY < 0);
        suppressClick.current = true;
      }
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
  const visibleCarouselIndex = expanded ? 0 : Math.min(carouselIndex, maxCarouselIndex);
  const activeCarouselIndex = destinations.findIndex(({ href }) => isActive(pathname, href));
  const activeCarouselSlot = activeCarouselIndex - visibleCarouselIndex;

  return (
    <div
      ref={dockStackRef}
      className={styles.dockStack}
      data-closed={closed}
      data-edge-collapse={edgeCollapse}
      style={{
        "--dock-reveal": `${reveal}px`,
        "--dock-progress": reveal / REVEAL_DISTANCE,
        "--carousel-offset": `-${visibleCarouselIndex * carouselStep}%`,
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
      {closed && (
        <button
          className={styles.closedTrigger}
          type="button"
          aria-label="Abrir navegação"
          onClick={() => {
            hasInteracted.current = true;
            setClosed(false);
          }}
        />
      )}
      <Dock className={styles.mobileDock} data-expanded={expanded} data-has-compact-action={Boolean(compactAction)} aria-label={ariaLabel} aria-hidden={closed} inert={closed}>
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
            ? destinations[activeCarouselIndex]?.tone
            : undefined}
        >
          <DockItem
            {...primary}
            showLabel
            active={pathname === primary.href}
            onClick={(event) => handleNavigation(event, primary.href, 0)}
          />
          <div className={styles.carouselViewport}>
            <div className={styles.carouselTrack}>
              {destinations.map((destination, index) => {
                const visible = index === visibleCarouselIndex || index === visibleCarouselIndex + 1;
                return (
                  <DockItem
                    key={destination.href}
                    {...destination}
                    showLabel
                    active={isActive(pathname, destination.href)}
                    aria-hidden={!visible}
                    tabIndex={visible ? undefined : -1}
                    onClick={(event) => handleNavigation(event, destination.href, index)}
                  />
                );
              })}
            </div>
          </div>
          {!expanded && compactAction && (
            <>
              <span className={styles.actionDivider} aria-hidden="true" />
              {compactAction}
            </>
          )}
        </div>

        <div id="mobile-dock-more" className={styles.more} aria-hidden={!expanded}>
          <div className={`${styles.row} ${styles.pagesRow}`}>
            {destinations.slice(2).map((destination) => (
              <DockItem
                key={destination.href}
                {...destination}
                showLabel
                active={isActive(pathname, destination.href)}
                tabIndex={expanded ? undefined : -1}
                onClick={(event) => handleNavigation(event, destination.href)}
              />
            ))}
          </div>
        </div>
      </Dock>
      {expanded && expandedActions && (
        <div className={styles.actionsDock} role="group" aria-label="Ações rápidas">
          {expandedActions}
        </div>
      )}
    </div>
  );
}
