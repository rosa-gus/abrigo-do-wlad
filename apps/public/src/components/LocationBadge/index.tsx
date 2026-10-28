import { MapPin } from "lucide-react";
import { Badge } from "@jaci/ui/Badge";

import styles from "./LocationBadge.module.css";

export function LocationBadge({ onImage = false }: { onImage?: boolean }) {
  return (
    <Badge
      variant={onImage ? "outline" : "success"}
      size={onImage ? "lg" : "md"}
      blur={onImage}
      className={onImage ? styles.onImage : undefined}
      leftIcon={<MapPin strokeWidth={1.5} aria-hidden="true" />}
    >
      Morumbi <span style={{ opacity: 0.5, marginInline: "0.375rem" }}>·</span> São Paulo
    </Badge>
  );
}
