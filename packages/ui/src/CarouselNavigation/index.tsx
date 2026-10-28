import type { HTMLAttributes } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "../Button";
import type { CarouselAPI } from "../Carousel";
import { cn } from "../utils";

import styles from "./CarouselNavigation.module.css";

export type CarouselNavigationProps = HTMLAttributes<HTMLDivElement> & {
  api: CarouselAPI;
  itemLabels?: readonly string[];
  previousLabel?: string;
  nextLabel?: string;
  dotsLabel?: string;
  showCounter?: boolean;
  showDots?: boolean;
  size?: "sm" | "md";
};

/**
 * Shared controls for Jaci carousels, with navigation, position and pagination.
 */
export function CarouselNavigation({
  api,
  itemLabels = [],
  previousLabel = "Ver item anterior",
  nextLabel = "Ver próximo item",
  dotsLabel = "Escolher item",
  showCounter = true,
  showDots = true,
  size = "sm",
  className,
  "aria-label": ariaLabel = "Navegação do carrossel",
  ...props
}: CarouselNavigationProps) {
  const isFirstPage = api.page === 0;
  const isLastPage = api.totalPages === 0 || api.page === api.totalPages - 1;
  const buttonSize = size === "sm" ? "icon-sm" : "icon";
  const iconSize = size === "sm" ? 18 : 22;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(styles.root, size === "md" && styles.md, className)}
      {...props}
    >
      <Button
        type="button"
        variant="ghost"
        size={buttonSize}
        onClick={api.goPrev}
        disabled={isFirstPage}
        aria-label={previousLabel}
      >
        <ChevronLeft size={iconSize} aria-hidden="true" />
      </Button>

      {showCounter && (
        <div className={styles.position} aria-live="polite" aria-atomic="true">
          <span>{api.totalPages === 0 ? 0 : api.page + 1}</span>
          <span aria-hidden="true">/</span>
          <span>{api.totalPages}</span>
        </div>
      )}

      {showDots && api.totalPages > 1 && (
        <div className={styles.dots} role="group" aria-label={dotsLabel}>
          {Array.from({ length: api.totalPages }, (_, index) => (
            <button
              key={index}
              type="button"
              className={styles.dot}
              data-active={api.page === index || undefined}
              onClick={() => api.goTo(index)}
              aria-label={
                itemLabels[index]
                  ? `Ver ${itemLabels[index]}`
                  : `Ir para item ${index + 1}`
              }
              aria-pressed={api.page === index}
            />
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size={buttonSize}
        onClick={api.goNext}
        disabled={isLastPage}
        aria-label={nextLabel}
      >
        <ChevronRight size={iconSize} aria-hidden="true" />
      </Button>
    </div>
  );
}
