import { Moon, Sun } from "lucide-react";
import styles from "./ThemeToggle.module.css";
import { useTheme } from "@/hooks/useTheme";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@jaci/ui/Tooltip";
import { motion } from "motion/react";

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={styles.switchContainer}>
            <button
              className={`${styles.switch} ${isDark ? styles.dark : ""}`}
              onClick={toggleTheme}
              role="switch"
              aria-checked={isDark}
              aria-label={
                isDark ? "Mudar para modo claro" : "Mudar para modo escuro"
              }
            >
              <motion.div
                className={styles.thumb}
                animate={{ x: isDark ? 20 : 0 }}
                transition={{
                  type: "spring",
                  stiffness: 700,
                  damping: 30,
                }}
              >
                {isDark ? (
                  <Moon className={styles.icon} />
                ) : (
                  <Sun className={styles.icon} />
                )}
              </motion.div>
            </button>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            Alterar para{" "}
            <strong>{isDark ? "modo claro" : "modo escuro"}</strong>
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
