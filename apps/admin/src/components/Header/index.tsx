import { Link } from "react-router";
import { FlaskConical, LogOut, ShieldCheck } from "lucide-react";
import { Badge } from "@jaci/ui/Badge";
import { Button } from "@jaci/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { ADMIN_LOCAL_MODE, ADMIN_MOCK_MODE } from "../../services/api";
import styles from "./Header.module.css";
import logoImg from "../../assets/logo1.png";

export function Header() {
  const { user, logout } = useAuth();
  const userName = user?.email || "Usuário";

  return (
    <header className={styles.header}>
      <div className={`container ${styles.headerContent}`}>

        <Link
          to="/admin"
          className={styles.brandArea}
          aria-label="Ir para a visão geral do painel"
        >
          <img src={logoImg} alt="Abrigo do Wlad" className={styles.logo} />
          <div className={styles.divider}></div>
          <Badge
            className={styles.adminTag}
            leftIcon={<ShieldCheck size={18} />}
            variant="outline"
            size="sm"
          >
            Painel Admin
          </Badge>
          {ADMIN_MOCK_MODE && (
            <Badge
              className={styles.mockTag}
              leftIcon={<FlaskConical size={16} />}
              variant="danger"
              size="sm"
              aria-label="Ambiente com dados simulados"
              title="Ambiente com dados simulados"
            >
              Dados simulados
            </Badge>
          )}
          {ADMIN_LOCAL_MODE && (
            <Badge
              className={styles.mockTag}
              leftIcon={<FlaskConical size={16} />}
              variant="danger"
              size="sm"
              title="Dados reais do Firebase abrigo-do-wlad-dev"
            >
              DB de desenvolvimento
            </Badge>
          )}
        </Link>

        <div className={styles.userArea}>
          <div className={styles.userInfo} title={userName}>
            <span className={styles.welcomeLabel}>Olá,</span>
            <span className={styles.userName}>{userName}</span>
          </div>

          <Button
            onClick={logout}
            className={styles.logoutBtn}
            variant="outline"
            size="icon"
            title="Sair do sistema"
            aria-label="Sair do sistema"
          >
            <LogOut size={20} />
          </Button>
        </div>

      </div>
    </header>
  );
}
