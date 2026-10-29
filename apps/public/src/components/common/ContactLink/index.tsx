import type { ComponentProps, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import styles from "./ContactLink.module.css";

type ContactLinkProps = ComponentProps<"a"> & {
  icon: ReactNode;
  label: string;
};

export function ContactLink({
  icon,
  label,
  children,
  className,
  ...props
}: ContactLinkProps) {
  return (
    <a className={[styles.contactItem, className].filter(Boolean).join(" ")} {...props}>
      <span className={styles.iconBox} aria-hidden="true">{icon}</span>
      <span className={styles.contactContent}>
        <span className={styles.contactLabel}>{label}</span>
        <span className={styles.contactAddress}>{children}</span>
      </span>
      <ArrowRight size={18} className={styles.contactArrow} aria-hidden="true" />
    </a>
  );
}
