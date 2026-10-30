import { ChevronRight, FilePenLine } from "lucide-react";
import { Link } from "react-router";
import { Card, CardBody, CardFooter } from "@jaci/ui/Card";
import { Button } from "@jaci/ui/Button";
import { analytics } from "@/utils/analytics";

import dogSticker from "@/assets/stickers/fluent-emoji/dog.svg";

import styles from "./AdoptionBanner.module.css";

interface AdoptionBannerProps {
  context?: "home" | "catalog";
}

export function AdoptionBanner({ context = "home" }: AdoptionBannerProps) {
  const isCatalog = context === "catalog";

  return (
    <section
      className={`${styles.section} ${isCatalog ? styles.catalog : ""}`}
      aria-labelledby="adoption-banner-title"
    >
      <Card tone="coral" className={styles.banner}>
        <CardBody className={styles.body}>
          <div className={styles.content}>
            <h2 id="adoption-banner-title" className={styles.title}>
              {isCatalog ? "Ainda não encontrou sua companhia?" : "Pensando em adotar?"}
            </h2>
            <p className={styles.introduction}>
              {isCatalog
                ? "Você pode preencher o formulário mesmo sem escolher um cão. Nossos voluntários poderão sugerir quem combina com sua rotina com base nas preferências que você compartilhar."
                : "Vamos conhecer você e encontrar uma boa companhia."}
            </p>
            {!isCatalog && (
              <p className={styles.description}>
                Tudo começa pelo formulário. Depois, conversamos com você e
                combinamos uma visita ao abrigo.
              </p>
            )}
          </div>
          <div className={styles.scene} aria-hidden="true">
            <img
              className={styles.dog}
              src={dogSticker}
              alt=""
              width={190}
              height={190}
            />
          </div>
        </CardBody>
        <CardFooter>
          <div className={styles.actions}>
            <Link
              to="/formulario"
              onClick={() => analytics.trackConversionIntent("adopt_form")}
            >
              <Button size={isCatalog ? "sm" : "md"} variant="secondary" tabIndex={-1}>
                <FilePenLine size={16} aria-hidden="true" />
                Preencher formulário
              </Button>
            </Link>
            {!isCatalog && (
              <Link
                to="/caes"
                onClick={() => analytics.trackButtonClick("adoption_banner_dogs_list")}
              >
                <Button size="md" variant="text" tabIndex={-1}>
                  Conhecer os cães
                  <ChevronRight size={16} aria-hidden="true" />
                </Button>
              </Link>
            )}
          </div>
        </CardFooter>
      </Card>
    </section>
  );
}
