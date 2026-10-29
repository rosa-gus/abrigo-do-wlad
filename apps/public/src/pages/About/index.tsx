import { Link } from "react-router";
import { useRef } from "react";
import * as Lucide from "lucide-react";
import * as CardComponent from "@jaci/ui/Card";
import Banner from "../../components/Banner";
import { Skeleton } from "@jaci/ui/Skeleton";
import { ScrollIndicators } from "../../components/ScrollIndicators";

import { getOptimizedImageUrl } from "@abrigo/media/cloudinary";
import { useDailyDog } from "../../hooks/useDailyDog";

import styles from "./About.module.css";
import * as TooltipComponent from "@jaci/ui/Tooltip";
import { Badge } from "@jaci/ui/Badge";

import { useMediaQuery } from "@uidotdev/usehooks";
import { PageFeedback } from "@/components/PageFeedback";

import heroImage from "@/assets/images/wlad.jpg"

export default function About() {
  const dog = useDailyDog();

  const image = dog?.fotos?.[0] ?? null;

  const sectionImageUrl = image
    ? getOptimizedImageUrl(image, {
        crop: "fill",
        width: 400,
        height: 600,
        quality: 100,
      })
    : "";

  const isDesktop = useMediaQuery("(min-width: 768px)");
  const containerRef = useRef<HTMLDivElement>(null!);

  return (
    <>
      <ScrollIndicators
        containerRef={containerRef}
        sectionCount={1}
        labels={["Trajetória"]}
      />
      <Banner
        image={heroImage}
        badge="Nossa trajetória"
        title="Uma história de amor e renúncia"
        description="Conheça os passos que transformaram um quintal em um refúgio de esperança."
      />
      <div className="container" ref={containerRef}>
        <div
          className={styles.historyContainer}
          style={{ gridTemplateColumns: "1.5fr 1fr", alignItems: "start" }}
        >
          <div className={styles.historyText}>
            <h2 className="section-title" data-subsection="Como tudo começou">
              Como tudo começou
            </h2>
            <p>
              Em 2012, Wladimir Cruz deixou um emprego fixo e bem remunerado
              para seguir o exemplo de seu pai, Sr. Bene, que sempre ajudou
              pessoas e, especialmente, animais. Bastava encontrar um cão
              perdido para acolhê-lo em casa.
            </p>
            <p>
              Com o tempo, Sr. Bene passou a apoiar outros protetores, cedendo
              parte de sua casa como lar temporário para cães resgatados.
              Inspirado pelo pai e comprometido com a causa animal, Wladimir
              também começou a resgatar. Logo, o amplo quintal da família se
              tornou o lar temporário de muitos cães abandonados — e assim
              nasceu o Abrigo do Wlad.
            </p>

            <h3 data-subsection="O espaço">O espaço</h3>
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

            <div data-subsection="Captação de recursos">
              <CardComponent.Card tone="info" variant="callout">
                <CardComponent.CardBody>
                  <CardComponent.CardHeader>
                    <CardComponent.CardIcon>
                      <Lucide.HandCoins size={30} strokeWidth={1.5} />
                    </CardComponent.CardIcon>
                    <CardComponent.CardTitle>
                      Captação de recursos
                    </CardComponent.CardTitle>
                  </CardComponent.CardHeader>
                  <CardComponent.CardContent>
                    <p>
                      Um dos projetos criados para arrecadar recursos foi a
                      reciclagem de tampinhas plásticas. A iniciativa coleta
                      tampas e outros materiais de polipropileno, que são
                      vendidos a empresas recicladoras. O valor arrecadado
                      contribui para as obras e para o cuidado dos animais.
                    </p>
                  </CardComponent.CardContent>
                </CardComponent.CardBody>
                <CardComponent.CardFooter>
                  <Link to="/tampinhas" className="btn-text">
                    <CardComponent.CardButton>
                      Saiba mais <Lucide.ArrowRight size={20} />
                    </CardComponent.CardButton>
                  </Link>
                </CardComponent.CardFooter>
              </CardComponent.Card>
            </div>

            <PageFeedback pageId="sobre_nos" />
          </div>

          <div className={styles.historyImageContainer}>
            {sectionImageUrl && isDesktop ? (
              <TooltipComponent.TooltipProvider>
                <TooltipComponent.Tooltip alwaysOpen={true}>
                  <TooltipComponent.TooltipTrigger>
                    <div style={{ position: "relative" }}>
                      <img
                        className={styles.historyImage}
                        src={sectionImageUrl}
                        alt={dog ? `Foto de ${dog.nome}` : "Cachorro do abrigo"}
                      />
                      {dog && dog.nome && (
                        <Badge
                          variant="primary"
                          size="sm"
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
                  </TooltipComponent.TooltipTrigger>
                  <TooltipComponent.TooltipContent side="bottom">
                    <p>
                      <strong>Desde 2012</strong>
                    </p>
                    <p>
                      Vidas transformadas por cuidado, dedicação e novas
                      oportunidades.
                    </p>
                  </TooltipComponent.TooltipContent>
                </TooltipComponent.Tooltip>
              </TooltipComponent.TooltipProvider>
            ) : (
              <Skeleton className={styles.historyImage} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
