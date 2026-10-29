import { Link, NavLink } from "react-router";
import { Instagram, Mail } from "lucide-react";
import styles from "./Footer.module.css";
import { analytics } from "@/utils/analytics";
import { SHELTER_INSTAGRAM_URL } from "@/utils/links";

import logo from "@/assets/images/logo.png";
import logoDark from "@/assets/images/logo-dark-mode.png";

import { ContactLink } from "@/components/common/ContactLink";
import { ExternalLink } from "@/components/common/ExternalLink";
import { LocationBadge } from "@/components/LocationBadge";

export function Footer() {
  return (
    <footer id="footer" className={styles.footer}>
      <div className={`container ${styles.footerGrid}`}>
        {/* Info */}
        <div className={styles.footerInfo}>
          <Link to="/" className={styles.footerBrand} aria-label="Abrigo do Wlad — início">
            <img
              src={logo}
              alt="logotipo do Abrigo do Wlad"
              className={styles.logoLight}
            />
            <img
              src={logoDark}
              alt="logotipo do Abrigo do Wlad"
              className={styles.logoDark}
            />
          </Link>
          <h2 className={styles.mission}>Desde 2012, acolhendo novas histórias.</h2>
          <p>
            Acolhemos cães resgatados e promovemos a adoção responsável.
            Um projeto independente, mantido por doações.
          </p>
          <div className={styles.footerBadges}>
            <LocationBadge />
          </div>
        </div>

        {/* Navigation */}
        <nav className={styles.footerLinks} aria-labelledby="footer-navigation-title">
          <h3 id="footer-navigation-title" className={styles.columnTitle}>Explore o abrigo</h3>
          <NavLink to="/" end className={styles.linkItem}>
            Início
          </NavLink>
          <NavLink to="/caes" className={styles.linkItem}>
            Nossos cães
          </NavLink>
          <NavLink to="/sobre" className={styles.linkItem}>
            Sobre nós
          </NavLink>
          <NavLink to="/tampinhas" className={styles.linkItem}>
            Projeto Tampinhas
          </NavLink>
          <NavLink to="/formulario" className={styles.linkItem} onClick={() => analytics.trackConversionIntent("adopt_form")}>
            Formulário de interesse
          </NavLink>
        </nav>

        {/* Contact */}
        <div className={styles.footerSocial}>
          <h3 className={styles.columnTitle}>Fique por perto</h3>

          <div className={styles.contactLinks}>
            <ContactLink
              href={SHELTER_INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              icon={<Instagram size={20} aria-hidden="true" />}
              label="Acompanhe o dia a dia"
            >
              @abrigodowlad
            </ContactLink>
            <ContactLink
              href="mailto:abrigodowlad@gmail.com"
              icon={<Mail size={20} aria-hidden="true" />}
              label="Converse com a gente"
              onClick={() => analytics.trackConversionIntent("contact", { method: "email" })}
            >
              abrigodowlad@gmail.com
            </ContactLink>
          </div>
        </div>
      </div>

      <div className={`container ${styles.footerBottom}`}>
        <div className={styles.footerBottomGroup}>
          <div className={styles.footerBottomCopyright}>
            <p>
              &copy; {new Date().getFullYear()} Abrigo do Wlad
            </p>
            <span className={styles.copyrightSeparator} aria-hidden="true">·</span>
            <p>Todos os direitos reservados</p>
          </div>
        </div>
        <div className={styles.footerBottomGroup}>
          <Link to="/politica-de-privacidade">Política de privacidade</Link>
          <p className={styles.credits}>
            Por{" "}
            <ExternalLink href="https://alanclimaco.github.io/Portfolio/">
              Alan
            </ExternalLink>
            &{" "}
            <ExternalLink href="https://rosa-gus.github.io/portfolio/">
              Luis
            </ExternalLink>
          </p>
        </div>
      </div>
    </footer>
  );
}
