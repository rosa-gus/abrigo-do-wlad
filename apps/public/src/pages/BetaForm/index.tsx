import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import * as Lucide from "lucide-react";

import { Button } from "@jaci/ui/Button";
import { EmptyState } from "@jaci/ui/EmptyState";
import {
  Card,
  CardBody,
  CardContent,
  CardIcon,
  CardTitle,
} from "@jaci/ui/Card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogHeading,
  DialogIcon,
  DialogTitle,
} from "@jaci/ui/Dialog";
import { SHELTER_FALLBACK_FORM_URL, SHELTER_INSTAGRAM_URL } from "@/utils/links";
import { WizardForm } from "./components/WizardForm";
import { WizardFormSkeleton } from "./components/WizardForm/WizardFormSkeleton";
import { ExternalLink } from "@/components/common/ExternalLink";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import dogSticker from "@/assets/stickers/fluent-emoji/dog.svg";
import starsSticker from "@/assets/stickers/fluent-emoji/stars.svg";
import beetleSticker from "@/assets/stickers/fluent-emoji/beetle.svg";

import styles from "./Form.module.css";

type FormError = { kind: "submission" | "storage"; message: string };

export default function BetaForm() {
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [formError, setFormError] = useState<FormError | null>(null);
  const setSubmissionError = useCallback((message: string) => setFormError({ kind: "submission", message }), []);
  const reportStorageError = useCallback((message: string) => setFormError({ kind: "storage", message }), []);
  const [successId, setSuccessId] = useState<string>("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [successWarning, setSuccessWarning] = useState<string | null>(null);
  const navigate = useNavigate();
  const { settings, loading: loadingSettings, error: settingsError, retry: retrySettings } = useSystemSettings();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (copyStatus !== "copied") return;
    const timeout = window.setTimeout(() => setCopyStatus("idle"), 2000);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const copyApplicationId = async () => {
    try {
      await navigator.clipboard.writeText(successId);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  return (
    <main>
      <Dialog
        open={formError !== null}
        onOpenChange={(open) => {
          if (!open) setFormError(null);
        }}
      >
        <DialogContent size="sm" className={styles.confirmationModal}>
          <DialogHeader>
            <DialogIcon tone="danger">
              <Lucide.CircleAlert />
            </DialogIcon>
            <DialogHeading>
              <DialogTitle>
                {formError?.kind === "storage" ? "Não foi possível salvar o preenchimento"
                    : "Não foi possível enviar"}
              </DialogTitle>
              <DialogDescription>{formError?.message}</DialogDescription>
            </DialogHeading>
          </DialogHeader>
          {formError?.kind === "submission" && (
            <DialogBody>
              <p>Suas respostas continuam disponíveis nesta aba.</p>
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => {
              setFormError(null);
            }}>
              {formError?.kind === "storage" ? "Continuar nesta aba" : "Voltar ao formulário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={showSuccessDialog}
        onOpenChange={(open) => {
          if (!open) navigate("/");
        }}
      >
        <DialogContent size="md" className={styles.confirmationModal}>
          <DialogHeader className={styles.confirmationHeader}>
            <DialogIcon tone="success" className={styles.confirmationIcon}>
              <img
                className={styles.confirmationSticker}
                src={starsSticker}
                alt=""
                width={48}
                height={48}
              />
            </DialogIcon>
            <DialogHeading className={styles.confirmationHeading}>
              <DialogTitle>Formulário enviado com sucesso!</DialogTitle>
              <DialogDescription className={styles.confirmationDescription}>
                {successId && (
                  <span className={styles.applicationId}>
                    <span className={styles.applicationIdLabel}>ID da sua candidatura</span>
                    <button
                      type="button"
                      className={styles.copyApplicationId}
                      onClick={copyApplicationId}
                      aria-label={`Copiar ID da candidatura: ${successId}`}
                      title={successId}
                    >
                      <span>{successId}</span>
                      {copyStatus === "copied" ? (
                        <Lucide.Check size={16} aria-hidden="true" />
                      ) : (
                        <Lucide.Copy size={16} aria-hidden="true" />
                      )}
                    </button>
                    <span className={styles.copyStatus} role="status">
                      {copyStatus === "copied" && "ID copiado!"}
                      {copyStatus === "error" && "Não foi possível copiar. Selecione o ID e copie manualmente."}
                    </span>
                  </span>
                )}
                {successWarning && (
                  <span className={styles.submissionWarning} role="status">
                    {successWarning}
                  </span>
                )}
              </DialogDescription>
            </DialogHeading>
          </DialogHeader>
          <div className={styles.modalContent}>
            <p>
              A equipe de voluntários do Abrigo do Wlad vai analisar seu perfil
              com carinho. Entraremos em contato caso o perfil seja compatível.
            </p>
          </div>
          <DialogFooter className={styles.confirmationFooter}>
            <div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Em caso de dúvidas
              </span>
              <p>Estamos disponíveis em</p>
            </div>
            <div className={styles.modalContact}>
              <ExternalLink href={SHELTER_INSTAGRAM_URL}>
                <Button
                  size="md"
                  variant="secondary"
                  leftIcon={<Lucide.Instagram size={16} />}
                >
                  Instagram
                </Button>
              </ExternalLink>
              <ExternalLink href="mailto:abrigodowlad@gmail.com">
                <Button
                  size="md"
                  variant="secondary"
                  leftIcon={<Lucide.Mail size={16} />}
                >
                  E-mail
                </Button>
              </ExternalLink>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className={`container ${styles.formContainer}`}>
        <header className={styles.pageHeader}>
          <img
            className={styles.introSticker}
            src={dogSticker}
            alt=""
            width={64}
            height={64}
          />
          <h1>Intenção de adoção</h1>
          <p>Vamos conhecer você e sua rotina. Responda com atenção e sinceridade.</p>
        </header>
        {showSuccessDialog ? null : loadingSettings ? (
          <WizardFormSkeleton />
        ) : settingsError ? (
          <EmptyState
            icon={<Lucide.CircleAlert />}
            title="Não foi possível carregar o formulário"
            description={settingsError}
            headingLevel={2}
            size="lg"
            role="alert"
            actions={(
              <Button onClick={retrySettings} leftIcon={<Lucide.RotateCcw size={18} />}>
                Tentar novamente
              </Button>
            )}
          />
        ) : settings?.acceptingApplications === false ? (
          <EmptyState
            icon={<Lucide.Info />}
            title="Solicitações temporariamente pausadas"
            description={(
              <>
                No momento não estamos recebendo novas solicitações de adoção.
                Por favor, acompanhe nossas redes sociais para saber quando
                voltaremos a receber candidaturas!
              </>
            )}
            headingLevel={2}
            size="lg"
            actions={(
              <ExternalLink href={SHELTER_INSTAGRAM_URL}>
                <Button variant="secondary" leftIcon={<Lucide.Instagram />}>
                  Acompanhar no Instagram
                </Button>
              </ExternalLink>
            )}
          />
        ) : (
          <WizardForm
            onSubmitError={setSubmissionError}
            onStorageError={reportStorageError}
            onSubmitSuccess={({ applicationId, warning }) => {
              setFormError(null);
              setSuccessId(applicationId);
              setSuccessWarning(warning ?? null);
              setShowSuccessDialog(true);
            }}
          />
        )}
        <div className={styles.betaDisclaimer}>
          <Card variant="callout" tone="info" size="xs" layout="inline">
            <CardBody>
              <CardIcon>
                <img
                  className={styles.calloutSticker}
                  src={beetleSticker}
                  alt=""
                  width={32}
                  height={32}
                />
              </CardIcon>
              <CardTitle>Estamos aprimorando este formulário</CardTitle>
              <CardContent>
                <p>
                  Se encontrar algum problema, você pode usar o{" "}
                  <ExternalLink href={SHELTER_FALLBACK_FORM_URL} className={styles.betaFallbackLink}>
                    formulário alternativo
                    <Lucide.ArrowUpRight size={15} aria-hidden="true" />
                  </ExternalLink>
                </p>
              </CardContent>
            </CardBody>
          </Card>

          {import.meta.env.PUBLIC_DEV_TOOLS && (
            <div className={styles.betaTestAction}>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Lucide.Eye size={18} aria-hidden="true" />}
                onClick={() => {
                  setSuccessId("00000000-0000-4000-8000-000000000000");
                  setSuccessWarning(null);
                  setCopyStatus("idle");
                  setShowSuccessDialog(true);
                }}
              >
                Pré-visualizar confirmação
              </Button>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Lucide.CircleAlert size={18} aria-hidden="true" />}
                onClick={() => {
                  setSubmissionError("Não conseguimos conectar ao servidor. Verifique sua conexão e tente novamente.");
                }}
              >
                Pré-visualizar falha
              </Button>
              <Button
                size="sm"
                variant="success"
                leftIcon={<Lucide.TestTube size={18} />}
                onClick={async () => {
                  try {
                    const res = await fetch('/api/tests/email');
                    const body = await res.json();
                    alert(res.ok ? `Sucesso: ${body.message}` : `Erro: ${body.message}`);
                  } catch (e) {
                    alert('Falha na requisição. O servidor está rodando?');
                    console.error(e);
                  }
                }}
              >
                Testar e-mail de notificação
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
