import { useEffect, useState } from "react";

import { STORAGE_KEYS } from "@/lib/storage";
import { analytics } from "@/utils/analytics";

const THEME_CHANGE_EVENT = "app:theme-change";

function getIsDark() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.UI.THEME);
  return savedTheme === "dark" ||
    (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function useTheme() {
  const [isDark, setIsDark] = useState(getIsDark);

  useEffect(() => {
    const syncTheme = () => setIsDark(getIsDark());
    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", isDark);
  }, [isDark]);

  const toggleTheme = () => {
    const nextTheme = !getIsDark();
    localStorage.setItem(STORAGE_KEYS.UI.THEME, nextTheme ? "dark" : "light");
    document.body.classList.toggle("dark-mode", nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    analytics.trackThemeToggle(nextTheme ? "dark" : "light");
  };

  return { isDark, toggleTheme };
}
