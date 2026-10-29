import { useEffect, useState } from "react";
import { ChevronLeft, ListTree, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@jaci/ui/Button";
import { useIndicatorStorage } from "./useIndicatorStorage";
import styles from "./ScrollIndicators.module.css";

interface ScrollIndicatorsProps {
  containerRef: React.RefObject<HTMLDivElement>;
  sectionCount: number;
  labels?: string[];
}

export function ScrollIndicators({
  containerRef,
  sectionCount,
  labels = [],
}: ScrollIndicatorsProps) {
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCompactOpen, setIsCompactOpen] = useState(false);
  const [isFooterVisible, setIsFooterVisible] = useState(false);
  const [activeSubIndex, setActiveSubIndex] = useState(-1);
  const [subSections, setSubSections] = useState<
    { node: HTMLElement; label: string }[][]
  >([]);

  useEffect(() => {
    const footer = document.getElementById("footer");
    if (!footer) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsFooterVisible(entry.isIntersecting);
      if (entry.isIntersecting) setIsCompactOpen(false);
    });
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const sections = Array.from(
      containerRef.current.children as HTMLCollection,
    ) as HTMLElement[];

    const parsedSubs = sections.map((section) => {
      const subs = Array.from(
        section.querySelectorAll("[data-subsection]"),
      ) as HTMLElement[];
      return subs.map((node) => ({
        node,
        label: node.getAttribute("data-subsection") || "",
      }));
    });
    setSubSections(parsedSubs);

    const handleScroll = () => {
      const scrollY = window.scrollY;
      const viewportHeight = window.innerHeight;
      const viewportCenter = scrollY + viewportHeight / 2;

      let closestIndex = 0;
      let closestDistance = Infinity;

      sections.forEach((section, index) => {
        const rect = section.getBoundingClientRect();
        const sectionCenter = scrollY + rect.top + rect.height / 2;
        const distance = Math.abs(viewportCenter - sectionCenter);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setActiveIndex(closestIndex);

      const activeSection = sections[closestIndex];
      if (activeSection) {
        const subNodes = Array.from(
          activeSection.querySelectorAll("[data-subsection]"),
        ) as HTMLElement[];

        if (subNodes.length > 0) {
          let closestSub = 0;
          let closestSubDist = Infinity;

          subNodes.forEach((node, i) => {
            const rect = node.getBoundingClientRect();
            const center = scrollY + rect.top + rect.height / 2;
            const d = Math.abs(viewportCenter - center);

            if (d < closestSubDist) {
              closestSubDist = d;
              closestSub = i;
            }
          });
          setActiveSubIndex(closestSub);
        } else {
          setActiveSubIndex(-1);
        }
      }
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [containerRef, sectionCount]);

  const handleDotClick = (index: number) => {
    if (!containerRef.current) return;

    const sections = Array.from(
      containerRef.current.children as HTMLCollection,
    ) as HTMLElement[];

    if (sections[index]) {
      const rect = sections[index].getBoundingClientRect();
      const headerHeight = 120;
      const targetScroll = window.scrollY + rect.top - headerHeight;

      window.scrollTo({
        top: targetScroll,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
    }
  };

  const handleSubDotClick = (node: HTMLElement) => {
    const rect = node.getBoundingClientRect();
    const headerHeight = 120;
    const targetScroll = window.scrollY + rect.top - headerHeight;

    window.scrollTo({
      top: targetScroll,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };

  const visibleCount = Math.min(5, sectionCount);
  const startIndex = Math.max(
    0,
    Math.min(
      activeIndex - Math.floor(visibleCount / 2),
      sectionCount - visibleCount,
    ),
  );
  const visibleIndices = Array.from({ length: visibleCount }).map(
    (_, i) => startIndex + i,
  );

  const hasMoreTop = startIndex > 0;
  const hasMoreBottom = startIndex + visibleCount < sectionCount;

  const { isVisible, isFadingOut, hideIndicator, showIndicator } =
    useIndicatorStorage();

  if (!isVisible && !isFadingOut) {
    return (
      <div className={styles.hiddenArea} data-footer-visible={isFooterVisible}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={styles.showButton}
          onClick={showIndicator}
          title="Mostrar navegação"
          aria-label="Mostrar navegação"
        >
          <ListTree size={18} aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={styles.compactToggle}
        data-footer-visible={isFooterVisible}
        onClick={() => setIsCompactOpen(open => !open)}
        aria-expanded={isCompactOpen}
        aria-controls="page-section-navigation"
        aria-label={isCompactOpen ? "Fechar seções da página" : "Abrir seções da página"}
      >
        {isCompactOpen ? <X size={18} aria-hidden="true" /> : <ListTree size={18} aria-hidden="true" />}
      </Button>
      <nav
        id="page-section-navigation"
        data-footer-visible={isFooterVisible}
        aria-label="Seções da página"
        className={`${styles.indicators} ${isCompactOpen ? styles.compactOpen : ""} ${isFadingOut ? styles.fadeOut : styles.fadeIn}`}
        onKeyDown={event => {
          if (event.key === "Escape") {
            setIsCompactOpen(false);
            document.querySelector<HTMLButtonElement>(`button[aria-controls="page-section-navigation"]`)?.focus();
          }
        }}
      >
        <div className={styles.indicatorWrapper}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={styles.hideButton}
            onClick={hideIndicator}
            title="Ocultar navegação"
            aria-label="Ocultar navegação"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Button>
          <AnimatePresence initial={false} mode="popLayout">
            {visibleIndices.map((index, i) => {
              const isEdge = (i === 0 && hasMoreTop) ||
                (i === visibleIndices.length - 1 && hasMoreBottom);
              const isParentActive = index === activeIndex;
              const subs = subSections[index] || [];
              const label = labels[index] || `Seção ${index + 1}`;

              return (
                <motion.div
                  key={index}
                  className={styles.dotGroup}
                  layout={reduceMotion ? false : "position"}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6, pointerEvents: "none" }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.22,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <button
                    type="button"
                    aria-current={isParentActive ? "location" : undefined}
                    className={`${styles.dot} ${isParentActive ? styles.active : ""} ${isEdge ? styles.edgeDot : ""}`}
                    onClick={() => { handleDotClick(index); setIsCompactOpen(false); }}
                    aria-label={`Ir para ${label}`}
                    title={label}
                  >
                    <span className={styles.marker} aria-hidden="true" />
                    <span className={styles.label}>{label}</span>
                  </button>
                  {subs.length > 0 && (
                    <div className={`${styles.accordionWrapper} ${isParentActive ? styles.accordionOpen : ""}`}>
                      <div className={styles.accordionInner}>
                        <div className={styles.subDotsContainer}>
                          {subs.map((sub, subIdx) => (
                            <button
                              key={subIdx}
                              type="button"
                              aria-current={isParentActive && subIdx === activeSubIndex ? "location" : undefined}
                              tabIndex={isParentActive ? 0 : -1}
                              className={`${styles.subDot} ${subIdx === activeSubIndex ? styles.activeSubDot : ""}`}
                              onClick={() => { handleSubDotClick(sub.node); setIsCompactOpen(false); }}
                              aria-label={`Ir para a subseção ${sub.label}`}
                              title={sub.label}
                            >
                              <span className={styles.marker} aria-hidden="true" />
                              <span className={styles.subLabel}>{sub.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </nav>
    </>
  );
}
