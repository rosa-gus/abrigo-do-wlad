import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { CircleAlert, Plus, Dog, RefreshCw } from "lucide-react";
import { Button } from "@jaci/ui/Button";
import { EmptyState } from "@jaci/ui/EmptyState";
import { getDogs, archiveDog, deleteDraftDog, dogRouteId } from "../../services/dogs";
import { ListingFilters } from "../../components/ListingFilters";
import { ConfirmModal } from "../../components/ConfirmModal";
import { DogCard } from "../../components/DogCard";
import { AdoptionModal } from "../../components/AdoptionModal";
import { ErrorModal } from "../../components/ErrorModal";
import { SuccessModal } from "../../components/SuccessModal";
import { Pagination } from "@jaci/ui/Pagination";
import type { DogProps } from "../../types/dogs";
import styles from "./DogDashboard.module.css";
import containerStyles from "../DashboardContainer.module.css";

const ITEMS_PER_PAGE = 9; // Cachorros por página

export default function DogDashboard() {
  const navigate = useNavigate();

  const [dogs, setDogs] = useState<DogProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [publicationFilter, setPublicationFilter] = useState("all");
  const [draftToDelete, setDraftToDelete] = useState<DogProps | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [dogToProcess, setDogToProcess] = useState<DogProps | null>(null);
  const [isProcessingDog, setIsProcessingDog] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  // Controla a exibicão do SuccessModal
  const [successInfo, setSuccessInfo] = useState<{isOpen: boolean, title: string, message: string}>({
    isOpen: false,
    title: "",
    message: ""
  });

  useEffect(() => {
    let active = true;

    getDogs()
      .then((data) => {
        if (active) setDogs([...data].sort((a, b) =>
          (b.updatedAt ?? b.publishedAt ?? "").localeCompare(a.updatedAt ?? a.publishedAt ?? "")
          || b.documentId.localeCompare(a.documentId)
        ));
      })
      .catch(() => {
        if (active) setLoadError("Não foi possível carregar os cachorros.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reloadToken]);

  async function discardDraft() {
    if (!draftToDelete || isProcessingDog) return;
    setIsProcessingDog(true);
    try {
      await deleteDraftDog(dogRouteId(draftToDelete), draftToDelete.revision);
      setDogs(current => current.filter(dog => dog.documentId !== draftToDelete.documentId));
      setDraftToDelete(null);
    } catch (error) {
      setDraftToDelete(null);
      setOperationError(error instanceof Error ? error.message : "Não foi possível excluir o rascunho.");
    } finally {
      setIsProcessingDog(false);
    }
  }

  const filteredDogs = useMemo(() => {
    return dogs.filter(dog =>
      (publicationFilter === "all" || dog.publicationStatus === publicationFilter)
      && dog.nome.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [dogs, searchTerm, publicationFilter]);

  const totalPages = Math.ceil(filteredDogs.length / ITEMS_PER_PAGE);
  const visiblePage = Math.min(currentPage, Math.max(totalPages, 1));
  const currentDogs = filteredDogs.slice(
    (visiblePage - 1) * ITEMS_PER_PAGE,
    visiblePage * ITEMS_PER_PAGE
  );

  function openAdoptionModal(dog: DogProps) {
    setDogToProcess(dog);
  }

  async function confirmRemoval(adoptedViaSite: boolean) {
    if (!dogToProcess || isProcessingDog) return;
    const selectedDog = dogToProcess;
    setIsProcessingDog(true);

    try {
      await archiveDog(dogRouteId(selectedDog), adoptedViaSite, selectedDog.revision);

      setDogs(prev => prev.filter(dog => dog.documentId !== selectedDog.documentId));

      setDogToProcess(null);

      if (adoptedViaSite) {
        setSuccessInfo({
          isOpen: true,
          title: "Adoção Registrada!",
        message: "O animal foi arquivado e pode ser restaurado na página Arquivado."
        });
      } else {
        setSuccessInfo({
          isOpen: true,
          title: "Animal Arquivado",
        message: "O animal foi arquivado e pode ser restaurado na página Arquivado."
        });
      }

    } catch (error) {
      setDogToProcess(null);
      setOperationError(error instanceof Error ? error.message : "Não foi possível finalizar a jornada do animal.");
    } finally {
      setIsProcessingDog(false);
    }
  }

  return (
    <div className={containerStyles.container} style={{ paddingTop: "2rem", paddingBottom: "4rem" }}>
      <header className={styles.pageHeader}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Cachorros</h1>
          <p className={styles.subtitle}>Gerencie fichas publicadas e rascunhos dos animais.</p>
        </div>
        <Button type="button" onClick={() => navigate("/admin/dog/new")} className={styles.addButton}>
          <Plus size={20} aria-hidden="true" /> Novo cachorro
        </Button>
      </header>

      <ListingFilters
        searchLabel="Buscar por nome"
        searchPlaceholder="Buscar por nome..."
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
        totalItems={loading || loadError ? undefined : filteredDogs.length}
      />

      {loading && (
        <div className={styles.loadingState}>
          <p>Carregando cachorros...</p>
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

      {!loading && !loadError && filteredDogs.length === 0 && (
        <EmptyState
          size="lg"
          icon={<Dog />}
          title={searchTerm
            ? `Nenhum cachorro encontrado para "${searchTerm}"`
            : publicationFilter !== "all" ? "Nenhum cachorro com este status." : "Nenhum cachorro cadastrado ainda."}
          actions={!searchTerm && publicationFilter === "all" && (
            <Button variant="text" onClick={() => navigate("/admin/dog/new")}>Cadastre o primeiro</Button>
          )}
        />
      )}

      {!loading && !loadError && currentDogs.length > 0 && (
        <>
          <div className={styles.grid}>
            {currentDogs.map((dog, index) => (
              <DogCard
                key={dog.documentId}
                dog={dog}
                onArchive={openAdoptionModal}
                onDiscard={setDraftToDelete}
                priority={index < 3}
              />
            ))}
          </div>

          <Pagination
            currentPage={visiblePage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      )}

      <ConfirmModal isOpen={draftToDelete !== null} onClose={() => setDraftToDelete(null)}
        onConfirm={() => void discardDraft()} title="Excluir rascunho?"
        message={`Excluir a ficha de ${draftToDelete?.nome ?? "este cão"}? Esta ação não pode ser desfeita.`}
        confirmText="Excluir rascunho" isConfirming={isProcessingDog} isDestructive />

      <AdoptionModal
        isOpen={!!dogToProcess}
        onClose={() => setDogToProcess(null)}
        onConfirm={confirmRemoval}
        dogName={dogToProcess?.nome || ""}
        isSubmitting={isProcessingDog}
      />

      <ErrorModal
        onReload={() => window.location.reload()}
        isOpen={operationError !== null}
        onClose={() => setOperationError(null)}
        message={operationError ?? undefined}
      />

      <SuccessModal
        isOpen={successInfo.isOpen}
        onClose={() => setSuccessInfo(prev => ({ ...prev, isOpen: false }))}
        title={successInfo.title}
        message={successInfo.message}
      />
    </div>
  );
}
