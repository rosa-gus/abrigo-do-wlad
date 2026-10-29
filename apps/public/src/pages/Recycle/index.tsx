import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@jaci/ui/Badge";
import { Button, ButtonLink } from "@jaci/ui/Button";
import * as CardComponent from "@jaci/ui/Card";
import { Carousel } from "@jaci/ui/Carousel";
import { CarouselNavigation } from "@jaci/ui/CarouselNavigation";
import { Combobox, type ComboboxOption } from "@jaci/ui/Combobox";
import { EmptyState } from "@jaci/ui/EmptyState";
import { Field } from "@jaci/ui/Field";
import { FilterChip } from "@jaci/ui/FilterChip";
import { LiveRegion } from "@jaci/ui/LiveRegion";
import { Skeleton } from "@jaci/ui/Skeleton";
import { ToggleGroup, ToggleGroupItem } from "@jaci/ui/ToggleGroup";
import * as Lucide from "lucide-react";

import leavesSticker from "@/assets/stickers/fluent-emoji/leaves.svg";

import Banner from "@/components/Banner";
import { PageFeedback } from "@/components/PageFeedback";
import { ScrollIndicators } from "@/components/ScrollIndicators";
import { analytics } from "@/utils/analytics";
import { getThirdPartyImage } from "@/utils/common";

import { getRecyclePoints } from "../../services/recycleService";
import type { RecyclePoint } from "../../types/recycle";

import styles from "./Recycle.module.css";

const ALL_ZONES = "all";
const INITIAL_VISIBLE_POINTS = 8;

const DONATION_ITEMS = [
  {
    imageKey: "recycle.petBottle",
    tone: "leaf",
    title: "Tampas de garrafa PET",
    description:
      "Também valem tampas de garrafas de água, refrigerante, suco e outras bebidas.",
    imageAlt: "Garrafa PET transparente sobre uma superfície clara",
  },
  {
    imageKey: "recycle.beautyCream",
    tone: "earth",
    title: "Tampas de higiene e limpeza",
    description:
      "Inclua tampas de shampoo, condicionador, creme, detergente, amaciante e produtos semelhantes.",
    imageAlt: "Embalagem de creme de beleza",
  },
  {
    imageKey: "recycle.pen",
    tone: "coral",
    title: "Tampas pequenas de plástico",
    description:
      "Tampas de caneta, creme dental, maionese e outras embalagens de plástico duro também ajudam.",
    imageAlt: "Caneta esferográfica sobre uma superfície clara",
  },
  {
    imageKey: "recycle.aluminumCan",
    tone: "water",
    title: "Lacres de alumínio",
    description:
      "Separe os lacres de latas de refrigerante, água, suco, cerveja e outras bebidas.",
    imageAlt: "Lata de refrigerante de alumínio",
  },
] as const;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

function sortPoints(points: RecyclePoint[]) {
  return [...points].sort(
    (first, second) =>
      first.zone.localeCompare(second.zone) ||
      first.neighborhood.localeCompare(second.neighborhood) ||
      (first.name ?? "").localeCompare(second.name ?? ""),
  );
}

function createSearchOptions(points: RecyclePoint[]): ComboboxOption[] {
  const options = new Map<string, ComboboxOption>();

  points.forEach((point) => {
    const neighborhoodKey = `neighborhood:${normalize(point.neighborhood)}`;
    if (!options.has(neighborhoodKey)) {
      options.set(neighborhoodKey, {
        value: neighborhoodKey,
        label: point.neighborhood,
        description: `Bairro · ${point.zone}`,
        keywords: [point.zone],
      });
    }

    if (point.name) {
      const nameKey = `place:${normalize(point.name)}`;
      if (!options.has(nameKey)) {
        options.set(nameKey, {
          value: nameKey,
          label: point.name,
          description: `Ponto de coleta · ${point.neighborhood}`,
          keywords: [point.neighborhood, point.zone],
        });
      }
    }
  });

  return [...options.values()].sort((first, second) =>
    first.label.localeCompare(second.label),
  );
}

function getResultLabel(count: number) {
  return `${count} ${count === 1 ? "ponto encontrado" : "pontos encontrados"}`;
}

