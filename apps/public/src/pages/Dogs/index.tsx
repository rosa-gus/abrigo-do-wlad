import * as React from "react";
import * as Lucide from "lucide-react";
import { useNavigate, useParams } from "react-router";

import { DogModal } from "./components/DogModal";
import { DogCard } from "./components/DogCard";
import {
  DogRouteStatusModal,
  type DogRouteNotice,
} from "./components/DogRouteStatusModal";

import {
  CORES_MAP,
  DOG_TAG_OPTIONS,
  TAGS_MAP,
  type Dog,
  type DogFilters,
  type DogTag,
  type DogTagCounts,
} from "@/types/dogs";
import { useDogSearch } from "@/hooks/useDogSearch";
import { useDailyDog } from "@/hooks/useDailyDog";
import { getOptimizedImageUrl } from "@abrigo/media/cloudinary";
import { preloadDogImages } from "@/utils/common";
import { analytics } from "@/utils/analytics";
import { dogProfilePath } from "@/utils/dogUrl";
import {
  DogProfileNotFoundError,
  getDogProfileBySlug,
} from "@/services/dogService";

import Banner from "@/components/Banner";
import { AdoptionBanner } from "@/components/AdoptionBanner";
import { LocationBadge } from "@/components/LocationBadge";
import { Badge } from "@jaci/ui/Badge";
import { Skeleton } from "@jaci/ui/Skeleton";
import { Button } from "@jaci/ui/Button";
import * as CardComponent from "@jaci/ui/Card";
import { Combobox, type ComboboxOption } from "@jaci/ui/Combobox";
import { EmptyState } from "@jaci/ui/EmptyState";
import { Field } from "@jaci/ui/Field";
import { FilterChip } from "@jaci/ui/FilterChip";
import { LiveRegion } from "@jaci/ui/LiveRegion";
import { ToggleGroup, ToggleGroupItem } from "@jaci/ui/ToggleGroup";

import * as SelectComponent from "@jaci/ui/Select";

import styles from "./Dogs.module.css";

interface DogFiltersProps {
  filters: DogFilters;
  onFilterChange: (filters: DogFilters) => void;
  totalItems: number;
  tagCounts: DogTagCounts;
}

const dogTagOptions: ComboboxOption[] = DOG_TAG_OPTIONS.map((option) => ({
  ...option,
  keywords: [option.value],
}));

function isDogTag(value: string): value is DogTag {
  return Object.hasOwn(TAGS_MAP, value);
}

function isDogAgeFilter(
  value: string,
): value is NonNullable<DogFilters["cateIdade"]> {
  return ["all", "filhote", "adulto", "idoso"].includes(value);
}

function getResultLabel(totalItems: number) {
  return totalItems === 1 ? "1 doguinho encontrado" : `${totalItems} doguinhos encontrados`;
}

function DogCardSkeleton() {
  return <Skeleton style={{ height: "500px", width: "100%" }} />;
}

function DogFiltersSkeleton() {
  return (
    <CardComponent.Card
      tone="muted"
      size="sm"
      className={styles.filtersCard}
      aria-label="Carregando filtros"
    >
      <CardComponent.CardBody className={styles.filtersPanel}>
        <div className={styles.filterHeader}>
          <div className={styles.filterHeading}>
            <Skeleton style={{ height: "28px", width: "220px" }} />
            <Skeleton style={{ height: "18px", width: "320px" }} />
          </div>
          <div className={styles.filterMeta}>
            <Skeleton
              style={{ height: "28px", width: "120px", borderRadius: "16px" }}
            />
          </div>
        </div>

        <div className={styles.filterControls}>
          <Skeleton className={styles.loadingTagFilter} />
          <div className={styles.secondaryFilters}>
            <Skeleton className={styles.loadingSecondaryFilter} />
            <Skeleton className={styles.loadingSecondaryFilter} />
          </div>
        </div>

        <Skeleton className={styles.loadingRotationNote} />
      </CardComponent.CardBody>
    </CardComponent.Card>
  );
}

