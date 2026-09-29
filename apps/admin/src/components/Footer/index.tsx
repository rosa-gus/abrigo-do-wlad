import { ExternalLink } from "lucide-react";
import { PUBLIC_APP_URL } from "../../config";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.content}`}>
        <div className={styles.infoGroup}>
          <span>&copy; {new Date().getFullYear()} Abrigo do Wlad</span>
          <a
            href={PUBLIC_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.portalLink}
            title="Abrir site público em outra aba"
          >
            Acessar Portal Público <ExternalLink size={14} />
          </a>
        </div>

        <div className={styles.creditsGroup}>
          <span>Por</span>

          <a
            href="https://alanclimaco.github.io/Portfolio/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.devLink}
          >
            Alan
          </a>

          <span>&amp;</span>

          <a
            href="https://rosa-gus.github.io/portfolio/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.devLink}
          >
            Luis
          </a>
        </div>
      </div>
    </footer>
  );
}
