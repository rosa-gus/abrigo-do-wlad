import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, CircleAlert, Search } from "lucide-react";
import { Badge } from "@jaci/ui/Badge";
import { Button } from "@jaci/ui/Button";
import { Input } from "@jaci/ui/Field";
import { EmptyState } from "@jaci/ui/EmptyState";
import { getDogs, restoreDog } from "../../services/dogs";
import type { DogProps } from "../../types/dogs";
import { ErrorModal } from "../../components/ErrorModal";
import styles from "./DogArchive.module.css";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : "—";
}

export default function DogArchive() {
  const [dogs, setDogs] = useState<DogProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    getDogs("archived")
      .then((data) => {
        if (active) setDogs([...data].sort((a, b) =>
          (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")
        ));
      })
      .catch(() => { if (active) setLoadError("Não foi possível carregar o arquivo."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadToken]);

  const filteredDogs = useMemo(() => dogs.filter((dog) =>
    dog.nome.toLocaleLowerCase("pt-BR").includes(searchTerm.toLocaleLowerCase("pt-BR"))
  ), [dogs, searchTerm]);

  async function restore(id: number) {
    if (restoringId !== null) return;
    setRestoringId(id);
    try {
      await restoreDog(id);
      setDogs((current) => current.filter((dog) => dog.id !== id));
    } catch {
      setOperationError("Não foi possível restaurar o cão.");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="container" style={{ paddingTop: "2rem", paddingBottom: "4rem" }}>
      <header className={styles.header}>
        <h1>Arquivo de cães</h1>
        <p>Consulte os cães fora do catálogo e restaure seus registros quando necessário.</p>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={20} aria-hidden="true" />
          <Input
            aria-label="Buscar cão arquivado por nome"
            placeholder="Buscar por nome..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <Badge variant="outline">{filteredDogs.length} arquivados</Badge>
      </div>

      {loading && <p className={styles.loading}>Carregando arquivo...</p>}
      {!loading && loadError && (
        <EmptyState
          role="alert"
          size="lg"
          icon={<CircleAlert color="var(--error)" />}
          title={loadError}
          actions={<Button variant="secondary" onClick={() => {
            setLoading(true);
            setLoadError(null);
            setReloadToken((value) => value + 1);
          }}>Tentar novamente</Button>}
        />
      )}
      {!loading && !loadError && filteredDogs.length === 0 && (
        <EmptyState
          size="lg"
          icon={<Archive />}
          title={searchTerm ? "Nenhum cão encontrado." : "Nenhum cão arquivado."}
        />
      )}
      {!loading && !loadError && filteredDogs.length > 0 && (
        <div className={styles.list}>
          {filteredDogs.map((dog) => (
            <article className={styles.item} key={dog.id}>
              <div className={styles.details}>
                <h2>{dog.nome}</h2>
                <p>{dog.archiveReason === "adopted_via_site" ? "Adotado pelo site" : "Outro motivo"}</p>
                <dl>
                  <div><dt>Arquivado em</dt><dd>{formatDate(dog.archivedAt)}</dd></div>
                  <div><dt>Elegível para limpeza após 30 dias</dt><dd>{formatDate(dog.purgeAfter)}</dd></div>
                  <div><dt>Responsável</dt><dd>{dog.archivedBy ?? "—"}</dd></div>
                </dl>
              </div>
              <Button
                variant="outline"
                disabled={restoringId !== null}
                onClick={() => void restore(dog.id)}
              >
                <ArchiveRestore size={18} />
                {restoringId === dog.id ? "Restaurando..." : "Restaurar"}
              </Button>
            </article>
          ))}
        </div>
      )}

      <ErrorModal
        isOpen={operationError !== null}
        onClose={() => setOperationError(null)}
        message={operationError ?? undefined}
      />
    </div>
  );
}
