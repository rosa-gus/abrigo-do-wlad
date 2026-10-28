import { useEffect, useState } from "react";
import { Blend } from "lucide-react";
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
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeSubIndex, setActiveSubIndex] = useState(-1);
  const [subSections, setSubSections] = useState<
    { node: HTMLElement; label: string }[][]
  >([]);

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
      <div className={styles.hiddenArea}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={styles.showButton}
          onClick={showIndicator}
          title="Mostrar navegação"
          aria-label="Mostrar navegação"
        >
          <Blend size={14} strokeWidth={2} />
        </Button>
      </div>
    );
  }

  return (
    <nav
      aria-label="Seções da página"
      className={`${styles.indicators} ${isFadingOut ? styles.fadeOut : styles.fadeIn}`}
    >
      <div className={styles.indicatorWrapper}>
        <div className={styles.dotsContainer}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={styles.hideButton}
            onClick={hideIndicator}
            title="Ocultar navegação"
            aria-label="Ocultar navegação"
          >
            <Blend size={14} strokeWidth={2.5} />
          </Button>
          {visibleIndices.map((index, i) => {
            const isEdgeTop = i === 0 && hasMoreTop;
            const isEdgeBottom =
              i === visibleIndices.length - 1 && hasMoreBottom;
            const edgeClass = isEdgeTop || isEdgeBottom ? styles.edgeDot : "";
            const isParentActive = index === activeIndex;
            const subs = subSections[index] || [];

            return (
              <div key={i} className={styles.dotGroup}>
                <button
                  type="button"
                  aria-current={isParentActive ? "location" : undefined}
                  className={`${styles.dot} ${isParentActive ? styles.active : ""} ${edgeClass}`}
                  onClick={() => handleDotClick(index)}
                  aria-label={`Ir para ${labels[index] || `seção ${index + 1}`}`}
                  title={labels[index] || `Seção ${index + 1}`}
                />
                {subs.length > 0 && (
                  <div
                    className={`${styles.accordionWrapper} ${isParentActive ? styles.accordionOpen : ""}`}
                  >
                    <div className={styles.accordionInner}>
                      <div className={styles.subDotsContainer}>
                        {subs.map((sub, subIdx) => (
                          <button
                            key={`sub-${subIdx}`}
                            type="button"
                            aria-current={isParentActive && subIdx === activeSubIndex ? "location" : undefined}
                            tabIndex={isParentActive ? 0 : -1}
                            className={`${styles.subDot} ${subIdx === activeSubIndex ? styles.activeSubDot : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSubDotClick(sub.node);
                            }}
                            aria-label={`Ir para a subseção ${sub.label}`}
                            title={sub.label}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className={styles.rowsContainer}>
          {visibleIndices.map((index, i) => {
            const isParentActive = index === activeIndex;
            const subs = subSections[index] || [];

            return (
              <div key={i} className={styles.rowGroup}>
                <div className={styles.indicatorRow}>
                  <span
                    className={`${styles.label} ${isParentActive ? styles.activeLabel : ""}`}
                    title={labels[index] || ""}
                  >
                    {labels[index] || ""}
                  </span>
                </div>
                {subs.length > 0 && (
                  <div
                    className={`${styles.accordionWrapper} ${isParentActive ? styles.accordionOpen : ""}`}
                  >
                    <div
                      className={`${styles.accordionInner} ${styles.subRowInner}`}
                    >
                      <div className={styles.subRowsContainer}>
                        {subs.map((sub, subIdx) => (
                          <div
                            key={`sub-row-${subIdx}`}
                            className={styles.subRow}
                          >
                            <span
                              className={`${styles.subLabel} ${subIdx === activeSubIndex ? styles.activeSubLabel : ""}`}
                              title={sub.label}
                            >
                              {sub.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
