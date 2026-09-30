import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { CircleAlert, Plus, Search, MapPin, Pencil, Trash2, Map } from "lucide-react";
import { Badge } from "@jaci/ui/Badge";
import { Button } from "@jaci/ui/Button";
import { Card, CardBody, CardContent, CardFooter } from "@jaci/ui/Card";
import { Input } from "@jaci/ui/Field";
import { EmptyState } from "@jaci/ui/EmptyState";
import { getRecyclePoints, deleteRecyclePoint } from "../../services/recycle";
import type { RecyclePoint } from "../../types/recycle";
import { DeleteModal } from "../../components/DeleteModal";
import { ErrorModal } from "../../components/ErrorModal";
import { Pagination } from "@jaci/ui/Pagination";
import styles from "./RecycleDashboard.module.css";

const ITEMS_PER_PAGE = 8;

export default function RecycleDashboard() {
  const navigate = useNavigate();

  const [points, setPoints] = useState<RecyclePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pointToDelete, setPointToDelete] = useState<{id: string, name: string} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  // Carregar dados
  useEffect(() => {
    let active = true;

    getRecyclePoints()
      .then((data) => {
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
      point.neighborhood.toLowerCase().includes(term) ||
      point.zone.toLowerCase().includes(term) ||
      (point.name && point.name.toLowerCase().includes(term))
    );
  }, [points, searchTerm]);

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
      await deleteRecyclePoint(selectedPoint.id);
      setPoints(prev => prev.filter(p => p.id !== selectedPoint.id));
      setPointToDelete(null);
    } catch {
      setPointToDelete(null);
      setOperationError("Não foi possível excluir o ponto de coleta.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: "2rem", paddingBottom: "4rem" }}>
      <header className={styles.pageHeader}>
        <h1 className={styles.title}>Pontos de Coleta</h1>
        <p className={styles.subtitle}>
          Gerencie os locais que recebem tampinhas em apoio ao abrigo.
        </p>
      </header>

      <div className={styles.topBar}>

        <div className={styles.searchWrapper}>
          <Search size={20} aria-hidden="true" />
          <Input
            type="text"
            aria-label="Buscar ponto de coleta"
            placeholder="Buscar por zona, bairro ou nome..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className={styles.actionsRight}>
           <Badge variant="outline">{filteredPoints.length} pontos</Badge>
           <Button onClick={() => navigate("/admin/recycle/new")} className={styles.addButton}>
            <Plus size={20} /> Novo Ponto
          </Button>
        </div>
      </div>

      {loading && (
        <div className={styles.loadingState}>
          <p>Carregando pontos de coleta...</p>
        </div>
      )}

      {!loading && loadError && (
        <EmptyState
          role="alert"
          size="lg"
          icon={<CircleAlert color="var(--error)" />}
          title={loadError}
          actions={<Button
            type="button"
            variant="secondary"
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
            : "Nenhum ponto de coleta cadastrado ainda."}
          actions={!searchTerm && (
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
                      <Badge variant="secondary">{point.zone}</Badge>
                      <h3 className={styles.pointNeighborhood}>{point.neighborhood}</h3>
                    </div>
                    {point.name && <p className={styles.pointName}><strong>{point.name}</strong></p>}
                    <p className={styles.pointAddress}>{point.address}</p>

                    {point.googleMapsUrl && (
                      <a
                        href={point.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.mapLink}
                        title="Abrir localização no Google Maps"
                      >
                        <Map size={16} /> Ver no Mapa
                      </a>
                    )}
                  </CardContent>
                </CardBody>

                <CardFooter className={styles.pointActions}>
                  <Button
                    variant="outline"
                    size="sm"
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

      <DeleteModal
        isOpen={!!pointToDelete}
        onClose={() => setPointToDelete(null)}
        onConfirm={confirmDelete}
        dogName={pointToDelete?.name || "este ponto de coleta"}
        isDeleting={isDeleting}
      />

      <ErrorModal
        isOpen={operationError !== null}
        onClose={() => setOperationError(null)}
        message={operationError ?? undefined}
      />
    </div>
  );
}
