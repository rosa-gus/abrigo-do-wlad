import { useId, type ReactNode } from "react";
import { Badge } from "@jaci/ui/Badge";
import { Button } from "@jaci/ui/Button";
import { Card, CardBody } from "@jaci/ui/Card";
import { Label } from "@jaci/ui/Label";
import * as SelectComponent from "@jaci/ui/Select";
import { PUBLICATION_LABELS, type PublicationStatus } from "../../../shared/entities";
import styles from "./Publication.module.css";

const updatedAtFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function PublicationSection({ status, updatedAt }: {
  status: PublicationStatus;
  updatedAt?: string;
}) {
  const id = useId();
  return (
    <Card tone="muted" size="sm" className={styles.publicationCard}
      role="region" aria-labelledby={`${id}-publication-title`}>
      <CardBody className={styles.publicationBody}>
        <header className={styles.publicationHeader}>
          <h2 id={`${id}-publication-title`}>Publicação</h2>
          <Badge className={styles.statusBadge} variant={status === "published" ? "success" : "outline"}>
            {PUBLICATION_LABELS[status]}
          </Badge>
        </header>
        <p className={styles.summary}>{status === "published"
          ? "Esta ficha está visível no site."
          : "Esta ficha fica restrita ao painel até ser publicada."}</p>
        {updatedAt && <p className={styles.updatedAt}>Atualizado em <time dateTime={updatedAt}>
          {updatedAtFormatter.format(new Date(updatedAt))}
        </time></p>}
      </CardBody>
    </Card>
  );
}

export function PublicationActions({ status, isSubmitting, progress }: {
  status: PublicationStatus;
  isSubmitting: boolean;
  progress?: string;
}) {
  return (
    <div className={styles.actions}>
      <Button type="submit" name="publicationStatus" value="draft" variant="outline"
        formNoValidate disabled={isSubmitting}>
        {status === "published" ? "Voltar para rascunho" : "Salvar rascunho"}
      </Button>
      <Button type="submit" name="publicationStatus" value="published" disabled={isSubmitting}>
        {isSubmitting ? progress || "Salvando..." : status === "published" ? "Salvar alterações" : "Publicar"}
      </Button>
    </div>
  );
}

export function PublicationFilter({ value, onChange, headerExtra }: {
  value: string;
  onChange: (value: string) => void;
  headerExtra?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={styles.filterField}>
      <div className={styles.filterHeader}>
        <Label htmlFor={`${id}-publication-filter`} className={styles.filterLabel}>Publicação</Label>
        {headerExtra}
      </div>
      <SelectComponent.Select value={value} onValueChange={onChange}>
        <SelectComponent.SelectTrigger id={`${id}-publication-filter`} className={styles.selectTrigger}>
          <SelectComponent.SelectValue placeholder="Todos" />
        </SelectComponent.SelectTrigger>
        <SelectComponent.SelectContent>
          <SelectComponent.SelectItem value="all">Todos</SelectComponent.SelectItem>
          <SelectComponent.SelectItem value="published">Publicados</SelectComponent.SelectItem>
          <SelectComponent.SelectItem value="draft">Rascunhos</SelectComponent.SelectItem>
        </SelectComponent.SelectContent>
      </SelectComponent.Select>
    </div>
  );
}
