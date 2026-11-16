import { useEffect, useRef, useState } from "react";
import { Button } from "@jaci/ui/Button";
import { Badge } from "@jaci/ui/Badge";
import { Card, CardBody, CardContent, CardFooter, CardHeader, CardTitle } from "@jaci/ui/Card";
import { Separator } from "@jaci/ui/Separator";
import { ConfirmModal } from "../../components/ConfirmModal";
import type { MigrationOverview, MigrationPreview, MigrationTarget, PreviewCursor } from "../../../shared/migrations";
import { applyMigrationBatch, getMigrations, planMigrationPage } from "../../services/migrations";
import styles from "./DeveloperOptions.module.css";

const labels = { pending: "Pendente", running: "Em andamento", failed: "Falhou", completed: "Concluída" };
const statusVariants = { pending: "outline", running: "secondary", failed: "danger", completed: "success" } as const;

export function MigrationsPanel() {
  const [overview, setOverview] = useState<MigrationOverview | null>(null);
  const [counts, setCounts] = useState<MigrationPreview["counts"]>([]);
  const [reviewed, setReviewed] = useState<MigrationTarget | null>(null);
  const [busy, setBusy] = useState<"loading" | "plan" | "apply" | null>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    getMigrations(controller.signal).then(setOverview).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível consultar as migrações.");
    }).finally(() => { if (!controller.signal.aborted) setBusy(null); });
    return () => { active.current?.abort(); };
  }, []);

  async function run(operation: "loading" | "plan" | "apply") {
    if (busy) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(operation);
    setError(null);
    setNotice(null);
    setConfirming(false);
    const target = reviewed;
    setReviewed(null);
    try {
      if (operation === "apply") {
        if (!target) throw new Error("Simule as migrações antes de aplicar.");
        for (;;) {
          const result = await applyMigrationBatch(target, controller.signal);
          if (controller.signal.aborted) return;
          setOverview(result);
          if (result.migrations.every(m => m.status === "completed")) break;
        }
        setNotice("Migrações concluídas. O histórico foi atualizado.");
      } else {
        const current = await getMigrations(controller.signal);
        if (controller.signal.aborted) return;
        setOverview(current);
        setCounts([]);
        if (operation === "plan") {
          let cursor: PreviewCursor | null = null;
          const totals = new Map<string, MigrationPreview["counts"][number]>();
          do {
            const page = await planMigrationPage(current, cursor, controller.signal);
            if (controller.signal.aborted) return;
            for (const count of page.counts) {
              const previous = totals.get(count.id) ?? { id: count.id, scanned: 0, changes: 0 };
              totals.set(count.id, { id: count.id, scanned: previous.scanned + count.scanned, changes: previous.changes + count.changes });
            }
            setCounts([...totals.values()]);
            cursor = page.cursor;
          } while (cursor);
          setReviewed(current);
          setNotice("Simulação concluída, sem gravar dados. Alterações posteriores serão conferidas na aplicação.");
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível continuar. Atualize o histórico antes de retomar.");
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  const pending = overview?.migrations.some(m => m.status !== "completed");
  const failed = overview?.migrations.some(m => m.status === "failed");
  const running = overview?.migrations.some(m => m.status === "running");
  const status = busy === "loading" ? "Consultando" : busy === "plan" ? "Simulando" : busy === "apply" ? "Aplicando"
    : error || failed ? "Requer atenção" : running ? "Execução iniciada" : pending ? "Migrações pendentes" : overview ? "Atualizado" : "Indisponível";
  return (
    <section className={styles.optionSection} aria-labelledby="migrations-title" aria-busy={busy !== null}>
      <Separator className={styles.optionSeparator} />
      <Card tone="muted" size="sm" className={styles.migrationController}>
        <CardBody>
          <CardHeader className={styles.migrationHeader}>
            <div>
              <CardTitle id="migrations-title">Migrações de dados</CardTitle>
              <p className={styles.optionDescription}>Consulte, simule e aplique as migrações no banco deste painel.</p>
            </div>
            <Badge variant={error || failed ? "danger" : !busy && overview && !pending ? "success" : "outline"} size="sm">{status}</Badge>
          </CardHeader>
          <CardContent className={styles.migrationContent}>
            {overview && <>
              <div className={styles.migrationTarget}>
                <Badge variant={overview.environment === "production" ? "primary" : "secondary"} size="sm">
                  {overview.environment === "production" ? "Produção" : overview.environment === "mock" ? "Simulado" : "Desenvolvimento"}
                </Badge>
                <span>Projeto: <strong>{overview.project}</strong></span>
                <span>Banco: {overview.database}</span>
              </div>
              <p>{overview.environment === "mock" ? "Este ambiente usa apenas dados simulados." : "As alterações são reais. Se fechar a página, retome pelo último lote confirmado. Não há rollback automático."}</p>
              <Separator />
              <ul className={styles.migrationList} aria-label="Migrações disponíveis">
                {overview.migrations.map((migration, index) => {
                  const count = counts.find(c => c.id === migration.id);
                  return <li key={migration.id}>
                    {index > 0 && <Separator />}
                    <div className={styles.migrationEntry}>
                      <div className={styles.migrationRowHeader}>
                        <h4>{migration.id}</h4>
                        <Badge variant={statusVariants[migration.status]} size="sm">{labels[migration.status]}</Badge>
                      </div>
                      <p>{migration.description}</p>
                      <p>
                        Histórico: {migration.scanned} examinados
                        {" "}<Separator orientation="vertical" />{" "}
                        {migration.changed} alterados
                        {" "}<Separator orientation="vertical" />{" "}
                        {migration.attempts} execuções
                      </p>
                      {count && <p>
                        Simulação: {count.scanned} examinados
                        {" "}<Separator orientation="vertical" />{" "}
                        {count.changes} alterações previstas
                      </p>}
                      {(migration.status === "running" || migration.status === "failed") && <p>Retome a partir do último lote confirmado.</p>}
                    </div>
                  </li>;
                })}
              </ul>
              {overview.migrations.length === 0 && <p>Nenhuma migração disponível nesta versão.</p>}
            </>}
            <div className={styles.migrationFeedback} aria-live="polite">
              {busy && <p role="status">{busy === "plan" ? "Simulando documentos, sem gravar..." : busy === "apply" ? "Aplicando em lotes. Aguarde a confirmação..." : "Consultando histórico..."}</p>}
              {error && <p className={styles.error} role="alert">{error}</p>}
              {notice && <p className={styles.notice}>{notice}</p>}
            </div>
          </CardContent>
        </CardBody>
        <Separator />
        <CardFooter className={styles.migrationActions}>
          <Button variant="outline" disabled={busy !== null} onClick={() => void run("loading")}>Atualizar histórico</Button>
          <Button variant="outline" disabled={busy !== null || !overview} onClick={() => void run("plan")}>Simular migrações</Button>
          <Button disabled={busy !== null || !reviewed || !pending} onClick={() => setConfirming(true)}>Aplicar / retomar</Button>
        </CardFooter>
      </Card>
      <ConfirmModal isOpen={confirming} onClose={() => setConfirming(false)} onConfirm={() => void run("apply")}
        title="Aplicar migrações neste banco?" tone="warning" confirmText="Aplicar migrações"
        message={<>Destino: <strong>{reviewed?.project}</strong> ({reviewed?.environment}), banco (default). Serão aplicadas ou retomadas as migrações pendentes: {overview?.migrations.filter(m => m.status !== "completed").map(m => m.id).join(", ")}. Os lotes confirmados serão persistidos imediatamente.</>} />
    </section>
  );
}
