import * as React from "react";

import { cn } from "../utils";
import styles from "./Separator.module.css";

export interface SeparatorProps
  extends Omit<React.ComponentPropsWithoutRef<"span">, "children" | "role" | "aria-hidden" | "aria-orientation"> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

export const Separator = React.forwardRef<HTMLSpanElement, SeparatorProps>(
  ({ orientation = "horizontal", decorative = true, className, ...props }, ref) => (
    <span
      {...props}
      ref={ref}
      role={decorative ? undefined : "separator"}
      aria-hidden={decorative ? true : undefined}
      aria-orientation={decorative ? undefined : orientation}
      data-orientation={orientation}
      className={cn(styles.root, styles[orientation], className)}
    />
  ),
);
Separator.displayName = "Separator";
