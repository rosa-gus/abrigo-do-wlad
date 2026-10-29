import * as Lucide from "lucide-react";
import {
  Card,
  CardBody,
  CardButton,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@jaci/ui/Card";
import { Badge } from "@jaci/ui/Badge";
import { getOptimizedImageUrl } from "@abrigo/media/cloudinary";
import { analytics } from "@/utils/analytics";
import { type Dog } from "@/types/dogs";
import styles from "./DogCard.module.css";

interface DogCardProps {
  data: Dog;
  onClick: () => void;
  isLoading?: boolean;
}

export function DogCard({ data, onClick, isLoading }: DogCardProps) {
  const dogImage = data.fotos?.[0] ?? null;

  const dogImageUrl = getOptimizedImageUrl(dogImage, {
    width: 200,
    height: 350,
    quality: 75,
    crop: "fill",
    gravity: "auto",
  });

  const handleClick = () => {
    analytics.trackDogView(data.id, data.nome, data.idade, data.sexo);
    onClick();
  };

  return (
    <Card
      variant="image"
      interactive
      // disable click if loading
      onClick={isLoading ? undefined : handleClick}
      style={{
        cursor: isLoading ? "wait" : "pointer",
        position: "relative",
      }}
    >
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <Lucide.LoaderCircle className={styles.spinner} size={48} />
        </div>
      )}

      <CardBody imageSrc={dogImageUrl}>
        <CardHeader>
          <CardTitle className={styles.dogTitle}>
            <span>Oi, eu sou </span>
            <span className={styles.dogName}>{data.nome}!</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.cardContainer}>
            <div className={styles.badgeContainer}>
              <Badge
                size="sm"
                blur={true}
                leftIcon={
                  data.sexo === "Macho" ? (
                    <Lucide.Mars size={14} />
                  ) : (
                    <Lucide.Venus size={14} />
                  )
                }
                variant="outline"
                className={styles.badgeContent}
              >
                {data.sexo === "Macho" ? "Macho" : "Fêmea"}
              </Badge>

              <Badge
                size="sm"
                blur={true}
                leftIcon={<Lucide.Calendar size={14} />}
                variant="outline"
                className={styles.badgeContent}
              >
                {data.idade}
              </Badge>

              <Badge
                size="sm"
                blur={true}
                leftIcon={<Lucide.BriefcaseMedical size={14} />}
                variant="outline"
                className={styles.badgeContent}
              >
                {data.status}
              </Badge>
            </div>
            <p>{data.temperamento}</p>
          </div>
        </CardContent>
      </CardBody>
      <CardFooter>
        <CardButton>
          Conheça {data.nome}
          <Lucide.ChevronUp />
        </CardButton>
      </CardFooter>
    </Card>
  );
}
