import { useEffect, useRef, useState } from "react";
import * as Lucide from "lucide-react";
import { Link } from "react-router";
import { type Dog, CORES_MAP } from "@/types/dogs";
import styles from "./DogModal.module.css";
import { Button } from "@jaci/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@jaci/ui/Dialog";
import { Badge } from "@jaci/ui/Badge";
import { ExternalLink } from "@/components/common/ExternalLink";
import * as CardComponent from "@jaci/ui/Card";
import { Carousel } from "@jaci/ui/Carousel";
import { CarouselNavigation } from "@jaci/ui/CarouselNavigation";
import { ScrollArea } from "@jaci/ui/ScrollArea";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { analytics } from "@/utils/analytics";
import { shareDogProfile } from "@/utils/shareDog";
import { getOptimizedImageUrl } from "@abrigo/media/cloudinary";
import { preloadDogImages } from "@/utils/common";

interface ModalProps {
  dog: Dog | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DogModal({ dog: parentDog, isOpen, onClose }: ModalProps) {
  const isDesktop = useIsDesktop();

  const [prevParentDog, setPrevParentDog] = useState<Dog | null>(parentDog);
  const [displayedDog, setDisplayedDog] = useState<Dog | null>(parentDog);
  const [isSharing, setIsSharing] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const feedbackTimerRef = useRef<number | null>(null);

  if (parentDog && parentDog !== prevParentDog) {
    setPrevParentDog(parentDog);
    setDisplayedDog(parentDog);
  }

  const dog = displayedDog;

  useEffect(() => {
    setIsSharing(false);
    setShareFeedback("idle");
  }, [dog?.id, isOpen]);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
  }, []);

  if (!dog) return null;

  const photos = dog.fotos || [];
  const hasMultipleImages = photos.length > 1;
  const optimizedPhotos = photos.map((photo) =>
    getOptimizedImageUrl(photo, {
      width: 1400,
      height: 1400,
      quality: "auto",
      format: "auto",
      crop: "limit",
    })
  );

  const handleClose = () => {
    onClose();
  };

  const showTemporaryShareFeedback = (feedback: "copied" | "error") => {
    setShareFeedback(feedback);
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setShareFeedback("idle");
      feedbackTimerRef.current = null;
    }, 2500);
  };

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const result = await shareDogProfile(dog);
      if (result === "copied") showTemporaryShareFeedback("copied");
      if (result !== "cancelled") {
        analytics.trackButtonClick("dog_share", {
          dog_id: dog.id,
          dog_name: dog.nome,
          method: result === "shared" ? "native" : "copy",
        });
      }
    } catch (error) {
      console.error("Erro ao compartilhar o perfil do cachorro:", error);
      showTemporaryShareFeedback("error");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent size="fullscreen-mobile" className={styles.modalContent}>
        <div
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          <DialogTitle>{dog.nome}</DialogTitle>
          <DialogDescription>
            Detalhes do cachorro {dog.nome}, {dog.idade}, {dog.sexo}.
          </DialogDescription>
        </div>

        <ScrollArea className={styles.modalScrollArea} showScrollShadows>
          <div className={styles.contentGrid}>
            {/* --- CARROSSEL DE IMAGENS --- */}
            <div className={styles.carouselContainer}>
              <Carousel
                render={api => (
                  <div className={styles.carouselButtons}>
                    {!isDesktop && (
                      <div>
                        <Button
                          variant="outline"
                          className={styles.mobileCloseButton}
                          onClick={handleClose}
                          size="icon"
                          aria-label={`Fechar detalhes de ${dog.nome}`}
                        >
                          <Lucide.X size={20} aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                    {hasMultipleImages && (
                      <CarouselNavigation
                        api={api}
                        size={isDesktop ? "md" : "sm"}
                        showDots={isDesktop}
                        itemLabels={photos.map(
                          (_, index) => `foto ${index + 1} de ${dog.nome}`,
                        )}
                        previousLabel="Ver foto anterior"
                        nextLabel="Ver próxima foto"
                        dotsLabel={`Escolher foto de ${dog.nome}`}
                        aria-label={`Navegação das fotos de ${dog.nome}`}
                      />
                    )}
                  </div>
                )}
              >
                {optimizedPhotos.map((photo, index) => (
                  <img
                    key={index}
                    src={photo}
                    alt={`${dog.nome} - foto ${index + 1}`}
                    className={styles.carouselImage}
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                    onLoad={() => {
                      const nextPhoto = optimizedPhotos[index + 1];
                      if (nextPhoto) {
                        void preloadDogImages([nextPhoto]).catch(() => undefined);
                      }
                    }}
                  />
                ))}
              </Carousel>
            </div>
            {/* --- DETALHES DO DOG --- */}
            <div className={styles.details}>
              <div className={styles.detailsHeader}>
                <div className={styles.titleWrapper}>
                  <h2 className={styles.title}>{dog.nome}</h2>
                  {isDesktop && (
                    <div className={styles.closeButton}>
                      <Button variant="ghost" onClick={handleClose} size="icon">
                        <Lucide.X size={22} />
                      </Button>
                    </div>
                  )}
                </div>

                <div className={styles.badges}>
                  <Badge
                    variant="secondary"
                    leftIcon={<Lucide.Calendar size={14} />}
                  >
                    {dog.idade}
                  </Badge>

                  <Badge
                    variant="secondary"
                    leftIcon={
                      dog.sexo === "Macho" ? (
                        <Lucide.Mars size={14} />
                      ) : (
                        <Lucide.Venus size={14} />
                      )
                    }
                  >
                    {dog.sexo}
                  </Badge>
                </div>

                {dog.instaLink && (
                  <ExternalLink
                    href={dog.instaLink as string}
                    style={{ textDecoration: "none" }}
                  >
                    <div className={styles.instagramPill}>
                      <Lucide.Instagram size={18} />
                      <span>Conhecer no Instagram</span>
                    </div>
                  </ExternalLink>
                )}

                <p className={styles.description}>
                  {dog.descricaoCompleta ||
                    `O ${dog.nome} é um cãozinho incrível que está esperando por um lar.`}
                </p>
              </div>

              <div className={styles.callouts}>
                <CardComponent.Card
                  variant="callout"
                  tone="success"
                  size="sm"
                  layout="inline"
                >
                  <CardComponent.CardBody>
                    <CardComponent.CardIcon>
                      <Lucide.BriefcaseMedical size={24} />
                    </CardComponent.CardIcon>
                    <CardComponent.CardTitle>Saúde</CardComponent.CardTitle>
                    <CardComponent.CardContent>
                      <p>
                        <strong>{dog.status}</strong>
                      </p>
                    </CardComponent.CardContent>
                  </CardComponent.CardBody>
                </CardComponent.Card>

                <CardComponent.Card
                  variant="callout"
                  tone="info"
                  size="sm"
                  layout="inline"
                >
                  <CardComponent.CardBody>
                    <CardComponent.CardIcon>
                      <Lucide.PawPrint size={24} />
                    </CardComponent.CardIcon>
                    <CardComponent.CardTitle>
                      Temperamento
                    </CardComponent.CardTitle>
                    <CardComponent.CardContent>
                      <p>
                        Perfil{" "}
                        <strong>{dog.temperamento?.toLowerCase()}</strong>.
                        Ideal para lares com o mesmo ritmo.
                      </p>
                    </CardComponent.CardContent>
                  </CardComponent.CardBody>
                </CardComponent.Card>

                <CardComponent.Card variant="callout" size="sm" layout="inline">
                  <CardComponent.CardBody>
                    <CardComponent.CardIcon>
                      <Lucide.Palette size={24} />
                    </CardComponent.CardIcon>
                    <CardComponent.CardTitle>
                      Característica
                    </CardComponent.CardTitle>
                    <CardComponent.CardContent>
                      <p>
                        <strong>{CORES_MAP[dog.cor] || dog.cor}</strong>
                      </p>
                    </CardComponent.CardContent>
                  </CardComponent.CardBody>
                </CardComponent.Card>
              </div>

              <div className={styles.footer}>
                <div className={styles.footerActions}>
                  <Button
                    type="button"
                    leftIcon={<Lucide.Share2 />}
                    size={`${isDesktop ? "md" : "lg"}`}
                    variant="outline"
                    className={styles.actionButton}
                    onClick={() => void handleShare()}
                    disabled={isSharing}
                  >
                    {isSharing ? "Compartilhando..." : "Compartilhar"}
                  </Button>

                  <Link
                    to={`/beta/formulario?pet=${encodeURIComponent(dog.nome)}`}
                    className={styles.interestLink}
                  >
                    <Button
                      leftIcon={<Lucide.Heart />}
                      size={`${isDesktop ? "md" : "lg"}`}
                      variant="primary"
                      className={styles.actionButton}
                      onClick={() =>
                        analytics.trackConversionIntent("adopt_form")
                      }
                    >
                      Tenho Interesse
                    </Button>
                  </Link>
                </div>
                <p className={styles.shareFeedback} aria-live="polite">
                  {shareFeedback === "copied" && "Link copiado!"}
                  {shareFeedback === "error" &&
                    "Não foi possível compartilhar. Tente novamente."}
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