function DogFiltersComponent({
  filters,
  onFilterChange,
  totalItems,
  tagCounts,
}: DogFiltersProps) {
  const handleFilterChange = <Key extends keyof DogFilters>(
    filterName: Key,
    value: DogFilters[Key],
  ) => {
    onFilterChange({ ...filters, [filterName]: value });
  };

  const selectedTags = filters.tags ?? [];
  const availableTagOptions = dogTagOptions.filter(
    ({ value }) =>
      isDogTag(value) &&
      ((tagCounts[value] ?? 0) > 0 || selectedTags.includes(value)),
  );

  function handleTagsChange(values: string[]) {
    handleFilterChange("tags", values.filter(isDogTag));
  }

  function removeTag(tag: DogTag) {
    handleFilterChange(
      "tags",
      selectedTags.filter((selectedTag) => selectedTag !== tag),
    );
  }

  return (
    <CardComponent.Card 
      tone="muted"
      size="sm"
      className={styles.filtersCard}
      role="region"
      aria-labelledby="dog-filters-title"
    >
      <CardComponent.CardBody className={styles.filtersPanel}>
        <header className={styles.filterHeader}>
          <div className={styles.filterHeading}>
            <h2 id="dog-filters-title">Encontre seu doguinho</h2>
            <p>Combine características, idade e cor para refinar a busca.</p>
          </div>

          <div className={styles.filterMeta}>
            <Badge
              leftIcon={<Lucide.PawPrint size={16} />}
              variant="secondary"
              size="sm"
            >
              {getResultLabel(totalItems)}
            </Badge>
          </div>
        </header>

        <div className={styles.filterControls}>
          <Field
            controlId="dog-tags-filter"
            label="Características"
            description="Selecione uma ou mais. Cada escolha refina os resultados."
            size="lg"
            className={styles.tagField}
          >
            <Combobox
              multiple
              className={styles.tagCombobox}
              options={availableTagOptions}
              selectedValues={selectedTags}
              onSelectedValuesChange={handleTagsChange}
              placeholder={
                selectedTags.length > 0
                  ? "Adicionar outra característica"
                  : "Buscar características"
              }
              emptyMessage="Nenhuma característica corresponde à busca."
            />
          </Field>

          <div className={styles.secondaryFilters}>
            <div className={styles.ageFilter}>
              <span id="dog-age-filter-label" className={styles.filterLabel}>
                Idade
              </span>
              <ToggleGroup
                type="single"
                value={filters.cateIdade}
                onValueChange={(value) => {
                  if (isDogAgeFilter(value)) {
                    handleFilterChange("cateIdade", value);
                  }
                }}
                aria-labelledby="dog-age-filter-label"
                size="sm"
                className={styles.ageGroup}
              >
                <ToggleGroupItem value="all">Todas</ToggleGroupItem>
                <ToggleGroupItem value="filhote">Filhote</ToggleGroupItem>
                <ToggleGroupItem value="adulto">Adulto</ToggleGroupItem>
                <ToggleGroupItem value="idoso">Idoso</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <Field
              controlId="dog-color-filter"
              label="Cor"
              className={styles.colorFilter}
            >
              <SelectComponent.Select
                value={filters.cor}
                onValueChange={(value) => handleFilterChange("cor", value)}
              >
                <SelectComponent.SelectTrigger
                  id="dog-color-filter"
                  className={styles.selectTrigger}
                >
                  <SelectComponent.SelectValue placeholder="Todas as cores" />
                </SelectComponent.SelectTrigger>
                <SelectComponent.SelectContent>
                  <SelectComponent.SelectItem value="all">
                    Todas as cores
                  </SelectComponent.SelectItem>
                  {Object.entries(CORES_MAP).map(([key, label]) => (
                    <SelectComponent.SelectItem key={key} value={key}>
                      {label}
                    </SelectComponent.SelectItem>
                  ))}
                </SelectComponent.SelectContent>
              </SelectComponent.Select>
            </Field>
          </div>
        </div>

        {selectedTags.length > 0 && (
          <div className={styles.activeFilters}>
            <span className={styles.activeFiltersLabel}>Características</span>
            <div className={styles.activeFilterChips}>
              {selectedTags.map((tag) => (
                <FilterChip
                  key={tag}
                  onRemove={() => removeTag(tag)}
                  removeLabel={`Remover característica ${TAGS_MAP[tag]}`}
                  size="sm"
                >
                  {TAGS_MAP[tag]}
                </FilterChip>
              ))}
            </div>
            <Button
              type="button"
              variant="text"
              size="sm"
              onClick={() => handleFilterChange("tags", [])}
            >
              Limpar características
            </Button>
          </div>
        )}

        <p className={styles.rotationNote}>
          <Lucide.Info size={16} aria-hidden="true" />
          <span>
            A ordem dos cães muda periodicamente para distribuir a visibilidade
            de forma justa.
          </span>
        </p>
      </CardComponent.CardBody>
    </CardComponent.Card>
  );
}

