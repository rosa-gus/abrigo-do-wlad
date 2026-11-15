import { Link } from "react-router";
import { useRef } from "react";
import { ArrowRight, Quote } from "lucide-react";
import { Card, CardBody, CardContent, CardIcon, CardTitle } from "@jaci/ui/Card";

import Banner from "../../components/Banner";
import { ScrollIndicators } from "../../components/ScrollIndicators";
import { PageFeedback } from "@/components/PageFeedback";
import heroImage from "@/assets/images/wlad.jpg";
import bookSticker from "@/assets/stickers/fluent-emoji/book.svg";

import styles from "./About.module.css";

export default function About() {
  const containerRef = useRef<HTMLDivElement>(null!);

  return (
    <>
      <ScrollIndicators
        containerRef={containerRef}
        sectionCount={1}
        labels={["Trajetória"]}
      />
      <main>
        <Banner
          image={heroImage}
          title="Como nasceu o Abrigo do Wlad"
          description="Conheça a história do abrigo e das pessoas que dedicam sua vida ao cuidado de cães resgatados."
        />
        <div className="container" ref={containerRef}>
          <article className={styles.article} aria-labelledby="history-origin-title">
            <section className={styles.chapter} aria-labelledby="history-origin-title">
              <header className={styles.opening}>
                <img
                  className={styles.introSticker}
                  src={bookSticker}
                  alt=""
                  width={64}
                  height={64}
                />
                <h2 className="section-title" id="history-origin-title" data-subsection="Como tudo começou">
                  Como tudo começou
                </h2>
                <p className={styles.lead}>
                  Em 2012, Wladimir Cruz deixou um emprego fixo e bem remunerado
                  para seguir o exemplo de seu pai, Sr. Bene, que sempre ajudou
                  pessoas e, especialmente, animais.
                </p>
              </header>
              <Card variant="callout" tone="info" size="sm" layout="inline" className={styles.highlight}>
                <CardBody>
                  <CardIcon>
                    <Quote aria-hidden="true" />
                  </CardIcon>
                  <CardTitle>Sobre Sr. Bene</CardTitle>
                  <CardContent>
                    <p>Bastava encontrar um cão perdido para acolhê-lo em casa.</p>
                  </CardContent>
                </CardBody>
              </Card>
              <p>
                Com o tempo, Sr. Bene passou a apoiar outros protetores, cedendo
                parte de sua casa como lar temporário para cães resgatados.
                Inspirado pelo pai e comprometido com a causa animal, Wladimir
                também começou a resgatar. Logo, o amplo quintal da família se
                tornou o lar temporário de muitos cães abandonados — e assim
                nasceu o Abrigo do Wlad.
              </p>
            </section>

            <figure className={styles.photograph}>
              <img
                src={heroImage}
                alt="Wladimir Cruz sentado com cães do abrigo no colo."
                loading="lazy"
                decoding="async"
              />
              <figcaption>Wladimir Cruz com cães do Abrigo do Wlad.</figcaption>
            </figure>

            <section className={styles.chapter} aria-labelledby="history-space-title">
              <h2 id="history-space-title" data-subsection="O espaço">O espaço</h2>
              <p>
                À medida que o trabalho de lar temporário cresceu, os recursos
                continuaram limitados. Os custos vão muito além de ração e água:
                equipe, energia, medicamentos, manutenção, atendimento
                veterinário e internações consomem grande parte do orçamento. Os
                cães resgatados pelo próprio Wladimir são custeados integralmente
                por ele.
              </p>
              <p>
                Com o passar dos anos, o espaço se deteriorou e deixou de atender
                adequadamente às necessidades de conforto e segurança dos
                animais, sobretudo daqueles que permanecerão no abrigo.
              </p>
              <p>
                Com a ajuda de amigos e de projetos de arrecadação, uma obra foi
                iniciada em 2020 no terreno ao lado para criar espaços destinados
                a cães idosos e com necessidades especiais, quarentena e
                medicação. Em 2021, começaram as melhorias na área antiga, com
                reparos em pisos e infiltrações, reorganização dos ambientes e
                instalação de novos portões, telas e telhado.
              </p>
            </section>

            <section className={styles.chapter} aria-labelledby="history-support-title">
              <h2 id="history-support-title" data-subsection="Captação de recursos">
                Captação de recursos
              </h2>
              <p>
                Um dos projetos criados para arrecadar recursos foi a
                reciclagem de tampinhas plásticas. A iniciativa coleta
                tampas e outros materiais de polipropileno, que são
                vendidos a empresas recicladoras. O valor arrecadado
                contribui para as obras e para o cuidado dos animais.
              </p>
              <Link to="/tampinhas" className={styles.relatedLink}>
                Conheça o Projeto Tampinhas
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </section>

            <footer className={styles.articleFooter}>
              <PageFeedback pageId="sobre_nos" />
            </footer>
          </article>
        </div>
      </main>
    </>
  );
}
