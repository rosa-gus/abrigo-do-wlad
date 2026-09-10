import { Link, NavLink } from "react-router";
import * as Lucide from "lucide-react";
import styles from "./Footer.module.css";
import { analytics } from "@/utils/analytics";

import logo from "@/assets/images/logo.png";
import logoDark from "@/assets/images/logo-dark-mode.png";

import { ExternalLink } from "@/components/common/ExternalLink";
import { Badge } from "@jaci/ui/Badge";
import { useIsDesktop } from "@/hooks/useIsDesktop";

export function Footer() {
  const isDesktop = useIsDesktop();

  return (
    <footer id="footer" className={styles.footer}>
      <div className={`container ${styles.footerGrid}`}>
        {/* Info */}
        <div className={styles.footerInfo}>
          <div className={styles.footerBrand}>
            {/* logos */}
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

            <span>ABRIGO DO WLAD</span>
          </div>
          <p>
            Desde 2012, o Abrigo do Wlad acolhe e cuida de cães resgatados.
            Somos um projeto social independente, mantido por doações e
            dedicado à adoção responsável.
          </p>
          <div className={styles.footerBadges}>
            <Badge variant="success" leftIcon={<Lucide.MapPin />}>
              São Paulo <span style={{ opacity: 0.5 }}>•</span> Morumbi
            </Badge>
          </div>
        </div>

        {/* Navigation */}
        <div className={styles.footerLinks}>
          <h4 className={styles.columnTitle}>Navegação</h4>
          <NavLink to="/" className={styles.linkItem}>
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
        </div>

        {/* Contact */}
        <div className={styles.footerSocial}>
          <h4 className={styles.columnTitle}>Fale conosco</h4>

          <a
            href="https://instagram.com/abrigodowlad"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.contactItem}
          >
            <div className={styles.iconBox}>
              <Lucide.Instagram size={20} />
            </div>
            <span>@abrigodowlad</span>
          </a>

          <a
            href="mailto:abrigodowlad@gmail.com"
            className={styles.contactItem}
            onClick={() => analytics.trackConversionIntent("contact", { method: "email" })}
          >
            <div className={styles.iconBox}>
              <Lucide.Mail size={20} />
            </div>
            <span>abrigodowlad@gmail.com</span>
          </a>
        </div>
      </div>

      <div className={`container ${styles.footerBottom}`}>
        <div className={styles.footerBottomGroup}>
          <div className={styles.footerBottomCopyright}>
            <p style={{ opacity: 0.8 }}>
              &copy; {new Date().getFullYear()} Abrigo do Wlad
            </p>
            {isDesktop && <span style={{ opacity: 0.5 }}>•</span>}
            <p style={{ opacity: 0.8 }}>Todos os direitos reservados</p>
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
