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
  badge: string;
  title: string;
  description: string;
  className?: string;
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
        <Badge
          size="lg"
          blur={true}
          variant="outline"
          style={{ color: "var(--always-white)", textTransform: "uppercase" }}
        >
          {badge}
        </Badge>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </section>
  );
}
