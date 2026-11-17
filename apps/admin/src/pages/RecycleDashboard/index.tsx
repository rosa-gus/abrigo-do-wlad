import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { CircleAlert, Compass, Plus, MapPin, Pencil, Trash2, Map, RefreshCw } from "lucide-react";
import { Badge } from "@jaci/ui/Badge";
import { Button, ButtonLink } from "@jaci/ui/Button";
import { Card, CardBody, CardContent, CardFooter } from "@jaci/ui/Card";
import { Separator } from "@jaci/ui/Separator";
import { EmptyState } from "@jaci/ui/EmptyState";
import { getRecyclePointsPage, deleteRecyclePoint } from "../../services/recycle";
import type { RecyclePoint } from "../../types/recycle";
import { ListingFilters } from "../../components/ListingFilters";
import { PUBLICATION_LABELS } from "../../../shared/entities";
import { DeleteModal } from "../../components/DeleteModal";
import { ErrorModal } from "../../components/ErrorModal";
import { Pagination } from "@jaci/ui/Pagination";
import styles from "./RecycleDashboard.module.css";
import containerStyles from "../DashboardContainer.module.css";

const ITEMS_PER_PAGE = 8;

export default function RecycleDashboard() {
  const navigate = useNavigate();

  const [points, setPoints] = useState<RecyclePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getRecyclePointsPage(nextCursor);
      setPoints(current => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch { setLoadError("Não foi possível carregar a próxima página. Tente novamente."); }
    finally { setLoadingMore(false); }
  }


  const [searchTerm, setSearchTerm] = useState("");
  const [publicationFilter, setPublicationFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pointToDelete, setPointToDelete] = useState<{id: string, name: string} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  // Carregar dados
  useEffect(() => {
    let active = true;

    getRecyclePointsPage()
      .then((page) => {
        const data = page.items;
        if (active) setNextCursor(page.nextCursor);
        if (active) {
          setPoints([...data].sort((a, b) =>
            a.zone.localeCompare(b.zone) || a.neighborhood.localeCompare(b.neighborhood)
          ));
        }
      })
      .catch(() => {
        if (active) setLoadError("Não foi possível carregar os pontos de coleta.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reloadToken]);

  // Filtragem
  const filteredPoints = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return points.filter(point =>
      (publicationFilter === "all" || point.publicationStatus === publicationFilter) && (
      point.neighborhood.toLowerCase().includes(term) ||
      point.zone.toLowerCase().includes(term) ||
      (point.name && point.name.toLowerCase().includes(term))
    ));
  }, [points, searchTerm, publicationFilter]);

  // Paginação
  const totalPages = Math.ceil(filteredPoints.length / ITEMS_PER_PAGE);
  const visiblePage = Math.min(currentPage, Math.max(totalPages, 1));
  const currentPoints = filteredPoints.slice(
    (visiblePage - 1) * ITEMS_PER_PAGE,
    visiblePage * ITEMS_PER_PAGE
  );

  function openDeleteModal(id: string, name: string) {
    setPointToDelete({ id, name });
  }

  async function confirmDelete() {
    if (!pointToDelete || isDeleting) return;
    const selectedPoint = pointToDelete;
    setIsDeleting(true);

    try {
      await deleteRecyclePoint(selectedPoint.id, points.find(point => point.id === selectedPoint.id)?.revision);
      setPoints(prev => prev.filter(p => p.id !== selectedPoint.id));
      setPointToDelete(null);
    } catch (cause) {
      setPointToDelete(null);
      setOperationError(cause instanceof Error ? cause.message : "Não foi possível excluir o ponto de coleta.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className={containerStyles.container} style={{ paddingTop: "2rem", paddingBottom: "4rem" }}>
      <header className={styles.pageHeader}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Pontos de Coleta</h1>
          <p className={styles.subtitle}>Gerencie os locais que recebem tampinhas em apoio ao abrigo.</p>
        </div>
        <Button type="button" onClick={() => navigate("/admin/recycle/new")} className={styles.addButton}>
          <Plus size={20} aria-hidden="true" /> Novo ponto
        </Button>
      </header>

      <ListingFilters
        searchLabel="Buscar ponto de coleta"
        searchPlaceholder="Zona, bairro ou nome..."
        searchValue={searchTerm}
        onSearchChange={value => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        publicationValue={publicationFilter}
        onPublicationChange={value => {
          setPublicationFilter(value);
          setCurrentPage(1);
        }}
        onClear={() => {
          setSearchTerm("");
          setPublicationFilter("all");
          setCurrentPage(1);
        }}
        totalItems={loading || loadError ? undefined : filteredPoints.length}
      />

      {loading && (
        <div className={styles.loadingState}>
          <p>Carregando pontos de coleta...</p>
        </div>
      )}

      {!loading && loadError && (
        <EmptyState
          role="alert"
          size="lg"
          icon={<CircleAlert />}
          title={loadError}
          actions={<Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw size={16} aria-hidden="true" />}
            onClick={() => {
              setLoading(true);
              setLoadError(null);
              setReloadToken(token => token + 1);
            }}
          >Tentar novamente</Button>}
        />
      )}

      {!loading && !loadError && filteredPoints.length === 0 && (
        <EmptyState
          size="lg"
          icon={<MapPin />}
          title={searchTerm
            ? `Nenhum ponto encontrado para "${searchTerm}"`
            : publicationFilter !== "all" ? "Nenhum ponto com este status." : "Nenhum ponto de coleta cadastrado ainda."}
          actions={!searchTerm && publicationFilter === "all" && (
            <Button variant="text" onClick={() => navigate("/admin/recycle/new")}>Cadastre o primeiro</Button>
          )}
        />
      )}

      {/* Lista de Pontos */}
      {!loading && !loadError && currentPoints.length > 0 && (
        <>
          <div className={styles.listContainer}>
            {currentPoints.map((point) => (
              <Card key={point.id} size="sm" className={styles.pointCard}>
                <CardBody className={styles.pointBody}>
                  <CardContent className={styles.pointInfo}>
                    <div className={styles.pointHeader}>
                      <h3 className={styles.pointNeighborhood}>{point.neighborhood || point.name}</h3>
                      <Badge variant={point.publicationStatus === "published" ? "success" : "outline"}>
                        {PUBLICATION_LABELS[point.publicationStatus]}
                      </Badge>
                    </div>
                    {point.name && point.neighborhood && <p className={styles.pointName}><strong>{point.name}</strong></p>}
                    {(point.zone || point.address) && (
                      <p className={styles.pointAddress}>
                        {point.zone && (
                          <span className={styles.pointZone}>
                            <Compass size={16} aria-hidden="true" />
                            <span>{point.zone.toLocaleLowerCase("pt-BR")}</span>
                          </span>
                        )}
                        {point.zone && point.address && <>
                          {" "}<Separator orientation="vertical" className={styles.addressSeparator} />{" "}
                        </>}
                        {point.address && (
                          <span className={styles.addressText}>
                            <MapPin size={16} aria-hidden="true" />
                            <span>{point.address}</span>
                          </span>
                        )}
                      </p>
                    )}
                  </CardContent>
                </CardBody>

                <Separator />
                <CardFooter className={styles.pointActions}>
                  {point.googleMapsUrl && (
                    <ButtonLink
                      variant="primary"
                      size="sm"
                      leftIcon={<Map size={16} />}
                      href={point.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.mapLink}
                      title="Abrir localização no Google Maps"
                    >
                      Ver no Mapa
                    </ButtonLink>
                  )}
                  <Button
                    variant="secondary"
                    emphasis="soft"
                    size="sm"
                    align="center"
                    leftIcon={<Pencil size={18} />}
                    onClick={() => navigate(`/admin/recycle/edit/${point.id}`)}
                    className={styles.editButton}
                    title="Editar"
                  >
                    Editar
                  </Button>

                  <Button
                    variant="danger"
                    size="icon-sm"
                    shape="circle"
                    aria-label={`Excluir ${point.name || point.neighborhood}`}
                    onClick={() => openDeleteModal(point.id as string, point.name || point.neighborhood)}
                    className={styles.deleteBtn}
                    title="Excluir"
                  >
                    <Trash2 size={18} />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          <Pagination
            currentPage={visiblePage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      )}

      {!loading && nextCursor && <div>
        <p>A busca e os filtros consideram os registros carregados.</p>
        <Button type="button" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? "Carregando..." : "Carregar mais registros"}
        </Button>
      </div>}

      <DeleteModal
        isOpen={!!pointToDelete}
        onClose={() => setPointToDelete(null)}
        onConfirm={confirmDelete}
        dogName={pointToDelete?.name || "este ponto de coleta"}
        isDeleting={isDeleting}
      />

      <ErrorModal
        onReload={() => window.location.reload()}
        isOpen={operationError !== null}
        onClose={() => setOperationError(null)}
        message={operationError ?? undefined}
      />
    </div>
  );
}
