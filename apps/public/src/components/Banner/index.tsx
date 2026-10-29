import type { ReactNode } from "react";
import { Badge } from "@jaci/ui/Badge";
import {
  getOptimizedImageUrl,
  getResponsiveImageSrcSet,
} from "@abrigo/media/cloudinary";
import styles from "./Banner.module.css";

const DESKTOP_BANNER_SIZE = { width: 1920, height: 800 } as const;
const MOBILE_BANNER_SIZE = { width: 768, height: 800 } as const;

type BannerProps = {
  image?: string;
  badge?: string;
  title: string;
  description: string;
  className?: string;
  children?: ReactNode;
  leading?: ReactNode;
};

/**
 * Banner utilizado nas páginas internas do painel público.
 */
export default function Banner({
  image,
  badge,
  title,
  description,
  className,
  children,
  leading,
}: BannerProps) {
  const desktopImage = getOptimizedImageUrl(image, {
    ...DESKTOP_BANNER_SIZE,
    quality: 80,
    crop: "fill",
    gravity: "auto",
  });
  const desktopImageSrcSet = getResponsiveImageSrcSet(
    image,
    [1280, DESKTOP_BANNER_SIZE.width],
    {
      ...DESKTOP_BANNER_SIZE,
      quality: 80,
      crop: "fill",
      gravity: "auto",
    },
  );
  const mobileImage = getOptimizedImageUrl(image, {
    ...MOBILE_BANNER_SIZE,
    quality: 80,
    crop: "fill",
    gravity: "auto",
  });
  const mobileImageSrcSet = getResponsiveImageSrcSet(
    image,
    [384, MOBILE_BANNER_SIZE.width],
    {
      ...MOBILE_BANNER_SIZE,
      quality: 80,
      crop: "fill",
      gravity: "auto",
    },
  );

  return (
    <div className={styles.bannerFrame}>
      <section className={`${styles.banner} ${className ?? ""}`}>
        {desktopImage && (
          <picture className={styles.bannerBackground} aria-hidden="true">
            <source
              media="(max-width: 768px)"
              srcSet={mobileImageSrcSet || mobileImage}
              sizes="100vw"
            />
            <img
              src={desktopImage}
              srcSet={desktopImageSrcSet || undefined}
              sizes="100vw"
              width={DESKTOP_BANNER_SIZE.width}
              height={DESKTOP_BANNER_SIZE.height}
              alt=""
              decoding="async"
              fetchPriority="high"
            />
          </picture>
        )}
        <div className={styles.bannerOverlay} />
        <div className={styles.bannerContent}>
          {leading}
          {badge && <Badge
            size="lg"
            blur={true}
            variant="outline"
            className={styles.imageBadge}
          >
            {badge}
          </Badge>}
          <h1>{title}</h1>
          <p>{description}</p>
          {children}
        </div>
      </section>
    </div>
  );
}
