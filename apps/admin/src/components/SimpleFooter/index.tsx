import { ExternalLink } from "lucide-react";
import { Separator } from "@jaci/ui/Separator";
import { PUBLIC_APP_URL } from "../../config";
import styles from "./SimpleFooter.module.css";

export function SimpleFooter() {
  return (
    <div className={styles.wrapper}>
      <a
        href={PUBLIC_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
      >
        Portal Principal <ExternalLink size={14} />
      </a>

      <Separator orientation="vertical" className={styles.divider} />

      <span className={styles.text}>Desenvolvido por</span>

      <a href="https://github.com/AlanClimaco" target="_blank" rel="noopener noreferrer" className={styles.devLink}>
        Alan
      </a>

      <span className={styles.text}>&</span>

      <a href="https://github.com/spantalho" target="_blank" rel="noopener noreferrer" className={styles.devLink}>
        Luis
      </a>
    </div>
  );
}
