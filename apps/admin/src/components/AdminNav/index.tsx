import { NavLink } from "react-router";
import { ScrollArea } from "@jaci/ui/ScrollArea";
import { useAuth } from "../../contexts/AuthContext";
import { adminNavigation } from "../adminNavigation";
import styles from "./AdminNav.module.css";

export function AdminNav() {
  const { user } = useAuth();

  return (
    <nav className={styles.navContainer} aria-label="Navegação administrativa">
      <ScrollArea
        className={styles.navScrollArea}
        orientation="horizontal"
        showScrollbar={false}
        showScrollShadows
      >
        <div className={`container ${styles.navWrapper}`}>
          {adminNavigation.filter((item) => !('developerOnly' in item) || user?.role === "developer").map(({ href, label, icon: Icon }) => (
            <NavLink
              key={href}
              to={href}
              end={href === "/admin"}
              className={({ isActive }) => isActive ? `${styles.navItem} ${styles.active}` : styles.navItem}
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </ScrollArea>
    </nav>
  );
}
