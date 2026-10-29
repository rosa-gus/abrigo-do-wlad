import type { ComponentProps, ReactNode } from "react";
import style from "./Button.module.css";
import { cn } from "../utils";

type ButtonAppearanceProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "success" | "danger" | "outline" | "text" | "ghost";
  emphasis?: "strong" | "soft" | "minimal";
  size?: "sm" | "md" | "lg" | "icon" | "icon-sm";
  blur?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

type ButtonProps = ButtonAppearanceProps & ComponentProps<"button">;
type ButtonLinkProps = ButtonAppearanceProps & ComponentProps<"a">;

/**
 * A customizable button ui component.
 * @returns a JSX element representing the button.
 */
export function Button({
  children,
  variant = "primary",
  emphasis = "soft",
  size = "md",
  blur,
  leftIcon,
  rightIcon,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        style.btn,
        style[variant],
        style[emphasis],
        style[size],
        { [style.blur]: blur },
        className,
      )}
      {...props}
    >
      {leftIcon && <span className={style.icon}>{leftIcon}</span>}
      {children}
      {rightIcon && <span className={style.icon}>{rightIcon}</span>}
    </button>
  );
}

/** A native navigation link with the same appearance as Button. */
export function ButtonLink({
  children,
  variant = "primary",
  emphasis = "soft",
  size = "md",
  blur,
  leftIcon,
  rightIcon,
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      className={cn(
        style.btn,
        style[variant],
        style[emphasis],
        style[size],
        { [style.blur]: blur },
        className,
      )}
      {...props}
    >
      {leftIcon && <span className={style.icon}>{leftIcon}</span>}
      {children}
      {rightIcon && <span className={style.icon}>{rightIcon}</span>}
    </a>
  );
}
