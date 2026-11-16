import { useNavigate } from "react-router";
import { Pencil, HeartHandshake, Dog, Trash2 } from "lucide-react";
import { Badge } from "@jaci/ui/Badge";
import { Button } from "@jaci/ui/Button";
import { Card } from "@jaci/ui/Card";
import { Separator } from "@jaci/ui/Separator";
import {
  getOptimizedImageUrl,
  getResponsiveImageSrcSet,
} from "@abrigo/media/cloudinary";
import { PUBLICATION_LABELS } from "../../../shared/entities";
import type { DogProps } from "../../types/dogs";
import { resolveMockMediaUrl } from "../../mocks/media";
import styles from "./DogCard.module.css";

interface DogCardProps {
  dog: DogProps;
  onArchive: (id: number, nome: string) => void;
  priority?: boolean;
  onDiscard: (id: number, nome: string) => void;
}

const CARD_IMAGE_WIDTH = 320;
const CARD_IMAGE_HEIGHT = 350;
const CARD_IMAGE_WIDTHS = [320, 480, 640] as const;

export function DogCard({ dog, onArchive, onDiscard, priority = false }: DogCardProps) {
  const navigate = useNavigate();
  const originalImageUrl = dog.fotos?.[0];
  const imageUrl = resolveMockMediaUrl(getOptimizedImageUrl(originalImageUrl, {
    width: 480,
    height: 525,
    quality: "auto",
    crop: "fill",
    gravity: "auto",
  }));
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
      </div>

      <div className={styles.cardContent}>
        <div className={styles.cardHeader}>
          <h3>{dog.nome}</h3>
          <Badge variant={dog.publicationStatus === "published" ? "success" : "outline"}>
            {PUBLICATION_LABELS[dog.publicationStatus]}
          </Badge>
        </div>

        <p className={styles.cardInfo}>
          {dog.sexo && <>
            <span>{dog.sexo}</span>{" "}
            <Separator orientation="vertical" />{" "}
          </>}
          <span className={styles.category}>{dog.cateIdade || "Categoria pendente"}</span>
          {" "}<Separator orientation="vertical" />{" "}
          <span>{dog.idade || "Idade pendente"}</span>
        </p>
        <p className={styles.healthInfo}>{dog.status || "Saúde pendente"}</p>

        <div className={styles.cardActions}>
          <Button
            variant="secondary"
            emphasis="soft"
            size="sm"
            align="center"
            onClick={() => navigate(`/admin/dog/edit/${dog.id}`)}
            className={styles.editButton}
            title="Editar"
          >
            <Pencil size={18} /> Editar
          </Button>

          {dog.publicationStatus === "draft" && (
            <Button variant="danger" size="icon-sm" shape="circle" aria-label={`Excluir rascunho de ${dog.nome}`}
              onClick={() => onDiscard(dog.id, dog.nome)} title="Excluir rascunho">
              <Trash2 size={18} />
            </Button>
          )}
          <Button
            variant="danger"
            size="icon-sm"
            shape="circle"
            aria-label={`Finalizar jornada de ${dog.nome}`}
            onClick={() => onArchive(dog.id, dog.nome)}
            className={styles.deleteBtn}
            title="Arquivar"
          >
            <HeartHandshake size={18} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
