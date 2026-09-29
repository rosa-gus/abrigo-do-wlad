import { useEffect, useRef, useState } from "react";
import * as Lucide from "lucide-react";

import { Button } from "@jaci/ui/Button";
import { Badge } from "@jaci/ui/Badge";

import styles from "./StoreSection.module.css";
import storeImage from "@/assets/images/bazar.jpg";
import { STORE_URL } from "@/utils/links";

export function StoreSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.2,
      },
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="bazar"
      className={`${styles.contentSection}`}
      ref={sectionRef}
    >
      <div className={styles.gridContainer}>
        <div
          className={`${styles.textSide} ${isVisible ? styles.visible : ""}`}
        >
          <div className={styles.header}>
            <h2 className="section-title">Bazar Pet Solidário</h2>
            <Badge
              variant="success"
              size="md"
              leftIcon={<Lucide.ShoppingCart />}
            >
              Lojinha
            </Badge>
          </div>

          <p>
            Nosso bazar oferece produtos e artigos com preços acessíveis, e toda
            a renda é revertida para ajudar o Abrigo do Wlad e o Abrigo
            Batalha Animal no resgate e cuidado de cães abandonados.
          </p>

          <p>
            Ao comprar conosco, você não apenas leva algo especial para casa,
            mas também contribui diretamente para transformar a vida de muitos
            cães que precisam de amor e cuidado.
          </p>

          <div className={styles.buttonWrapper}>
            <a href={STORE_URL} target="_blank" rel="noopener noreferrer">
              <Button variant="text" rightIcon={<Lucide.ArrowUpRight size={20} />}>
                Visitar bazar
              </Button>
            </a>
          </div>
        </div>

        <div
          className={`${styles.imageWrapper} ${
            isVisible ? styles.visible : ""
          }`}
        >
          <img src={storeImage} alt="Bazar Pet Solidário" />
        </div>
      </div>
    </section>
  );
}
