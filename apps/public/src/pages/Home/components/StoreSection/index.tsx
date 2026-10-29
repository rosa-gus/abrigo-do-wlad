import { useEffect, useRef, useState } from "react";
import reveal from "../../Reveal.module.css";
import { useSectionReveal } from "../../useSectionReveal";
import { ArrowUpRight, HeartHandshake, ShoppingBag } from "lucide-react";

import { Badge } from "@jaci/ui/Badge";
import { ButtonLink } from "@jaci/ui/Button";
import * as CardComponent from "@jaci/ui/Card";

import styles from "./StoreSection.module.css";
import dogCollageCutout from "@/assets/images/dog-collage-cutout.png";
import { STORE_URL } from "@/utils/links";

export function StoreSection() {
  const { sectionRef, isVisible } = useSectionReveal();
  const tagRef = useRef<HTMLDivElement>(null);
  const [isTagVisible, setIsTagVisible] = useState(false);

  useEffect(() => {
    const tag = tagRef.current;
    if (!tag) return;
    if (!window.IntersectionObserver) {
      setIsTagVisible(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        setIsTagVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(tag);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="bazar"
      aria-labelledby="bazar-title"
      className={styles.contentSection}
      ref={sectionRef}
    >
      <div className={styles.gridContainer}>
        <div className={`${styles.textSide} ${reveal.item} ${isVisible ? reveal.visible : ""}`}>
          <Badge variant="primary" size="md" leftIcon={<ShoppingBag aria-hidden="true" />}>
            Bazar solidário
          </Badge>
          <h2 id="bazar-title" className={styles.title}>
            Seu próximo achado pode ajudar muitos cães.
          </h2>
          <p className={styles.description}>
            No Bazar Pet Solidário, itens variados e novas descobertas têm uma
            causa em comum: ajudar os cães do Abrigo do Wlad e do Abrigo Batalha Animal.
          </p>
        </div>

        <div
          aria-hidden="true"
          ref={tagRef}
          data-revealed={isTagVisible}
          className={`${styles.tagWrapper} ${reveal.item} ${isVisible ? reveal.visible : ""}`}
        >
          <div className={styles.tag}>
            <svg className={styles.tagCord} viewBox="0 0 72 104" fill="none">
              <path d="M36 100C28 78 8 39 23 16C39-8 66 44 49 76L36 100" />
              <path d="M32 98L40 101M33 102L39 98" />
            </svg>
            <span className={styles.tagHole} />
            <span className={styles.tagEyebrow}>Tem algo pra você por aqui.</span>
            <span className={styles.tagName}>Bazar<br />Pet Solidário</span>
            <span className={styles.tagPortrait}>
              <img
                src={dogCollageCutout}
                alt=""
                className={styles.tagDog}
                width={1355}
                height={1160}
                loading="lazy"
                decoding="async"
              />
            </span>
            <span className={styles.tagCaption}>
              E uma ajudinha<br />pra nós também.
            </span>
          </div>
        </div>

        <div className={`${styles.actions} ${reveal.item} ${isVisible ? reveal.visible : ""}`}>
          <ButtonLink
            href={STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.storeLink}
            variant="primary"
            emphasis="strong"
            rightIcon={<ArrowUpRight size={20} aria-hidden="true" />}
          >
            Garimpar no Instagram
          </ButtonLink>
          <p className={styles.availability}>
            Os achadinhos mudam rápido.<br />
            Confira a disponibilidade no perfil.
          </p>
        </div>
      </div>

      <div className={`${styles.support} ${reveal.item} ${isVisible ? reveal.visible : ""}`}>
        <CardComponent.Card variant="callout" tone="success" size="sm" layout="inline">
          <CardComponent.CardBody>
            <CardComponent.CardIcon>
              <HeartHandshake size={24} aria-hidden="true" />
            </CardComponent.CardIcon>
            <CardComponent.CardTitle>
              Cada compra ajuda a manter o cuidado.
            </CardComponent.CardTitle>
            <CardComponent.CardContent>
              <p>
                A renda apoia o resgate e o cuidado dos cães do Abrigo do Wlad
                e do Abrigo Batalha Animal.
              </p>
            </CardComponent.CardContent>
          </CardComponent.CardBody>
        </CardComponent.Card>
      </div>
    </section>
  );
}
