import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { CircleAlert, Plus, Dog, Search } from "lucide-react";
import { Badge } from "@jaci/ui/Badge";
import { Button } from "@jaci/ui/Button";
import { Input } from "@jaci/ui/Field";
import { EmptyState } from "@jaci/ui/EmptyState";
import { getDogs, archiveDog } from "../../services/dogs";
import { DogCard } from "../../components/DogCard";
import { AdoptionModal } from "../../components/AdoptionModal";
import { ErrorModal } from "../../components/ErrorModal";
import { SuccessModal } from "../../components/SuccessModal";
import { Pagination } from "@jaci/ui/Pagination";
import type { DogProps } from "../../types/dogs";
import styles from "./DogDashboard.module.css";

const ITEMS_PER_PAGE = 9; // Cachorros por página

export default function DogDashboard() {
  const navigate = useNavigate();

  const [dogs, setDogs] = useState<DogProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [dogToProcess, setDogToProcess] = useState<{id: number, nome: string} | null>(null);
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
        if (active) setDogs([...data].sort((a, b) => b.id - a.id));
      })
      .catch(() => {
        if (active) setLoadError("Não foi possível carregar os cachorros.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reloadToken]);

  const filteredDogs = useMemo(() => {
    return dogs.filter(dog =>
      dog.nome.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [dogs, searchTerm]);

  const totalPages = Math.ceil(filteredDogs.length / ITEMS_PER_PAGE);
  const visiblePage = Math.min(currentPage, Math.max(totalPages, 1));
  const currentDogs = filteredDogs.slice(
    (visiblePage - 1) * ITEMS_PER_PAGE,
    visiblePage * ITEMS_PER_PAGE
  );

  function openAdoptionModal(id: number, nome: string) {
    setDogToProcess({ id, nome });
  }

  async function confirmRemoval(adoptedViaSite: boolean) {
    if (!dogToProcess || isProcessingDog) return;
    const selectedDog = dogToProcess;
    setIsProcessingDog(true);

    try {
      await archiveDog(selectedDog.id, adoptedViaSite);

      setDogs(prev => prev.filter(dog => dog.id !== selectedDog.id));

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

    } catch {
      setDogToProcess(null);
      setOperationError("Não foi possível finalizar a jornada do animal.");
    } finally {
      setIsProcessingDog(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: "2rem", paddingBottom: "4rem" }}>
      <header className={styles.pageHeader}>
        <h1 className={styles.title}>Cachorros</h1>
        <p className={styles.subtitle}>
          Consulte, cadastre e atualize os animais disponíveis para adoção.
        </p>
      </header>

      <div className={styles.topBar}>

        <div className={styles.searchWrapper}>
          <Search size={20} aria-hidden="true" />
          <Input
            type="text"
            aria-label="Buscar cachorro por nome"
            placeholder="Buscar por nome..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className={styles.actionsRight}>
           <Badge variant="outline">{filteredDogs.length} cães</Badge>
           <Button onClick={() => navigate("/admin/dog/new")} className={styles.addButton}>
            <Plus size={20} /> Novo
          </Button>
        </div>
      </div>

      {loading && (
        <div className={styles.loadingState}>
          <p>Carregando cachorros...</p>
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

      {!loading && !loadError && filteredDogs.length === 0 && (
        <EmptyState
          size="lg"
          icon={<Dog />}
          title={searchTerm
            ? `Nenhum cachorro encontrado para "${searchTerm}"`
            : "Nenhum cachorro cadastrado ainda."}
          actions={!searchTerm && (
            <Button variant="text" onClick={() => navigate("/admin/dog/new")}>Cadastre o primeiro</Button>
          )}
        />
      )}

      {!loading && !loadError && currentDogs.length > 0 && (
        <>
          <div className={styles.grid}>
            {currentDogs.map((dog, index) => (
              <DogCard
                key={dog.id}
                dog={dog}
                onArchive={openAdoptionModal}
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

      <AdoptionModal
        isOpen={!!dogToProcess}
        onClose={() => setDogToProcess(null)}
        onConfirm={confirmRemoval}
        dogName={dogToProcess?.nome || ""}
        isSubmitting={isProcessingDog}
      />

      <ErrorModal
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
