import type { ComponentProps, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "../utils";
import styles from "./Toggle.module.css";

interface ToggleBaseProps
  extends Omit<
    ComponentProps<"button">,
    "type" | "onChange" | "children" | "aria-label" | "aria-labelledby"
  > {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  thumbContent?: ReactNode;
  size?: "sm" | "md";
  variant?: "default" | "subtle";
}

type ToggleAccessibleNameProps =
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-label"?: never; "aria-labelledby": string };

export type ToggleProps = ToggleBaseProps & ToggleAccessibleNameProps;

/** An accessible, animated switch for turning a setting on or off. */
export function Toggle({
  checked,
  onCheckedChange,
  thumbContent,
  size = "md",
  variant = "default",
  className,
  disabled,
  onClick,
  ...props
}: ToggleProps) {
  const reduceMotion = useReducedMotion();

  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "on" : "off"}
      data-size={size}
      disabled={disabled}
      className={cn(styles.switch, styles[variant], className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) {
          onCheckedChange(!checked);
        }
      }}
    >
      <motion.span
        className={styles.thumb}
        animate={{
          x: checked ? (size === "sm" ? 18 : 20) : 0,
        }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 700, damping: 30 }
        }
      >
        {thumbContent}
      </motion.span>
    </button>
  );
}
