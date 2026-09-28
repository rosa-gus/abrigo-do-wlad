import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils";

import styles from "./Dock.module.css";

export type DockProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

export function Dock({ children, className, "aria-label": ariaLabel = "Navegação principal", ...props }: DockProps) {
  return (
    <nav aria-label={ariaLabel} className={cn(styles.dock, className)} {...props}>
      {children}
    </nav>
  );
}

export type DockItemProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  active?: boolean;
  icon: ReactNode;
  label: string;
  showLabel?: boolean;
  tone?: "primary" | "info" | "success" | "danger";
};

export function DockItem({ active = false, className, icon, label, showLabel = false, tone = "primary", ...props }: DockItemProps) {
  return (
    <a
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={cn(
        styles.item,
        tone === "info" && styles.toneInfo,
        tone === "success" && styles.toneSuccess,
        tone === "danger" && styles.toneDanger,
        className,
      )}
      {...props}
    >
      <span className={styles.icon} aria-hidden="true">{icon}</span>
      {showLabel && <span className={styles.label} aria-hidden="true">{label}</span>}
    </a>
  );
}

export type DockActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
  showLabel?: boolean;
};

export const DockAction = forwardRef<HTMLButtonElement, DockActionProps>(function DockAction(
  { className, icon, label, showLabel = false, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} aria-label={label} className={cn(styles.item, className)} type={type} {...props}>
      <span className={styles.icon} aria-hidden="true">{icon}</span>
      {showLabel && <span className={styles.label} aria-hidden="true">{label}</span>}
    </button>
  );
});
