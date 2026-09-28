import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router";
import * as Lucide from "lucide-react";

import logo from "@/assets/images/logo.png";
import logoDark from "@/assets/images/logo-dark-mode.png";

import { Button } from "@jaci/ui/Button";
import * as Dialog from "@jaci/ui/Dialog";
import { ThemeToggle } from "../ThemeToggle";
import { analytics } from "@/utils/analytics";

import PixModal from "@/components/PixModal";
import styles from "./Header.module.css";

export function Header() {
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [logoError, setLogoError] = useState<boolean>(false);
  const location = useLocation();

  // scroll detect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const getLinkClass = (path: string) => {
    return location.pathname === path
      ? `${styles.navLink} ${styles.activeLink}`
      : styles.navLink;
  };

  const headerClasses = `${styles.headerContainer} ${location.pathname.startsWith("/beta/formulario") ? styles.formNavigation : ""} ${
    isScrolled && !menuOpen ? styles.headerScrolled : ""
  }`;

  return (
    <header className={headerClasses}>
      <div className={styles.logo}>
        <NavLink to="/" onClick={closeMenu}>
          {logoError ? (
            <span style={{ fontWeight: 800, color: "var(--primary)" }}>
              ABRIGO DO WLAD
            </span>
          ) : (
            <>
              {/* LOGO MODO CLARO */}
              <img
                src={logo}
                alt="Abrigo do Wlad"
                className={styles.logoLight}
                onError={() => setLogoError(true)}
              />

              {/* LOGO MODO ESCURO */}
              <img
                src={logoDark}
                alt="Abrigo do Wlad"
                className={styles.logoDark}
                onError={() => setLogoError(true)}
              />
            </>
          )}
        </NavLink>
      </div>

      {/* NAVEGAÇÃO */}
      <nav className={`${styles.navMenu} ${menuOpen ? styles.active : ""}`}>
        <NavLink to="/" className={getLinkClass("/")} onClick={closeMenu}>
          Início
        </NavLink>

        <NavLink
          to="/caes"
          className={getLinkClass("/caes")}
          onClick={closeMenu}
        >
          Cães
        </NavLink>

        <NavLink
          to="/sobre"
          className={getLinkClass("/sobre")}
          onClick={closeMenu}
        >
          Sobre nós
        </NavLink>

        <NavLink
          to="/tampinhas"
          className={getLinkClass("/tampinhas")}
          onClick={closeMenu}
        >
          Tampinhas
        </NavLink>

        {/* Botão de Doação */}
        <Dialog.Dialog>
          <Dialog.DialogTrigger asChild>
            <Button
              className={styles.mainBtn}
              size="md"
              variant="secondary"
              onClick={() => analytics.trackButtonClick("header_donate")}
            >
              <Lucide.HeartHandshake size={20} />
              <span>Quero ajudar</span>
            </Button>
          </Dialog.DialogTrigger>
          <PixModal />
        </Dialog.Dialog>
      </nav>

      {/* AÇÕES */}
      <div className={styles.actionsContainer}>
        <div className={styles.themeControl}><ThemeToggle /></div>

        <button
          className={`${styles.hamburger} ${menuOpen ? styles.active : ""}`}
          onClick={toggleMenu}
          aria-label="Menu"
        >
          <span className={styles.bar}></span>
          <span className={styles.bar}></span>
          <span className={styles.bar}></span>
        </button>
      </div>
    </header>
  );
}
