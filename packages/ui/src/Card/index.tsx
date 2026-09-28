import type { HTMLAttributes } from "react";
import styles from "./Card.module.css";
import { cn } from "../utils";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "callout" | "image";
  tone?:
    | "neutral"
    | "muted"
    | "info"
    | "success"
    | "coral"
    | "warning"
    | "danger";
  size?: "xs" | "sm" | "md" | "lg";
  layout?: "stacked" | "inline";
  interactive?: boolean;
};

/**
 * Groups related content with independent visual purpose, tone and layout.
 */
export function Card({
  className,
  variant = "default",
  tone = "neutral",
  size = "md",
  layout = "stacked",
  interactive = false,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        styles.card,
        variant === "callout" && styles.callout,
        variant === "image" && styles.imageVariant,
        tone === "muted" && styles.toneMuted,
        tone === "info" && styles.toneInfo,
        tone === "success" && styles.toneSuccess,
        tone === "coral" && styles.toneCoral,
        tone === "warning" && styles.toneWarning,
        tone === "danger" && styles.toneDanger,
        size === "xs" && styles.xs,
        size === "sm" && styles.sm,
        size === "lg" && styles.lg,
        layout === "inline" && styles.layoutInline,
        interactive && styles.interactive,
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.cardHeader, className)} {...props} />;
}

export function CardIcon({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.cardIcon, className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <h3 className={cn(styles.cardTitle, className)} {...props} />;
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.cardContent, className)} {...props} />;
}

export function CardBody({
  className,
  style,
  imageSrc,
  ...props
}: HTMLAttributes<HTMLDivElement> & { imageSrc?: string }) {
  const bodyStyle = imageSrc ? { backgroundImage: `url(${imageSrc})`, ...style } : style;

  return <div className={cn(styles.cardBody, className)} style={bodyStyle} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.cardFooter, className)} {...props} />;
}

export function CardButton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.cardButton, className)} {...props} />;
}