export default function Recycle() {
  const heroImage = getThirdPartyImage("recycle.banner")?.url;
  const donationItems = useMemo(
    () =>
      DONATION_ITEMS.map((item) => ({
        ...item,
        image: getThirdPartyImage(item.imageKey, {
          w: 1600,
          h: 800,
          q: 82,
          crop: "center",
        })?.url,
        mobileImage: getThirdPartyImage(item.imageKey, {
          w: 768,
          h: 920,
          q: 80,
          crop: "center",
        })?.url,
      })),
    [],
  );
  const containerRef = useRef<HTMLDivElement>(null!);
  const section1Ref = useRef<HTMLElement>(null!);
  const section2Ref = useRef<HTMLElement>(null!);
  const sectionLabels = ["O que doar?", "Pontos de coleta"];

  const [collectionPoints, setCollectionPoints] = useState<RecyclePoint[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedZone, setSelectedZone] = useState(ALL_ZONES);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_POINTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getRecyclePoints()
      .then((points) => {
        if (active) setCollectionPoints(sortPoints(points));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loading && collectionPoints.length === 0) {
      analytics.trackNoResults("recycle_page");
    }
  }, [loading, collectionPoints.length]);

  const zones = useMemo(
    () =>
      [...new Set(collectionPoints.map((point) => point.zone))].sort(
        (first, second) => first.localeCompare(second),
      ),
    [collectionPoints],
  );

  const pointsInSelectedZone = useMemo(
    () =>
      selectedZone === ALL_ZONES
        ? collectionPoints
        : collectionPoints.filter((point) => point.zone === selectedZone),
    [collectionPoints, selectedZone],
  );

  const searchOptions = useMemo(
    () => createSearchOptions(pointsInSelectedZone),
    [pointsInSelectedZone],
  );

  const filteredPoints = useMemo(() => {
    const query = normalize(searchTerm);
    if (!query) return pointsInSelectedZone;

    return pointsInSelectedZone.filter((point) =>
      [point.neighborhood, point.name, point.address, point.zone]
        .filter((value): value is string => Boolean(value))
        .some((value) => normalize(value).includes(query)),
    );
  }, [pointsInSelectedZone, searchTerm]);

  const visiblePoints = filteredPoints.slice(0, visibleCount);
  const hasActiveFilters =
    Boolean(searchTerm.trim()) || selectedZone !== ALL_ZONES;
  const hasMorePoints = visiblePoints.length < filteredPoints.length;

  function handleSearchChange(value: string) {
    setSearchTerm(value);
    setVisibleCount(INITIAL_VISIBLE_POINTS);
  }

  function handleZoneChange(value: string) {
    setSelectedZone(value || ALL_ZONES);
    setVisibleCount(INITIAL_VISIBLE_POINTS);
  }

  function clearFilters() {
    setSearchTerm("");
    setSelectedZone(ALL_ZONES);
    setVisibleCount(INITIAL_VISIBLE_POINTS);
  }

  return (
    <>
      <ScrollIndicators
        containerRef={containerRef}
        sectionCount={2}
        labels={sectionLabels}
      />
      <Banner
        image={heroImage as string}
        title="Sua tampinha vale vidas"
        description="Transformamos tampinhas em ração e medicamentos para os cães do abrigo. Encontre um ponto de coleta e participe."
      />

      <div className={styles.mainContainer} ref={containerRef}>
        <section className="container" ref={section1Ref}>
          <div className={styles.recycleTextContainer}>
            <img
              className={styles.introSticker}
              src={leavesSticker}
              alt=""
              width={64}
              height={64}
            />
            <h2 className="section-title">O que doar?</h2>
            <p>
              Aceitamos qualquer tampinha de{" "}
              <strong>plástico duro e lacres de alumínio</strong>. O material é
              vendido para reciclagem e 100% do valor é revertido para o abrigo.
            </p>

            <div
              className={styles.donationCarousel}
              role="region"
              aria-roledescription="carrossel"
              aria-label="Exemplos de materiais aceitos"
            >
              <Carousel
                render={api => (
                  <CarouselNavigation
                    api={api}
                    className={styles.carouselNavigation}
                    itemLabels={donationItems.map(item => item.title)}
                    previousLabel="Ver material anterior"
                    nextLabel="Ver próximo material"
                    dotsLabel="Escolher material"
                    aria-label="Navegação dos materiais aceitos"
                  />
                )}
              >
                {donationItems.map((item, index) => (
                  <article
                    key={item.imageKey}
                    className={styles.donationSlide}
                    data-tone={item.tone}
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${index + 1} de ${donationItems.length}`}
                  >
                    {item.image && (
                      <picture className={styles.donationPicture}>
                        <source
                          media="(max-width: 768px)"
                          srcSet={item.mobileImage || item.image}
                        />
                        <img
                          src={item.image}
                          alt={item.imageAlt}
                          width={1600}
                          height={800}
                          loading={index === 0 ? "eager" : "lazy"}
                          decoding="async"
                          draggable={false}
                        />
                      </picture>
                    )}
                    <div
                      className={styles.donationOverlay}
                      aria-hidden="true"
                    />
                    <div className={styles.donationSlideContent}>
                      <span className={styles.donationEyebrow}>
                        Exemplo de material aceito
                      </span>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </div>
                  </article>
                ))}
              </Carousel>
            </div>
          </div>
        </section>

        <section className="container" ref={section2Ref}>
          <div className={styles.collectionSection}>
            <header className={styles.collectionIntro}>
              <h2 className="section-title">Pontos de coleta</h2>
              <p>Encontre um ponto de coleta no seu bairro ou região.</p>
            </header>

            <CardComponent.Card
              variant="callout"
              tone="info"
              size="sm"
              layout="inline"
              className={styles.preparationCallout}
            >
              <CardComponent.CardBody>
                <CardComponent.CardIcon>
                  <Lucide.Sparkles size={24} aria-hidden="true" />
                </CardComponent.CardIcon>
                <CardComponent.CardTitle>
                  Prepare sua doação
                </CardComponent.CardTitle>
                <CardComponent.CardContent>
                  <p>
                    Se possível, lave as tampinhas e separe-as por cor. Isso
                    agiliza muito o nosso trabalho!
                  </p>
                </CardComponent.CardContent>
              </CardComponent.CardBody>
            </CardComponent.Card>

            {loading ? (
              <div
                className={styles.loadingState}
                aria-label="Carregando pontos de coleta"
              >
                <CardComponent.Card
                  tone="muted"
                  size="sm"
                  className={styles.filterCard}
                >
                  <CardComponent.CardBody className={styles.filterCardBody}>
                    <div className={styles.loadingFilters}>
                      <Skeleton className={styles.loadingSearch} />
                      <Skeleton className={styles.loadingZones} />
                    </div>
                  </CardComponent.CardBody>
                </CardComponent.Card>
                <div className={styles.pointsGrid}>
                  {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className={styles.loadingCard} />
                  ))}
                </div>
              </div>
            ) : collectionPoints.length === 0 ? (
              <EmptyState
                icon={<Lucide.MapPinOff />}
                title="Nenhum ponto de coleta cadastrado"
                description="Estamos atualizando nossa rede de parceiros. Volte em breve para conferir novos locais."
                size="lg"
              />
            ) : (
              <>
                <CardComponent.Card
                  tone="muted"
                  size="sm"
                  className={styles.filterCard}
                  role="region"
                  aria-label="Filtros de pontos de coleta"
                >
                  <CardComponent.CardBody className={styles.filterCardBody}>
                    <div className={styles.filterPanel}>
                      <Field
                        controlId="collection-point-search"
                        label="Bairro ou nome do local"
                        description="Você também pode pesquisar pelo endereço."
                        size="lg"
                      >
                        <Combobox
                          options={searchOptions}
                          value={searchTerm}
                          onValueChange={handleSearchChange}
                          size="lg"
                          placeholder="Ex.: Morumbi"
                          emptyMessage="Nenhum bairro ou local corresponde à busca."
                        />
                      </Field>

                      <div className={styles.zoneFilter}>
                        <p className={styles.filterLabel}>Zona</p>
                        <ToggleGroup
                          type="single"
                          value={selectedZone}
                          onValueChange={handleZoneChange}
                          aria-label="Filtrar por zona"
                          size="sm"
                        >
                          <ToggleGroupItem value={ALL_ZONES}>
                            Todas
                          </ToggleGroupItem>
                          {zones.map((zone) => (
                            <ToggleGroupItem key={zone} value={zone}>
                              {zone}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      </div>
                    </div>

                    {hasActiveFilters && (
                      <div className={styles.activeFilters}>
                        <span className={styles.activeFiltersLabel}>
                          Filtros ativos
                        </span>
                        <div className={styles.activeFilterChips}>
                          {searchTerm.trim() && (
                            <FilterChip
                              onRemove={() => handleSearchChange("")}
                              removeLabel={`Remover busca ${searchTerm}`}
                              size="sm"
                            >
                              Busca: {searchTerm}
                            </FilterChip>
                          )}
                          {selectedZone !== ALL_ZONES && (
                            <FilterChip
                              onRemove={() => handleZoneChange(ALL_ZONES)}
                              removeLabel={`Remover filtro ${selectedZone}`}
                              size="sm"
                            >
                              {selectedZone}
                            </FilterChip>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="text"
                          size="sm"
                          onClick={clearFilters}
                        >
                          Limpar filtros
                        </Button>
                      </div>
                    )}
                  </CardComponent.CardBody>
                </CardComponent.Card>

                <div className={styles.resultsHeader}>
                  <p>{getResultLabel(filteredPoints.length)}</p>
                  {filteredPoints.length > visiblePoints.length && (
                    <span>
                      Exibindo {visiblePoints.length} de {filteredPoints.length}
                    </span>
                  )}
                </div>
                <LiveRegion>{getResultLabel(filteredPoints.length)}</LiveRegion>

                {filteredPoints.length === 0 ? (
                  <EmptyState
                    icon={<Lucide.SearchX />}
                    title="Nenhum ponto encontrado"
                    description="Tente outro bairro, nome de local ou remova o filtro de zona."
                  />
                ) : (
                  <>
                    <div className={styles.pointsGrid}>
                      {visiblePoints.map((location) => (
                        <CardComponent.Card
                          key={
                            location.id ??
                            `${location.zone}-${location.neighborhood}-${location.address}`
                          }
                          tone="success"
                          size="sm"
                          className={styles.pointCard}
                        >
                          <CardComponent.CardBody
                            className={styles.pointCardBody}
                          >
                            <CardComponent.CardHeader
                              className={styles.pointCardHeader}
                            >
                              <div className={styles.neighborhoodHeading}>
                                <Lucide.MapPin aria-hidden="true" />
                                <div>
                                  <span className={styles.collectionCardLabel}>
                                    Bairro
                                  </span>
                                  <CardComponent.CardTitle
                                    className={
                                      styles.collectionCardNeighborhood
                                    }
                                  >
                                    {location.neighborhood}
                                  </CardComponent.CardTitle>
                                </div>
                              </div>
                              <Badge variant="success" size="sm">
                                {location.zone}
                              </Badge>
                            </CardComponent.CardHeader>

                            <CardComponent.CardContent
                              className={styles.pointCardContent}
                            >
                              {location.name && (
                                <div className={styles.collectionCardItem}>
                                  <Lucide.Building2
                                    className={styles.collectionCardIcon}
                                    aria-hidden="true"
                                  />
                                  <div>
                                    <span
                                      className={styles.collectionCardLabel}
                                    >
                                      Local
                                    </span>
                                    <p className={styles.collectionCardName}>
                                      {location.name}
                                    </p>
                                  </div>
                                </div>
                              )}

                              <div className={styles.collectionCardItem}>
                                <Lucide.Navigation
                                  className={styles.collectionCardIcon}
                                  aria-hidden="true"
                                />
                                <div>
                                  <span className={styles.collectionCardLabel}>
                                    Endereço
                                  </span>
                                  <p className={styles.collectionCardAddress}>
                                    {location.address}
                                  </p>
                                </div>
                              </div>
                            </CardComponent.CardContent>
                          </CardComponent.CardBody>

                          {location.googleMapsUrl && (
                            <CardComponent.CardFooter
                              className={styles.cardFooter}
                            >
                              <ButtonLink
                                href={location.googleMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="secondary"
                                emphasis="soft"
                                size="sm"
                                leftIcon={<Lucide.MapPinHouse size={16} aria-hidden="true" />}
                                rightIcon={<Lucide.ArrowUpRight size={16} aria-hidden="true" />}
                                className={styles.mapLink}
                                aria-label={`Abrir ${location.name || location.neighborhood} no Google Maps`}
                              >
                                Abrir no Google Maps
                              </ButtonLink>
                            </CardComponent.CardFooter>
                          )}
                        </CardComponent.Card>
                      ))}
                    </div>

                    {hasMorePoints && (
                      <div className={styles.loadMore}>
                        <Button
                          type="button"
                          variant="outline"
                          leftIcon={
                            <Lucide.Plus size={18} aria-hidden="true" />
                          }
                          onClick={() =>
                            setVisibleCount(
                              (count) => count + INITIAL_VISIBLE_POINTS,
                            )
                          }
                        >
                          Mostrar mais pontos
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          <PageFeedback pageId="tampinhas" />
        </section>
      </div>
    </>
  );
}
