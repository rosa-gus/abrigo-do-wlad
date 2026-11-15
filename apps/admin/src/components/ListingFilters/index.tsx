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
  const titleId = `${id}-filters-title`;
  const searchId = `${id}-search`;
  const hasActiveFilters = searchValue.length > 0 || publicationValue !== "all";

  return (
    <Card tone="muted" size="sm" className={styles.filtersCard}
      role="region" aria-labelledby={titleId}>
      <CardBody className={styles.filtersBody}>
        <header className={styles.header}>
          <h2 id={titleId}>Filtros</h2>
          <div className={styles.meta}>
            <span role="status" aria-live="polite" aria-atomic="true">
              {totalItems !== undefined && (
                <Badge variant="outline">
                  {totalItems === 1 ? "1 resultado" : `${totalItems} resultados`}
                </Badge>
              )}
            </span>
            {hasActiveFilters && (
              <Button type="button" variant="text" size="sm" onClick={onClear}>
                Limpar filtros
              </Button>
            )}
          </div>
        </header>

        <div className={styles.controls}>
          <Field controlId={searchId} label={searchLabel}>
            <SearchField id={searchId} value={searchValue}
              iconPlacement="outside"
              placeholder={searchPlaceholder} onValueChange={onSearchChange} />
          </Field>
          <PublicationFilter value={publicationValue} onChange={onPublicationChange} />
        </div>
      </CardBody>
    </Card>
  );
}
