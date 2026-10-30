import * as React from "react";

import { cn } from "../utils";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps
  extends Omit<React.ComponentProps<"div">, "title"> {
  /** Decorative icon. EmptyState provides its tonal background, color and size. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  headingLevel?: 2 | 3 | 4;
  size?: "sm" | "md" | "lg";
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      icon,
      title,
      description,
      actions,
      headingLevel = 3,
      size = "md",
      className,
      ...props
    },
    ref,
  ) => {
    const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";

    return (
      <div
        {...props}
        ref={ref}
        className={cn(styles.root, styles[size], className)}
      >
        {icon && (
          <div className={styles.icon} aria-hidden="true">
            {icon}
          </div>
        )}
        <div className={styles.content}>
          <Heading className={styles.title}>{title}</Heading>
          {description && (
            <div className={styles.description}>{description}</div>
          )}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    );
  },
);
EmptyState.displayName = "EmptyState";