export default function Dogs() {
  const navigate = useNavigate();
  const { publicSlug } = useParams<{ publicSlug?: string }>();
  const {
    dogs,
    loading,
    hasLoaded,
    error,
    totalItems,
    currentPage,
    totalPages,
    tagCounts,
    filters,
    setFilters,
    setCurrentPage,
    ITEMS_PER_PAGE,
  } = useDogSearch();

  const dailyDog = useDailyDog();

  const [selectedDog, setSelectedDog] = React.useState<Dog | null>(null);
  const [routeNotice, setRouteNotice] = React.useState<DogRouteNotice | null>(null);
  const trackedFiltersRef = React.useRef<string>("");

  const heroImage = dailyDog?.fotos?.[0];

  React.useEffect(() => {
    if (!publicSlug) {
      setSelectedDog(null);
      setRouteNotice(null);
      return;
    }

    const requestedPublicSlug = publicSlug;
    const controller = new AbortController();
    setSelectedDog((currentDog) =>
      currentDog?.publicSlug === requestedPublicSlug ? currentDog : null
    );
    setRouteNotice(null);

    async function fetchProfile() {
      try {
        const profile = await getDogProfileBySlug(
          requestedPublicSlug,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (profile.state === "available") {
          setSelectedDog(profile.dog);
          setRouteNotice(null);
        } else {
          setSelectedDog(null);
          setRouteNotice({ kind: "tombstone", tombstone: profile.tombstone });
        }
      } catch (profileError) {
        if (controller.signal.aborted) return;
        setSelectedDog(null);
        if (profileError instanceof DogProfileNotFoundError) {
          setRouteNotice({ kind: "not-found" });
        } else {
          console.error("Erro ao carregar o perfil do cachorro:", profileError);
          setRouteNotice({ kind: "error" });
        }
      }
    }

    void fetchProfile();
    return () => controller.abort();
  }, [publicSlug]);

  // Pré-carregamento de imagens da página atual
  React.useEffect(() => {
    const imagesToPreload = dogs
      .map((dog) =>
        getOptimizedImageUrl(dog.fotos?.[0], {
          width: 400,
          height: 600,
          quality: 75,
          crop: "fill",
          gravity: "auto",
        }),
      )
      .filter((url): url is string => !!url);

    if (imagesToPreload.length > 0) {
      preloadDogImages(imagesToPreload);
    }
  }, [dogs]);

  React.useEffect(() => {
    if (!loading && dogs.length === 0) {
      const filterKey = `${filters.tags?.join(",")}|${filters.cateIdade}|${filters.cor}`;

      if (trackedFiltersRef.current !== filterKey) {
        analytics.trackNoResults("dogs_page", {
          filters_tags: filters.tags?.join(",") || "all",
          filters_age: filters.cateIdade || "all",
          filters_color: filters.cor || "all",
        });
        trackedFiltersRef.current = filterKey;
      }
    }
  }, [loading, dogs.length, filters]);

  const handleDogClick = (dog: Dog) => {
    setRouteNotice(null);
    setSelectedDog(dog);
    void navigate(dogProfilePath(dog.publicSlug));
  };

  const handleRouteClose = () => {
    setSelectedDog(null);
    setRouteNotice(null);
    void navigate("/caes");
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main>
      <Banner
        image={heroImage as string}
        title="Nossos doguinhos"
        leading={<LocationBadge onImage />}
        description="Cada um tem uma história e uma personalidade única. Utilize os filtros abaixo para encontrar quem combina com seu estilo de vida."
      />

      <div className="container">
        {!hasLoaded ? (
          <DogFiltersSkeleton />
        ) : (
          <DogFiltersComponent
            filters={filters}
            onFilterChange={setFilters}
            totalItems={totalItems}
            tagCounts={tagCounts}
          />
        )}

        <AdoptionBanner context="catalog" />

        <LiveRegion>
          {loading
            ? "Atualizando resultados"
            : error
              ? "Não foi possível carregar os doguinhos"
              : `${getResultLabel(totalItems)}. ${
                  filters.tags?.length
                    ? `${filters.tags.length} características selecionadas.`
                    : "Nenhuma característica selecionada."
                }`}
        </LiveRegion>

        {loading ? (
          <div className={styles.dogGrid}>
            {Array.from({ length: ITEMS_PER_PAGE }).map((_, index) => (
              <DogCardSkeleton key={index} />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={<Lucide.ServerCrash />}
            title="Muitos acessos no momento!"
            description="Nossos doguinhos estão famosos. Estamos passando por uma instabilidade temporária. Tente acessar novamente em alguns instantes."
            headingLevel={2}
            size="lg"
          />
        ) : (
          <>
            <div className={styles.dogGrid}>
              {dogs.length > 0 ? (
                dogs.map((dog) => (
                  <DogCard
                    key={dog.id}
                    data={dog}
                    onClick={() => handleDogClick(dog)}
                  />
                ))
              ) : (
                <EmptyState
                  className={styles.emptyResults}
                  icon={<Lucide.SearchX />}
                  title="Nenhum doguinho encontrado"
                  description="Tente remover uma característica ou ajustar os filtros de idade e cor."
                  size="lg"
                />
              )}
            </div>

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <Lucide.ChevronLeft size={20} />
                </Button>
                <span className={styles.pageInfo}>
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <Lucide.ChevronRight size={20} />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <DogModal
        dog={
          selectedDog
            ? {
                ...selectedDog,
                cor: CORES_MAP[selectedDog.cor] || selectedDog.cor,
              }
            : null
        }
        isOpen={!!selectedDog}
        onClose={handleRouteClose}
      />
      <DogRouteStatusModal notice={routeNotice} onClose={handleRouteClose} />
    </main>
  );
}
