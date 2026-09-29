import { useNavigate } from "react-router";
import { Pencil, HeartHandshake, Dog } from "lucide-react";
import { Badge } from "@jaci/ui/Badge";
import { Button } from "@jaci/ui/Button";
import { Card } from "@jaci/ui/Card";
import {
  getOptimizedImageUrl,
  getResponsiveImageSrcSet,
} from "@abrigo/media/cloudinary";
import type { DogProps } from "../../types/dogs";
import styles from "./DogCard.module.css";

interface DogCardProps {
  dog: DogProps;
  onArchive: (id: number, nome: string) => void;
  priority?: boolean;
}

const CARD_IMAGE_WIDTH = 320;
const CARD_IMAGE_HEIGHT = 350;
const CARD_IMAGE_WIDTHS = [320, 480, 640] as const;

export function DogCard({ dog, onArchive, priority = false }: DogCardProps) {
  const navigate = useNavigate();
  const originalImageUrl = dog.fotos?.[0];
  const imageUrl = getOptimizedImageUrl(originalImageUrl, {
    width: 480,
    height: 525,
    quality: "auto",
    crop: "fill",
    gravity: "auto",
  });
  const imageSrcSet = getResponsiveImageSrcSet(
    originalImageUrl,
    CARD_IMAGE_WIDTHS,
    {
      width: CARD_IMAGE_WIDTH,
      height: CARD_IMAGE_HEIGHT,
      quality: "auto",
      crop: "fill",
      gravity: "auto",
    },
  );
  return (
    <Card className={styles.card} interactive>

      {/* Imagem */}
      <div className={styles.cardImage}>
        {imageUrl ? (
          <img
            src={imageUrl}
            srcSet={imageSrcSet || undefined}
            sizes="(max-width: 480px) calc(100vw - 2rem), 320px"
            width={CARD_IMAGE_WIDTH}
            height={CARD_IMAGE_HEIGHT}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            alt={`Foto de ${dog.nome}`}
          />
        ) : (
          <div className={styles.noImage}>
            <Dog size={40} />
          </div>
        )}

        <Badge className={styles.statusBadge} variant="secondary" size="sm">
          {dog.status}
        </Badge>
      </div>

      <div className={styles.cardContent}>
        <div className={styles.cardHeader}>
          <h3>{dog.nome}</h3>
          <Badge className={styles.sexoTag} variant={dog.sexo === "Macho" ? "secondary" : "danger"} size="sm">
            {dog.sexo}
          </Badge>
        </div>

        <div className={styles.cardInfo}>
          <span className={styles.category}>{dog.cateIdade}</span>
          <span className={styles.separator}>•</span>
          <span>{dog.idade}</span>
        </div>

        <div className={styles.cardActions}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/admin/dog/edit/${dog.id}`)}
            className={styles.actionBtn}
            title="Editar"
          >
            <Pencil size={18} /> Editar
          </Button>

          <Button
            variant="danger"
            size="icon-sm"
            aria-label={`Finalizar jornada de ${dog.nome}`}
            onClick={() => onArchive(dog.id, dog.nome)}
            className={`${styles.actionBtn} ${styles.deleteBtn}`}
            title="Arquivar"
          >
            <HeartHandshake size={18} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
