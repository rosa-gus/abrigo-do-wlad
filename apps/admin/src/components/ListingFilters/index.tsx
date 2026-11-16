import { useId } from "react";
import { Badge } from "@jaci/ui/Badge";
import { Button } from "@jaci/ui/Button";
import { Card, CardBody } from "@jaci/ui/Card";
import { Field } from "@jaci/ui/Field";
import { SearchField } from "@jaci/ui/SearchField";
import { PublicationFilter } from "../Publication";
import styles from "./ListingFilters.module.css";

interface ListingFiltersProps {
  searchLabel: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  publicationValue: string;
  onPublicationChange: (value: string) => void;
  onClear: () => void;
  totalItems?: number;
}

export function ListingFilters({
  searchLabel,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  publicationValue,
  onPublicationChange,
  onClear,
  totalItems,
}: ListingFiltersProps) {
  const id = useId();
  const searchId = `${id}-search`;
  const hasActiveFilters = searchValue.length > 0 || publicationValue !== "all";

  return (
    <Card tone="muted" size="sm" className={styles.filtersCard}
      role="region" aria-label="Busca e publicação">
      <CardBody className={styles.filtersBody}>
        <div className={styles.controls}>
          <Field controlId={searchId} label={searchLabel}>
            <SearchField id={searchId} value={searchValue}
              iconPlacement="outside"
              placeholder={searchPlaceholder} onValueChange={onSearchChange} />
          </Field>
          <PublicationFilter value={publicationValue} onChange={onPublicationChange}
            headerExtra={<span role="status" aria-live="polite" aria-atomic="true">
              {totalItems !== undefined && (
                <Badge variant="outline">
                  {totalItems === 1 ? "1 resultado" : `${totalItems} resultados`}
                </Badge>
              )}
            </span>} />
        </div>
        {hasActiveFilters && (
          <div className={styles.clearActions}>
            <Button type="button" variant="text" size="sm" onClick={onClear}>
              Limpar filtros
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
