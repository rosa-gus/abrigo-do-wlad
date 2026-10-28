import { useState } from "react";
import { STORAGE_KEYS } from "@/lib/storage";

export function useIndicatorStorage() {
  const [isVisible, setIsVisible] = useState(() => {
    const isHidden = localStorage.getItem(STORAGE_KEYS.UI.INDICATORS_VISIBLE) === "false";
    return !isHidden;
  });
  const [isFadingOut, setIsFadingOut] = useState(false);

  const hideIndicator = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsFadingOut(false);
      localStorage.setItem(STORAGE_KEYS.UI.INDICATORS_VISIBLE, "false");
    }, 240);
  };

  const showIndicator = () => {
    localStorage.setItem(STORAGE_KEYS.UI.INDICATORS_VISIBLE, "true");
    setIsVisible(true);
    setIsFadingOut(false);
  };

  return { isVisible, isFadingOut, hideIndicator, showIndicator };
}
