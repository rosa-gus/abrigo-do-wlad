import { Link } from "react-router";
import * as Lucide from "lucide-react";

import { Button } from "@jaci/ui/Button";
import { Badge } from "@jaci/ui/Badge";
import { Skeleton } from "@jaci/ui/Skeleton";
import { analytics } from "@/utils/analytics";
import {
  getOptimizedImageUrl,
  getThumbnailUrl,
} from "@abrigo/media/cloudinary";

import type { Dog } from "@/types/dogs";
import mockHeroImage from "@/assets/images/wlad.jpg";
import mockThumbnailImage from "@/assets/images/simba.jpg";

import styles from "./Hero.module.css";

interface HeroProps {
  dog: Dog | null;
}

export function Hero({ dog }: HeroProps) {
  const mainImage = import.meta.env.PUBLIC_DEV_TOOLS
    ? mockHeroImage
    : dog?.fotos?.[0] ?? null;
  const secondaryImage = import.meta.env.PUBLIC_DEV_TOOLS
    ? mockThumbnailImage
    : dog?.fotos?.[1] ?? null;

  const heroImageUrl = mainImage
    ? getOptimizedImageUrl(mainImage, {
        crop: "fill",
        gravity: "auto",
        width: 600,
        height: 500,
      })
    : "";

  const thumbnailImageUrl = secondaryImage
    ? getThumbnailUrl(secondaryImage, 128)
    : "";

  return (
    <section className={styles.heroContainer}>
      <div className={styles.heroContent}>
        <h1 className={styles.title}>
          Transformando abandono em novos começos.
        </h1>

        <p className={styles.description}>
          O <strong>Abrigo do Wlad</strong> é um projeto social independente que
          acolhe, cuida e busca novas famílias para cães resgatados. Adote,
          contribua e faça parte dessa história.
        </p>

        <div className={styles.btnGroup}>
          <Link to="/caes" className="btn-primary" onClick={() => analytics.trackButtonClick("hero_dogs_list")}>
            <Button size="lg">Conheça nossos cães</Button>
          </Link>

          <a href="#historia" className="btn-secondary" onClick={() => analytics.trackButtonClick("hero_our_story")}>
            <Button size="lg" variant="text">
              Nossa história
              <Lucide.ChevronRight size={25} />
            </Button>
          </a>
        </div>
      </div>

      {/* image */}
      <div className={styles.heroOverlay}>
        {heroImageUrl ? (
          <img
            className={styles.heroImage}
            src={heroImageUrl}
            alt={
              import.meta.env.PUBLIC_DEV_TOOLS
                ? "Cães do Abrigo do Wlad"
                : dog
                  ? `Foto de ${dog.nome}`
                  : "Cachorro para adoção"
            }
          />
        ) : (
          <Skeleton className={styles.heroImage} />
        )}

        {mainImage && secondaryImage && thumbnailImageUrl && (
          <img
            className={styles.heroThumbnail}
            src={thumbnailImageUrl}
            alt={
              import.meta.env.PUBLIC_DEV_TOOLS
                ? "Cão do Abrigo do Wlad"
                : dog
                  ? `Foto de ${dog.nome}`
                  : "Cachorro para adoção"
            }
          />
        )}
        {!import.meta.env.PUBLIC_DEV_TOOLS && dog && dog.nome && (
          <Badge
            variant="primary"
            size="md"
            leftIcon={<Lucide.Dog />}
            style={{
              position: "absolute",
              bottom: "-0.5rem",
              right: "-0.5rem",
              zIndex: 10,
              pointerEvents: "none",
              border: "3px solid var(--bg-body)",
            }}
          >
            {dog.nome}
          </Badge>
        )}
      </div>
    </section>
  );
}
